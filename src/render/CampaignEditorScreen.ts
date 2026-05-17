/**
 * In-app campaign editor — authors `Campaign` data: an ordered list of
 * battles, each pinning a map, an enemy roster, an objective, and
 * optional intro/outro story. Save to the custom-campaign store, Play
 * (start the campaign and launch its first battle), or Export/Import
 * as JSON.
 *
 * A DOM overlay on `#hud`, in the same style as the map editor. Battles
 * are verified by Play, not previewed here.
 */

import { Campaign, CampaignBattle, StoryBeat } from '../data/campaigns';
import { BattleObjective } from '../battle/Objective';
import { BUILT_IN_MAPS } from '../data/maps';
import { JOB_DEFS } from '../data/jobs';
import { loadCustomMaps } from '../core/CustomMaps';
import {
  loadCustomCampaigns, saveCustomCampaign, exportCampaign, importCampaign,
} from '../core/CustomCampaigns';
import { startCampaign, setBattleIsCampaign } from '../core/CampaignProgress';
import { goToScreen } from '../core/Screen';

const OBJECTIVE_KINDS: BattleObjective['kind'][] =
  ['rout', 'regicide', 'survive', 'protect', 'escort'];

function mapNames(): string[] {
  return [...BUILT_IN_MAPS.map(m => m.name), ...loadCustomMaps().map(m => m.name)];
}

function firstJob(): string {
  return Object.keys(JOB_DEFS)[0];
}

function blankBattle(): CampaignBattle {
  return {
    mapName: mapNames()[0] ?? '',
    enemies: [{ jobId: firstJob(), level: 1 }],
    objective: { kind: 'rout' },
  };
}

function blankCampaign(): Campaign {
  return { id: `custom_${Date.now()}`, name: 'New Campaign', battles: [blankBattle()] };
}

/** A fresh objective of the given kind, with sensible defaults. */
function objectiveOfKind(kind: BattleObjective['kind']): BattleObjective {
  switch (kind) {
    case 'survive': return { kind: 'survive', ticks: 60 };
    case 'escort': return { kind: 'escort', goalX: 0, goalZ: 0 };
    default: return { kind };
  }
}

