// Reference-sheet generator.
//
// Produces docs/sprite-reference.png — a labeled copy of the 14×4 unit sheet
// the user can keep open while editing real PNGs in their pixel editor. Run
// with `npm run gen-reference`.
//
// The sheet itself is the squire-player placeholder; the labels live in a
// 96-px left margin (row names) and a 64-px header (per-cell state + frame).

import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const OUT_PATH = resolve(ROOT, 'docs/sprite-reference.png');

// ─── Sheet layout (mirrors src/data/sprites.ts) ─────────────────────────────
const CELL_W = 32, CELL_H = 48;
const COLS = 14, ROWS = 4;
const SHEET_W = COLS * CELL_W;   // 448
const SHEET_H = ROWS * CELL_H;   // 192

// Margin sizes around the sheet area for labels.
const LEFT_MARGIN = 96;
const TOP_MARGIN  = 64;
const CANVAS_W = LEFT_MARGIN + SHEET_W;   // 544
const CANVAS_H = TOP_MARGIN  + SHEET_H;   // 256

const VIEWS = ['front', 'right', 'back', 'left'];

// Per-column header — short top line + bottom line (≤ 4 chars each so they
// fit in a 32-px cell at 5px-wide font + 1px gap).
const COL_HEADER = [
  /*  0 */ ['IDLE', '0'   ],
  /*  1 */ ['IDLE', '1'   ],
  /*  2 */ ['WALK', '0'   ],
  /*  3 */ ['WALK', '1'   ],
  /*  4 */ ['WALK', '2'   ],
  /*  5 */ ['ATK',  '0'   ],
  /*  6 */ ['ATK',  '1'   ],
  /*  7 */ ['ATK',  'HIT' ],   // ATTACK_IMPACT_FRAME = 2 (col 7)
  /*  8 */ ['ATK',  '3'   ],
  /*  9 */ ['HURT', ''    ],
  /* 10 */ ['KO',   ''    ],
  /* 11 */ ['RNG',  'DRAW'],
  /* 12 */ ['RNG',  'FIRE'],   // RANGED_IMPACT_FRAME = 1 (col 12)
  /* 13 */ ['RNG',  'REST'],
];

// ─── Palette ────────────────────────────────────────────────────────────────
const BG       = [16, 18, 28, 255];
const GRID     = [80, 90, 110, 255];
const LABEL    = [255, 224, 80, 255];
const SUBLABEL = [200, 210, 220, 255];

const TEAM     = { body: [91, 141, 239, 255], dark: [60, 100, 180, 255] };
const SKIN     = [243, 214, 168, 255];
const HAIR     = [50, 38, 34, 255];
const EYE      = [16, 16, 26, 255];
const WHITE    = [255, 255, 255, 255];

// ─── PNG helpers ────────────────────────────────────────────────────────────
function makeBuffer(w, h) { return { w, h, data: new Uint8Array(w * h * 4) }; }

function setPixel(buf, x, y, rgba) {
  if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return;
  const i = (y * buf.w + x) * 4;
  buf.data[i] = rgba[0]; buf.data[i + 1] = rgba[1];
  buf.data[i + 2] = rgba[2]; buf.data[i + 3] = rgba[3];
}

function fillRect(buf, x, y, w, h, rgba) {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) setPixel(buf, x + dx, y + dy, rgba);
}

function writePng(buf, path) {
  mkdirSync(dirname(path), { recursive: true });
  const png = new PNG({ width: buf.w, height: buf.h });
  png.data = Buffer.from(buf.data);
  writeFileSync(path, PNG.sync.write(png));
}

