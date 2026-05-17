/**
 * In-app map editor — a 2D top-down grid editor for custom battle maps.
 * Edits a working `MapData`: paint tile heights (terrain auto-derives),
 * place player/enemy spawns, resize, name. Save to the custom-map store,
 * Test (launch a battle on it), or Export/Import as JSON.
 *
 * A DOM overlay on `#hud`, in the same style as the roster/shop screens.
 * The 3D look is verified by Test, not previewed here.
 */

import { MapData, deriveTerrain } from '../battle/Map';
import { Terrain } from '../core/types';
import {
  loadCustomMaps, saveCustomMap, selectMapForBattle, exportMap, importMap,
  setEditorTestMap, takeEditorTestMap,
} from '../core/CustomMaps';
import { goToScreen } from '../core/Screen';
import { setBattleIsCampaign } from '../core/CampaignProgress';

type Tool = 'raise' | 'lower' | 'player' | 'enemy' | 'terrain';

const TERRAIN_COLOR: Record<string, string> = {
  grass: '#6aa84f', dirt: '#8b6f47', stone: '#9a9a9a', water: '#3f7fbf', sand: '#d6c896',
};
const TERRAINS: Terrain[] = ['grass', 'dirt', 'stone', 'water', 'sand'];
const HEIGHT_MIN = 0;
const HEIGHT_MAX = 6;

function blankMap(): MapData {
  const w = 8, h = 8;
  return {
    name: 'New Map', width: w, height: h,
    heights: Array.from({ length: h }, () => Array.from({ length: w }, () => 1)),
    spawns: { player: [[0, 3], [0, 4]], enemy: [[7, 3], [7, 4]] },
  };
}

