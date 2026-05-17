/**
 * In-app sprite editor — a pixel-art editor for unit sheets.
 *
 * A unit sheet is a 448×192 PNG: a 14×4 grid of 32×48 cells (columns are
 * animation states, rows are facings — see SHEET_LAYOUT). The editor
 * holds the whole sheet on a master canvas; you pick a cell and paint it
 * magnified. Save writes a data-URL PNG to the custom-sprite store, so a
 * unit of that job/team renders with it immediately.
 *
 * A DOM overlay on `#hud`, in the same style as the map editor.
 */

import { SHEET_LAYOUT } from '../data/sprites';
import { JOB_DEFS } from '../data/jobs';
import { Team } from '../battle/Unit';
import {
  SHEET_WIDTH, SHEET_HEIGHT,
  loadCustomSprite, saveCustomSprite, exportSpritePng, importSprite,
} from '../core/CustomSprites';
import { goToScreen } from '../core/Screen';

const CW = SHEET_LAYOUT.cellW;   // 32
const CH = SHEET_LAYOUT.cellH;   // 48
const DRAW_PIXEL = 11;           // magnification of the draw canvas
const PICKER_SCALE = 1.5;        // magnification of the whole-sheet picker

/** Per-column animation-state label, derived from SHEET_LAYOUT.states. */
const COL_STATE: string[] = (() => {
  const out: string[] = new Array(SHEET_LAYOUT.cols).fill('');
  for (const [name, def] of Object.entries(SHEET_LAYOUT.states)) {
    for (const c of def.cols) out[c] = name;
  }
  return out;
})();
const ROW_FACING = ['front', 'right', 'back', 'left'];

const PALETTE = [
  '#000000', '#ffffff', '#d96363', '#5b8def', '#4fe07a', '#ffe14a',
  '#e0682f', '#8e6fc4', '#f3d6a8', '#6a6a6a',
];