// ─── 5×5 uppercase + digit font ─────────────────────────────────────────────
const FONT = {
  A: ['01110','10001','11111','10001','10001'],
  B: ['11110','10001','11110','10001','11110'],
  C: ['01110','10000','10000','10000','01110'],
  D: ['11110','10001','10001','10001','11110'],
  E: ['11111','10000','11110','10000','11111'],
  F: ['11111','10000','11110','10000','10000'],
  G: ['01110','10000','10011','10001','01110'],
  H: ['10001','10001','11111','10001','10001'],
  I: ['11111','00100','00100','00100','11111'],
  K: ['10010','10100','11000','10100','10010'],
  L: ['10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10001','10001'],
  N: ['10001','11001','10101','10011','10001'],
  O: ['01110','10001','10001','10001','01110'],
  P: ['11110','10001','11110','10000','10000'],
  R: ['11110','10001','11110','10100','10010'],
  S: ['01110','10000','01110','00001','11110'],
  T: ['11111','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','01110'],
  V: ['10001','10001','10001','01010','00100'],
  W: ['10001','10001','10101','11011','10001'],
  X: ['10001','01010','00100','01010','10001'],
  Y: ['10001','01010','00100','00100','00100'],
  '0': ['01110','10011','10101','11001','01110'],
  '1': ['00100','01100','00100','00100','01110'],
  '2': ['11110','00001','00110','01000','11111'],
  '3': ['11110','00001','01110','00001','11110'],
  '4': ['10010','10010','11111','00010','00010'],
  '5': ['11111','10000','11110','00001','11110'],
  '6': ['01110','10000','11110','10001','01110'],
  '7': ['11111','00001','00010','00100','01000'],
  '8': ['01110','10001','01110','10001','01110'],
  '9': ['01110','10001','01111','00001','01110'],
};

function drawChar(buf, x, y, ch, color) {
  const g = FONT[ch];
  if (!g) return;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    if (g[r][c] === '1') setPixel(buf, x + c, y + r, color);
  }
}

function drawText(buf, x, y, text, color) {
  for (let i = 0; i < text.length; i++) drawChar(buf, x + i * 6, y, text[i].toUpperCase(), color);
}

function textWidth(text) { return text.length * 6 - 1; }

// ─── Squire-player placeholder cell (a thin port of generate-placeholder-art) ───
function drawCell(buf, cellCol, cellRow, view, state, frameInState) {
  const x0 = LEFT_MARGIN + cellCol * CELL_W;
  const y0 = TOP_MARGIN  + cellRow * CELL_H;

  if (state === 'ko') {
    fillRect(buf, x0 + 4,  y0 + 36, 24, 6, TEAM.dark);
    fillRect(buf, x0 + 22, y0 + 32, 6, 6, SKIN);
    return;
  }

  const bob = (state === 'idle' && frameInState === 1) ? -1 : 0;
  fillRect(buf, x0 + 8, y0 + 16 + bob, 16, 16, TEAM.body);
  fillRect(buf, x0 + 10, y0 + 4 + bob, 12, 14, SKIN);
  fillRect(buf, x0 + 10, y0 + 4 + bob, 12, 3, HAIR);

  if (view === 'front') {
    setPixel(buf, x0 + 13, y0 + 9 + bob, EYE);
    setPixel(buf, x0 + 14, y0 + 9 + bob, EYE);
    setPixel(buf, x0 + 17, y0 + 9 + bob, EYE);
    setPixel(buf, x0 + 18, y0 + 9 + bob, EYE);
  } else if (view === 'back') {
    fillRect(buf, x0 + 11, y0 + 6 + bob, 10, 2, HAIR);
  } else if (view === 'right') {
    setPixel(buf, x0 + 18, y0 + 9 + bob, EYE);
    setPixel(buf, x0 + 19, y0 + 9 + bob, EYE);
  } else {
    setPixel(buf, x0 + 12, y0 + 9 + bob, EYE);
    setPixel(buf, x0 + 13, y0 + 9 + bob, EYE);
  }

  let leftArmY = 18, rightArmY = 18;
  if (state === 'walk') {
    if (frameInState === 0) { leftArmY = 16; rightArmY = 20; }
    else if (frameInState === 2) { leftArmY = 20; rightArmY = 16; }
  } else if (state === 'attack') {
    if (frameInState === 0) rightArmY = 13;
    else if (frameInState === 1) rightArmY = 16;
    else if (frameInState === 2) rightArmY = 24;
    else rightArmY = 20;
  } else if (state === 'ranged') {
    if (frameInState === 0) rightArmY = 12;
    else if (frameInState === 1) rightArmY = 18;
    else rightArmY = 16;
  }
  fillRect(buf, x0 + 7,  y0 + leftArmY  + bob, 2, 10, TEAM.dark);
  fillRect(buf, x0 + 23, y0 + rightArmY + bob, 2, 10, TEAM.dark);
  if (state === 'ranged' && frameInState === 1) {
    fillRect(buf, x0 + 26, y0 + rightArmY + 3 + bob, 4, 1, TEAM.dark);
  }

  // Job initial 'S' for Squire
  drawChar(buf, x0 + 13, y0 + 22 + bob, 'S', WHITE);

  if (state === 'hurt') {
    for (let dy = 0; dy < CELL_H; dy++) {
      for (let dx = 0; dx < CELL_W; dx++) {
        const i = ((y0 + dy) * buf.w + (x0 + dx)) * 4;
        if (buf.data[i + 3] === 0) continue;
        buf.data[i]     = Math.min(255, buf.data[i] + 60);
        buf.data[i + 1] = Math.max(0,   buf.data[i + 1] - 30);
        buf.data[i + 2] = Math.max(0,   buf.data[i + 2] - 30);
      }
    }
  }
}