export function showMapEditorScreen(): void {
  const root = document.getElementById('hud');
  if (!root) return;

  // Reopen the just-tested map for a seamless test → edit loop.
  const reopenName = takeEditorTestMap();
  const reopened = reopenName ? loadCustomMaps().find(m => m.name === reopenName) : undefined;
  let map = reopened ?? blankMap();
  let tool: Tool = 'raise';
  let terrainPaint: Terrain = 'grass';
  let status = reopened ? `Editing "${reopened.name}"` : '';

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: absolute; inset: 0; background: #0a0a14;
    display: flex; flex-direction: column; align-items: center;
    gap: 12px; padding: 20px; box-sizing: border-box; overflow: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: #fff;
  `;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    const imported = await importMap(f);
    if (imported) { map = imported; status = `Imported "${imported.name}"`; }
    else status = 'Import failed — invalid map JSON';
    render();
  });
  overlay.appendChild(fileInput);

  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;';
  overlay.appendChild(body);

  function resize(w: number, h: number): void {
    w = Math.max(2, Math.min(24, w));
    h = Math.max(2, Math.min(24, h));
    const heights: number[][] = [];
    for (let z = 0; z < h; z++) {
      const row: number[] = [];
      for (let x = 0; x < w; x++) row.push(map.heights[z]?.[x] ?? 1);
      heights.push(row);
    }
    if (map.terrains) {
      const terrains: string[][] = [];
      for (let z = 0; z < h; z++) {
        const row: string[] = [];
        for (let x = 0; x < w; x++) row.push(map.terrains[z]?.[x] ?? deriveTerrain(heights[z][x]));
        terrains.push(row);
      }
      map.terrains = terrains;
    }
    map.width = w; map.height = h; map.heights = heights;
    map.spawns.player = map.spawns.player.filter(([x, z]) => x < w && z < h);
    map.spawns.enemy = map.spawns.enemy.filter(([x, z]) => x < w && z < h);
  }

  /** Lazily build a full terrains override grid from the current heights. */
  function ensureTerrainGrid(): void {
    if (!map.terrains) {
      map.terrains = map.heights.map(row => row.map(h => deriveTerrain(h) as string));
    }
  }

  function applyTool(x: number, z: number): void {
    if (tool === 'raise') {
      map.heights[z][x] = Math.min(HEIGHT_MAX, map.heights[z][x] + 1);
    } else if (tool === 'lower') {
      map.heights[z][x] = Math.max(HEIGHT_MIN, map.heights[z][x] - 1);
    } else if (tool === 'terrain') {
      ensureTerrainGrid();
      map.terrains![z][x] = terrainPaint;
    } else {
      const mine = tool === 'player' ? map.spawns.player : map.spawns.enemy;
      const other = tool === 'player' ? map.spawns.enemy : map.spawns.player;
      const i = mine.findIndex(([sx, sz]) => sx === x && sz === z);
      if (i >= 0) {
        mine.splice(i, 1);
      } else {
        mine.push([x, z]);
        const j = other.findIndex(([sx, sz]) => sx === x && sz === z);
        if (j >= 0) other.splice(j, 1);
      }
    }
    render();
  }

  function render(): void {
    body.innerHTML = '';

    body.appendChild(heading('MAP EDITOR'));
    body.appendChild(mapListStrip());
    body.appendChild(controlsRow());
    body.appendChild(toolPalette());
    if (tool === 'terrain') body.appendChild(terrainRow());
    body.appendChild(grid());
    if (status) body.appendChild(statusLine(status));
    body.appendChild(footer());
  }

  // ── Sections ──────────────────────────────────────────────────────────────

  function mapListStrip(): HTMLDivElement {
    const strip = rowBox();
    strip.appendChild(tag('Maps:'));
    strip.appendChild(smallButton('+ New', '#1f4a2e', '#4fe07a', () => {
      map = blankMap(); status = ''; render();
    }));
    for (const m of loadCustomMaps()) {
      strip.appendChild(smallButton(m.name, '#243c66', '#5b8def', () => {
        map = m; status = `Editing "${m.name}"`; render();
      }));
    }
    return strip;
  }

  function controlsRow(): HTMLDivElement {
    const row = rowBox();
    const name = document.createElement('input');
    name.type = 'text';
    name.value = map.name;
    name.style.cssText = inputCss('160px');
    name.addEventListener('input', () => { map.name = name.value; });
    row.appendChild(tag('Name:'));
    row.appendChild(name);

    row.appendChild(tag('W:'));
    row.appendChild(sizeInput(map.width, v => { resize(v, map.height); render(); }));
    row.appendChild(tag('H:'));
    row.appendChild(sizeInput(map.height, v => { resize(map.width, v); render(); }));
    return row;
  }

  function toolPalette(): HTMLDivElement {
    const row = rowBox();
    const tools: [Tool, string][] = [
      ['raise', 'Raise'], ['lower', 'Lower'], ['terrain', 'Terrain'],
      ['player', 'Player Spawn'], ['enemy', 'Enemy Spawn'],
    ];
    for (const [t, label] of tools) {
      const active = t === tool;
      row.appendChild(smallButton(
        label,
        active ? '#5b8def' : '#1a1f30',
        active ? '#fff' : '#444',
        () => { tool = t; render(); },
      ));
    }
    return row;
  }

  function terrainRow(): HTMLDivElement {
    const row = rowBox();
    row.appendChild(tag('Paint:'));
    for (const t of TERRAINS) {
      const active = t === terrainPaint;
      const b = smallButton(t, TERRAIN_COLOR[t], active ? '#fff' : '#444', () => {
        terrainPaint = t; render();
      });
      if (active) b.style.fontWeight = '700';
      row.appendChild(b);
    }
    row.appendChild(smallButton('Auto Terrain', '#2a2a36', '#9a9aa0', () => {
      delete map.terrains;
      status = 'Terrain reset to height-derived';
      render();
    }));
    return row;
  }

  function grid(): HTMLDivElement {
    const g = document.createElement('div');
    g.style.cssText = `display:grid;gap:2px;grid-template-columns:repeat(${map.width},34px);`;
    for (let z = 0; z < map.height; z++) {
      for (let x = 0; x < map.width; x++) {
        g.appendChild(cell(x, z));
      }
    }
    return g;
  }

  function cell(x: number, z: number): HTMLDivElement {
    const h = map.heights[z][x];
    const isPlayer = map.spawns.player.some(([sx, sz]) => sx === x && sz === z);
    const isEnemy = map.spawns.enemy.some(([sx, sz]) => sx === x && sz === z);
    const c = document.createElement('div');
    const terrain = map.terrains?.[z]?.[x] ?? deriveTerrain(h);
    const border = isPlayer ? '#5b8def' : isEnemy ? '#d96363' : 'rgba(255,255,255,0.15)';
    c.style.cssText = `
      width:34px;height:34px;box-sizing:border-box;
      background:${TERRAIN_COLOR[terrain] ?? '#444'};
      border:2px solid ${border};
      display:flex;align-items:center;justify-content:center;
      font-size:12px;cursor:pointer;position:relative;
    `;
    c.textContent = String(h);
    if (isPlayer || isEnemy) {
      const badge = document.createElement('span');
      badge.textContent = isPlayer ? 'P' : 'E';
      badge.style.cssText = `
        position:absolute;top:0;left:2px;font-size:9px;font-weight:700;
        color:${isPlayer ? '#bcd4ff' : '#ffc8c8'};
      `;
      c.appendChild(badge);
    }
    c.addEventListener('click', () => applyTool(x, z));
    return c;
  }

  function footer(): HTMLDivElement {
    const row = rowBox();
    row.appendChild(bigButton('Save', '#1f4a2e', '#4fe07a', () => {
      saveCustomMap(map);
      status = `Saved "${map.name}"`;
      render();
    }));
    row.appendChild(bigButton('Test', '#243c66', '#5b8def', () => {
      saveCustomMap(map);
      selectMapForBattle(map);
      setEditorTestMap(map.name);  // so the roster screen can return here
      setBattleIsCampaign(false);  // a test is a gauntlet battle, not a campaign one
      goToScreen('battle');
    }));
    row.appendChild(bigButton('Export', '#2a2a36', '#9a9aa0', () => exportMap(map)));
    row.appendChild(bigButton('Import', '#2a2a36', '#9a9aa0', () => fileInput.click()));
    row.appendChild(bigButton('Main Menu', '#2a2a36', '#9a9aa0', () => goToScreen('menu')));
    return row;
  }

  render();
  root.appendChild(overlay);
}

// ── DOM helpers ─────────────────────────────────────────────────────────────

function heading(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = 'font-size:20px;font-weight:900;letter-spacing:2px;color:#ffe14a;';
  return el;
}

function statusLine(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = 'font-size:12px;color:#9be6a8;';
  return el;
}

function rowBox(): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;';
  return el;
}

function tag(text: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.textContent = text;
  el.style.cssText = 'font-size:12px;opacity:0.7;';
  return el;
}

function inputCss(width: string): string {
  return `padding:4px 6px;font-family:inherit;font-size:12px;color:#fff;
    background:#1a1f30;border:1px solid rgba(255,255,255,0.2);border-radius:3px;width:${width};`;
}

function sizeInput(value: number, onChange: (v: number) => void): HTMLInputElement {
  const el = document.createElement('input');
  el.type = 'number';
  el.value = String(value);
  el.style.cssText = inputCss('48px');
  el.addEventListener('change', () => {
    const v = parseInt(el.value, 10);
    if (Number.isFinite(v)) onChange(v);
  });
  return el;
}

function smallButton(label: string, bg: string, border: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText = `padding:4px 10px;font-family:inherit;font-size:11px;color:#fff;
    background:${bg};border:1px solid ${border};border-radius:3px;cursor:pointer;`;
  btn.addEventListener('click', onClick);
  return btn;
}

function bigButton(label: string, bg: string, border: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText = `padding:9px 18px;font-family:inherit;font-size:13px;color:#fff;
    background:${bg};border:1px solid ${border};border-radius:4px;cursor:pointer;`;
  btn.addEventListener('click', onClick);
  return btn;
}