export function showCampaignEditorScreen(): void {
  const root = document.getElementById('hud');
  if (!root) return;

  let campaign = blankCampaign();
  let selected = 0;
  let status = '';

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
    const imported = await importCampaign(f);
    if (imported) {
      campaign = imported;
      selected = 0;
      status = `Imported "${imported.name}"`;
    } else {
      status = 'Import failed — invalid campaign JSON';
    }
    render();
  });
  overlay.appendChild(fileInput);

  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;max-width:680px;';
  overlay.appendChild(body);

  function render(): void {
    body.innerHTML = '';
    body.appendChild(heading('CAMPAIGN EDITOR'));
    body.appendChild(campaignListStrip());
    body.appendChild(nameRow());
    body.appendChild(battleListSection());
    if (campaign.battles[selected]) body.appendChild(battlePanel(campaign.battles[selected]));
    if (status) body.appendChild(statusLine(status));
    body.appendChild(footer());
  }

  // ── Sections ────────────────────────────────────────────────────────────────

  function campaignListStrip(): HTMLDivElement {
    const strip = rowBox();
    strip.appendChild(tag('Campaigns:'));
    strip.appendChild(smallButton('+ New', '#1f4a2e', '#4fe07a', () => {
      campaign = blankCampaign();
      selected = 0;
      status = '';
      render();
    }));
    for (const c of loadCustomCampaigns()) {
      strip.appendChild(smallButton(c.name, '#243c66', '#5b8def', () => {
        campaign = c;
        selected = 0;
        status = `Editing "${c.name}"`;
        render();
      }));
    }
    return strip;
  }

  function nameRow(): HTMLDivElement {
    const row = rowBox();
    row.appendChild(tag('Name:'));
    const name = document.createElement('input');
    name.type = 'text';
    name.value = campaign.name;
    name.style.cssText = inputCss('220px');
    name.addEventListener('input', () => { campaign.name = name.value; });
    row.appendChild(name);
    return row;
  }

  function battleListSection(): HTMLDivElement {
    const box = document.createElement('div');
    box.style.cssText = 'display:flex;flex-direction:column;gap:4px;width:100%;';
    campaign.battles.forEach((b, i) => {
      const row = document.createElement('div');
      const active = i === selected;
      row.style.cssText = `
        display:flex;gap:6px;align-items:center;padding:5px 8px;border-radius:3px;
        background:${active ? '#243c66' : '#1a1f30'};
        border:1px solid ${active ? '#5b8def' : 'rgba(255,255,255,0.12)'};
      `;
      const label = document.createElement('span');
      label.textContent = `Battle ${i + 1} — ${b.mapName || '(no map)'} · ${b.objective.kind}`;
      label.style.cssText = 'flex:1;font-size:12px;cursor:pointer;';
      label.addEventListener('click', () => { selected = i; render(); });
      row.appendChild(label);
      row.appendChild(smallButton('↑', '#2a2a36', '#9a9aa0', () => moveBattle(i, -1)));
      row.appendChild(smallButton('↓', '#2a2a36', '#9a9aa0', () => moveBattle(i, 1)));
      row.appendChild(smallButton('Delete', '#4a1f1f', '#d96363', () => deleteBattle(i)));
      box.appendChild(row);
    });
    const add = smallButton('+ Add Battle', '#1f4a2e', '#4fe07a', () => {
      campaign.battles.push(blankBattle());
      selected = campaign.battles.length - 1;
      render();
    });
    const addRow = rowBox();
    addRow.appendChild(add);
    box.appendChild(addRow);
    return box;
  }

  function moveBattle(i: number, dir: number): void {
    const j = i + dir;
    if (j < 0 || j >= campaign.battles.length) return;
    const [b] = campaign.battles.splice(i, 1);
    campaign.battles.splice(j, 0, b);
    if (selected === i) selected = j;
    else if (selected === j) selected = i;
    render();
  }

  function deleteBattle(i: number): void {
    campaign.battles.splice(i, 1);
    if (selected >= campaign.battles.length) selected = campaign.battles.length - 1;
    render();
  }

  function battlePanel(battle: CampaignBattle): HTMLDivElement {
    const panel = document.createElement('div');
    panel.style.cssText = `
      display:flex;flex-direction:column;gap:10px;width:100%;
      padding:12px;box-sizing:border-box;
      background:#12151f;border:1px solid rgba(255,255,255,0.12);border-radius:4px;
    `;
    panel.appendChild(panelTitle(`Battle ${selected + 1}`));

    // Map
    const mapRow = rowBox();
    mapRow.appendChild(tag('Map:'));
    const names = mapNames();
    mapRow.appendChild(dropdown(
      names.map(n => ({ value: n, label: n })),
      battle.mapName,
      v => { battle.mapName = v; render(); },
    ));
    panel.appendChild(mapRow);

    // Objective
    const objRow = rowBox();
    objRow.appendChild(tag('Objective:'));
    objRow.appendChild(dropdown(
      OBJECTIVE_KINDS.map(k => ({ value: k, label: k })),
      battle.objective.kind,
      v => { battle.objective = objectiveOfKind(v as BattleObjective['kind']); render(); },
    ));
    if (battle.objective.kind === 'survive') {
      const obj = battle.objective;
      objRow.appendChild(tag('Ticks:'));
      const ticks = document.createElement('input');
      ticks.type = 'number';
      ticks.value = String(obj.ticks);
      ticks.style.cssText = inputCss('64px');
      ticks.addEventListener('change', () => {
        const v = parseInt(ticks.value, 10);
        if (Number.isInteger(v) && v >= 0) obj.ticks = v;
      });
      objRow.appendChild(ticks);
    }
    panel.appendChild(objRow);

    // Enemies
    panel.appendChild(panelTitle('Enemies'));
    battle.enemies.forEach((e, i) => {
      const row = rowBox();
      row.appendChild(dropdown(
        Object.keys(JOB_DEFS).map(k => ({ value: k, label: JOB_DEFS[k].name })),
        e.jobId,
        v => { e.jobId = v; },
      ));
      row.appendChild(tag('Lv'));
      const lvl = document.createElement('input');
      lvl.type = 'number';
      lvl.value = String(e.level);
      lvl.style.cssText = inputCss('56px');
      lvl.addEventListener('change', () => {
        const v = parseInt(lvl.value, 10);
        if (Number.isInteger(v) && v >= 1) e.level = v;
      });
      row.appendChild(lvl);
      row.appendChild(smallButton('Remove', '#4a1f1f', '#d96363', () => {
        battle.enemies.splice(i, 1);
        render();
      }));
      panel.appendChild(row);
    });
    const addEnemy = rowBox();
    addEnemy.appendChild(smallButton('+ Add Enemy', '#1f4a2e', '#4fe07a', () => {
      battle.enemies.push({ jobId: firstJob(), level: 1 });
      render();
    }));
    panel.appendChild(addEnemy);

    // Story
    panel.appendChild(panelTitle('Story'));
    panel.appendChild(beatEditor('Intro', battle.intro, beat => {
      if (beat) battle.intro = beat; else delete battle.intro;
    }));
    panel.appendChild(beatEditor('Outro', battle.outro, beat => {
      if (beat) battle.outro = beat; else delete battle.outro;
    }));
    return panel;
  }

  /** A speaker field + a lines textarea for an optional StoryBeat. */
  function beatEditor(
    label: string, beat: StoryBeat | undefined, onChange: (b: StoryBeat | undefined) => void,
  ): HTMLDivElement {
    const box = document.createElement('div');
    box.style.cssText = 'display:flex;flex-direction:column;gap:4px;width:100%;';

    const top = rowBox();
    top.appendChild(tag(`${label} speaker:`));
    const speaker = document.createElement('input');
    speaker.type = 'text';
    speaker.value = beat?.speaker ?? '';
    speaker.style.cssText = inputCss('160px');
    top.appendChild(speaker);
    box.appendChild(top);

    const lines = document.createElement('textarea');
    lines.value = (beat?.lines ?? []).join('\n');
    lines.placeholder = `${label} lines — one per line; leave blank for none`;
    lines.rows = 3;
    lines.style.cssText = `
      ${inputCss('100%')} resize:vertical;box-sizing:border-box;
    `;
    box.appendChild(lines);

    const commit = (): void => {
      const text = lines.value;
      if (text.trim() === '') { onChange(undefined); return; }
      const b: StoryBeat = { lines: text.split('\n') };
      if (speaker.value.trim() !== '') b.speaker = speaker.value;
      onChange(b);
    };
    speaker.addEventListener('input', commit);
    lines.addEventListener('input', commit);
    return box;
  }

  function footer(): HTMLDivElement {
    const row = rowBox();
    row.appendChild(bigButton('Save', '#1f4a2e', '#4fe07a', () => {
      saveCustomCampaign(campaign);
      status = `Saved "${campaign.name}"`;
      render();
    }));
    row.appendChild(bigButton('Play', '#243c66', '#5b8def', () => {
      saveCustomCampaign(campaign);
      startCampaign(campaign.id);
      setBattleIsCampaign(true);
      goToScreen('battle');
    }));
    row.appendChild(bigButton('Export', '#2a2a36', '#9a9aa0', () => exportCampaign(campaign)));
    row.appendChild(bigButton('Import', '#2a2a36', '#9a9aa0', () => fileInput.click()));
    row.appendChild(bigButton('Main Menu', '#2a2a36', '#9a9aa0', () => goToScreen('menu')));
    return row;
  }

  render();
  root.appendChild(overlay);
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function heading(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = 'font-size:20px;font-weight:900;letter-spacing:2px;color:#ffe14a;';
  return el;
}

function panelTitle(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = 'font-size:12px;font-weight:700;letter-spacing:1px;color:#9bb4e6;';
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
  el.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;';
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

function dropdown(
  options: { value: string; label: string }[], selected: string, onChange: (v: string) => void,
): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.style.cssText = inputCss('auto');
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    if (o.value === selected) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
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