// Map a (state, col-index-in-sheet) to the frameInState (relative position).
const STATE_RANGES = [
  { state: 'idle',   first: 0,  count: 2 },
  { state: 'walk',   first: 2,  count: 3 },
  { state: 'attack', first: 5,  count: 4 },
  { state: 'hurt',   first: 9,  count: 1 },
  { state: 'ko',     first: 10, count: 1 },
  { state: 'ranged', first: 11, count: 3 },
];

function stateFor(col) {
  for (const r of STATE_RANGES) {
    if (col >= r.first && col < r.first + r.count) {
      return { state: r.state, frameInState: col - r.first };
    }
  }
  throw new Error(`unhandled col ${col}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────
function main() {
  const buf = makeBuffer(CANVAS_W, CANVAS_H);
  fillRect(buf, 0, 0, CANVAS_W, CANVAS_H, BG);

  // Cells
  for (let row = 0; row < ROWS; row++) {
    const view = VIEWS[row];
    for (let col = 0; col < COLS; col++) {
      const { state, frameInState } = stateFor(col);
      drawCell(buf, col, row, view, state, frameInState);
    }
  }

  // Grid lines around every cell.
  for (let col = 0; col <= COLS; col++) {
    const x = LEFT_MARGIN + col * CELL_W;
    fillRect(buf, x, TOP_MARGIN, 1, SHEET_H, GRID);
  }
  for (let row = 0; row <= ROWS; row++) {
    const y = TOP_MARGIN + row * CELL_H;
    fillRect(buf, LEFT_MARGIN, y, SHEET_W, 1, GRID);
  }

  // Header: per-column labels (top + bottom line, both ≤ 4 chars).
  for (let col = 0; col < COLS; col++) {
    const [top, bot] = COL_HEADER[col];
    const cx = LEFT_MARGIN + col * CELL_W + Math.floor(CELL_W / 2);
    if (top) {
      const w = textWidth(top);
      drawText(buf, cx - Math.floor(w / 2), TOP_MARGIN - 36, top, LABEL);
    }
    if (bot) {
      const w = textWidth(bot);
      drawText(buf, cx - Math.floor(w / 2), TOP_MARGIN - 22, bot, SUBLABEL);
    }
    // "row index" tick at the very top of each column.
    const idxStr = String(col);
    const w = textWidth(idxStr);
    drawText(buf, cx - Math.floor(w / 2), TOP_MARGIN - 50, idxStr, GRID);
  }

  // Left margin: row labels.
  for (let row = 0; row < ROWS; row++) {
    const cy = TOP_MARGIN + row * CELL_H + Math.floor(CELL_H / 2) - 3;
    const text = VIEWS[row].toUpperCase();
    const w = textWidth(text);
    drawText(buf, LEFT_MARGIN - 12 - w, cy, text, LABEL);
  }

  // Title up top.
  drawText(buf, 6, 6, 'SPRITE REFERENCE 14X4', LABEL);
  drawText(buf, 6, 18, '32X48 PER CELL  4X14 = 448X192', SUBLABEL);

  writePng(buf, OUT_PATH);
  console.log(`wrote ${OUT_PATH}`);
}

main();