export function showSpriteEditorScreen(): void {
  const root = document.getElementById('hud');
  if (!root) return;

  let jobId = Object.keys(JOB_DEFS)[0];
  let team: Team = 'player';
  let cellCol = 0;
  let cellRow = 0;
  let tool: 'pencil' | 'eraser' = 'pencil';
  let color = '#ffffff';

  // Master canvas — the single source of truth for the working sheet.
  const master = document.createElement('canvas');
  master.width = SHEET_WIDTH;
  master.height = SHEET_HEIGHT;
  const mctx = master.getContext('2d')!;
  mctx.imageSmoothingEnabled = false;

  // ── Overlay shell ─────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: absolute; inset: 0; background: #0a0a14;
    display: flex; flex-direction: column; align-items: center;
    gap: 12px; padding: 20px; box-sizing: border-box; overflow: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: #fff;
  `;
  overlay.appendChild(heading('SPRITE EDITOR'));

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.png,image/png';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    const dataUrl = await importSprite(f);
    if (dataUrl) { loadSheet(dataUrl); setStatus(`Imported sheet`); }
    else setStatus('Import failed — expected a 448×192 PNG');
  });
  overlay.appendChild(fileInput);

  // Sprite picker row.
  const jobSelect = document.createElement('select');
  jobSelect.style.cssText = inputCss('150px');
  for (const id of Object.keys(JOB_DEFS)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = JOB_DEFS[id].name;
    jobSelect.appendChild(opt);
  }
  jobSelect.value = jobId;
  jobSelect.addEventListener('change', () => { jobId = jobSelect.value; selectSprite(); });

  const teamBtn = button('', '#243c66', '#5b8def', () => {
    team = team === 'player' ? 'enemy' : 'player';
    teamBtn.textContent = `Team: ${team}`;
    selectSprite();
  });
  teamBtn.textContent = `Team: ${team}`;

  const pickerRow = rowBox();
  pickerRow.appendChild(tag('Sprite:'));
  pickerRow.appendChild(jobSelect);
  pickerRow.appendChild(teamBtn);
  overlay.appendChild(pickerRow);

  // Tool + palette row.
  const pencilBtn = button('Pencil', '#1a1f30', '#444', () => setTool('pencil'));
  const eraserBtn = button('Eraser', '#1a1f30', '#444', () => setTool('eraser'));
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = color;
  colorInput.style.cssText = 'width:36px;height:28px;padding:0;border:1px solid #444;background:#1a1f30;';
  colorInput.addEventListener('input', () => { color = colorInput.value; setTool('pencil'); });

  const toolRow = rowBox();
  toolRow.appendChild(pencilBtn);
  toolRow.appendChild(eraserBtn);
  toolRow.appendChild(colorInput);
  for (const swatch of PALETTE) {
    const s = document.createElement('button');
    s.style.cssText = `width:22px;height:22px;border:1px solid #444;background:${swatch};cursor:pointer;`;
    s.addEventListener('click', () => { color = swatch; colorInput.value = swatch; setTool('pencil'); });
    toolRow.appendChild(s);
  }
  overlay.appendChild(toolRow);

  function setTool(t: 'pencil' | 'eraser'): void {
    tool = t;
    pencilBtn.style.background = t === 'pencil' ? '#5b8def' : '#1a1f30';
    eraserBtn.style.background = t === 'eraser' ? '#5b8def' : '#1a1f30';
  }
  setTool('pencil');

  // ── Canvases: whole-sheet picker + magnified draw ─────────────────────────
  const picker = document.createElement('canvas');
  picker.width = SHEET_WIDTH * PICKER_SCALE;
  picker.height = SHEET_HEIGHT * PICKER_SCALE;
  picker.style.cssText = 'cursor:pointer;border:1px solid #333;';
  const pctx = picker.getContext('2d')!;
  pctx.imageSmoothingEnabled = false;
  picker.addEventListener('click', e => {
    const r = picker.getBoundingClientRect();
    cellCol = clamp(Math.floor((e.clientX - r.left) / (CW * PICKER_SCALE)), 0, SHEET_LAYOUT.cols - 1);
    cellRow = clamp(Math.floor((e.clientY - r.top) / (CH * PICKER_SCALE)), 0, SHEET_LAYOUT.rows - 1);
    repaint();
  });

  const draw = document.createElement('canvas');
  draw.width = CW * DRAW_PIXEL;
  draw.height = CH * DRAW_PIXEL;
  draw.style.cssText = 'cursor:crosshair;border:1px solid #333;';
  const dctx = draw.getContext('2d')!;
  dctx.imageSmoothingEnabled = false;
  let painting = false;
  const paintAt = (e: MouseEvent) => {
    const r = draw.getBoundingClientRect();
    const px = clamp(Math.floor((e.clientX - r.left) / DRAW_PIXEL), 0, CW - 1);
    const py = clamp(Math.floor((e.clientY - r.top) / DRAW_PIXEL), 0, CH - 1);
    const mx = cellCol * CW + px;
    const my = cellRow * CH + py;
    if (tool === 'eraser') {
      mctx.clearRect(mx, my, 1, 1);
    } else {
      mctx.fillStyle = color;
      mctx.fillRect(mx, my, 1, 1);
    }
    repaint();
  };
  draw.addEventListener('mousedown', e => { painting = true; paintAt(e); });
  draw.addEventListener('mousemove', e => { if (painting) paintAt(e); });
  window.addEventListener('mouseup', () => { painting = false; });

  const cellLabel = document.createElement('div');
  cellLabel.style.cssText = 'font-size:12px;opacity:0.75;';

  const canvasRow = rowBox();
  const pickerCol = document.createElement('div');
  pickerCol.style.cssText = 'display:flex;flex-direction:column;gap:4px;align-items:center;';
  pickerCol.appendChild(tag('Sheet — click a cell'));
  pickerCol.appendChild(picker);
  const drawCol = document.createElement('div');
  drawCol.style.cssText = 'display:flex;flex-direction:column;gap:4px;align-items:center;';
  drawCol.appendChild(cellLabel);
  drawCol.appendChild(draw);
  canvasRow.appendChild(pickerCol);
  canvasRow.appendChild(drawCol);
  overlay.appendChild(canvasRow);

  // Status + footer.
  const statusEl = document.createElement('div');
  statusEl.style.cssText = 'font-size:12px;color:#9be6a8;height:14px;';
  overlay.appendChild(statusEl);
  function setStatus(s: string): void { statusEl.textContent = s; }

  const footer = rowBox();
  footer.appendChild(button('Save', '#1f4a2e', '#4fe07a', () => {
    saveCustomSprite(jobId, team, master.toDataURL('image/png'));
    setStatus(`Saved ${jobId} (${team})`);
  }));
  footer.appendChild(button('Battle', '#243c66', '#5b8def', () => {
    saveCustomSprite(jobId, team, master.toDataURL('image/png'));
    goToScreen('battle');
  }));
  footer.appendChild(button('Export', '#2a2a36', '#9a9aa0',
    () => exportSpritePng(`${jobId}_${team}`, master.toDataURL('image/png'))));
  footer.appendChild(button('Import', '#2a2a36', '#9a9aa0', () => fileInput.click()));
  footer.appendChild(button('Main Menu', '#2a2a36', '#9a9aa0', () => goToScreen('menu')));
  overlay.appendChild(footer);

  // ── Painting / loading ────────────────────────────────────────────────────

  function repaint(): void {
    cellLabel.textContent = `${ROW_FACING[cellRow]} · ${COL_STATE[cellCol] || '—'} (col ${cellCol})`;

    // Picker: the whole sheet, scaled, with a cell grid and selection.
    pctx.clearRect(0, 0, picker.width, picker.height);
    pctx.drawImage(master, 0, 0, picker.width, picker.height);
    pctx.strokeStyle = 'rgba(255,255,255,0.18)';
    pctx.lineWidth = 1;
    for (let c = 0; c <= SHEET_LAYOUT.cols; c++) {
      const x = c * CW * PICKER_SCALE;
      pctx.beginPath(); pctx.moveTo(x, 0); pctx.lineTo(x, picker.height); pctx.stroke();
    }
    for (let r = 0; r <= SHEET_LAYOUT.rows; r++) {
      const y = r * CH * PICKER_SCALE;
      pctx.beginPath(); pctx.moveTo(0, y); pctx.lineTo(picker.width, y); pctx.stroke();
    }
    pctx.strokeStyle = '#ffe14a';
    pctx.lineWidth = 2;
    pctx.strokeRect(cellCol * CW * PICKER_SCALE, cellRow * CH * PICKER_SCALE,
      CW * PICKER_SCALE, CH * PICKER_SCALE);

    // Draw canvas: a transparency checker, the magnified cell, a pixel grid.
    for (let py = 0; py < CH; py++) {
      for (let px = 0; px < CW; px++) {
        dctx.fillStyle = (px + py) % 2 ? '#2a2a2a' : '#363642';
        dctx.fillRect(px * DRAW_PIXEL, py * DRAW_PIXEL, DRAW_PIXEL, DRAW_PIXEL);
      }
    }
    dctx.drawImage(master, cellCol * CW, cellRow * CH, CW, CH,
      0, 0, CW * DRAW_PIXEL, CH * DRAW_PIXEL);
    dctx.strokeStyle = 'rgba(255,255,255,0.08)';
    dctx.lineWidth = 1;
    for (let px = 0; px <= CW; px++) {
      const x = px * DRAW_PIXEL;
      dctx.beginPath(); dctx.moveTo(x, 0); dctx.lineTo(x, draw.height); dctx.stroke();
    }
    for (let py = 0; py <= CH; py++) {
      const y = py * DRAW_PIXEL;
      dctx.beginPath(); dctx.moveTo(0, y); dctx.lineTo(draw.width, y); dctx.stroke();
    }
  }

  function loadSheet(url: string): void {
    const img = new Image();
    img.onload = () => {
      mctx.clearRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);
      mctx.drawImage(img, 0, 0);
      repaint();
    };
    img.onerror = () => {
      mctx.clearRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);
      repaint();
    };
    img.src = url;
  }

  function selectSprite(): void {
    setStatus('');
    loadSheet(loadCustomSprite(jobId, team) ?? `/sprites/units/${jobId}_${team}.png`);
  }

  selectSprite();
  root.appendChild(overlay);
}

// ── DOM helpers ─────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function heading(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = 'font-size:20px;font-weight:900;letter-spacing:2px;color:#ffe14a;';
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

function button(label: string, bg: string, border: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText = `padding:7px 14px;font-family:inherit;font-size:12px;color:#fff;
    background:${bg};border:1px solid ${border};border-radius:4px;cursor:pointer;`;
  btn.addEventListener('click', onClick);
  return btn;
}
