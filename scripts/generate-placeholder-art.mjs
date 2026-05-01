// One-shot placeholder-art generator.
//
// Writes initial PNGs into public/sprites/{units,tiles}/ so the project ships
// with a working art set the user can immediately edit. Skips files that
// already exist — user edits are never overwritten. Run with `npm run gen-art`.
//
// Sheet layout MUST match src/data/sprites.ts. The shared constants are kept
// in sync by hand; if you change cell size or column ranges, update both.

import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const PUBLIC_SPRITES = resolve(ROOT, 'public/sprites');

// ─── Sheet layout (mirrors src/data/sprites.ts) ─────────────────────────────
const LAYOUT = {
  cellW: 32, cellH: 48,
  rows: 4, cols: 11,
  states: {
    idle:   { cols: [0, 1] },
    walk:   { cols: [2, 3, 4] },
    attack: { cols: [5, 6, 7, 8] },
    hurt:   { cols: [9] },
    ko:     { cols: [10] },
  },
};

const VIEWS = ['front', 'right', 'back', 'left'];

const TEAM_COLORS = {
  player: { body: [91, 141, 239, 255], dark: [60, 100, 180, 255] },
  enemy:  { body: [217, 99, 99, 255],  dark: [170, 60, 60, 255] },
};

const SKIN  = [243, 214, 168, 255];
const HAIR  = [50, 38, 34, 255];
const EYE   = [16, 16, 26, 255];
const WHITE = [255, 255, 255, 255];

const JOB_LETTER = { squire: 'S', chemist: 'C', knight: 'K', black_mage: 'M', time_mage: 'T', oracle: 'O' };
const JOBS  = Object.keys(JOB_LETTER);
const TEAMS = ['player', 'enemy'];

// ─── PNG helpers ────────────────────────────────────────────────────────────
function makeBuffer(w, h) {
  return { w, h, data: new Uint8Array(w * h * 4) };
}

function setPixel(buf, x, y, rgba) {
  if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return;
  const i = (y * buf.w + x) * 4;
  buf.data[i]     = rgba[0];
  buf.data[i + 1] = rgba[1];
  buf.data[i + 2] = rgba[2];
  buf.data[i + 3] = rgba[3];
}

function fillRect(buf, x, y, w, h, rgba) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) setPixel(buf, x + dx, y + dy, rgba);
  }
}

function writePng(buf, path) {
  mkdirSync(dirname(path), { recursive: true });
  const png = new PNG({ width: buf.w, height: buf.h });
  png.data = Buffer.from(buf.data);
  writeFileSync(path, PNG.sync.write(png));
}

// Tiny 5×5 bitmap font for the job letter on each unit's chest.
const FONT = {
  S: ['01110','10000','01110','00001','11110'],
  C: ['01110','10000','10000','10000','01110'],
  K: ['10010','10100','11000','10100','10010'],
  M: ['10001','11011','10101','10001','10001'],
  T: ['11111','00100','00100','00100','00100'],
  O: ['01110','10001','10001','10001','01110'],
};

function drawLetter(buf, x, y, letter, color) {
  const glyph = FONT[letter];
  if (!glyph) return;
  for (let r = 0; r < glyph.length; r++) {
    for (let c = 0; c < glyph[r].length; c++) {
      if (glyph[r][c] === '1') setPixel(buf, x + c, y + r, color);
    }
  }
}

// ─── Unit cell drawing ──────────────────────────────────────────────────────
function drawCell(buf, cellCol, cellRow, { view, state, frameInState, team, jobLetter }) {
  const x0 = cellCol * LAYOUT.cellW;
  const y0 = cellRow * LAYOUT.cellH;
  const colors = TEAM_COLORS[team];

  if (state === 'ko') {
    // Lying-down silhouette: horizontal body, head poking out one end.
    fillRect(buf, x0 + 4,  y0 + 36, 24, 6, colors.dark);
    fillRect(buf, x0 + 22, y0 + 32, 6, 6, SKIN);
    return;
  }

  // Subtle 1-pixel "breath" bob on idle frame 1
  const bob = (state === 'idle' && frameInState === 1) ? -1 : 0;

  // Body 16w × 16h (chest + torso) starting at (x0+8, y0+16+bob)
  fillRect(buf, x0 + 8, y0 + 16 + bob, 16, 16, colors.body);
  // Head 12w × 14h
  fillRect(buf, x0 + 10, y0 + 4 + bob, 12, 14, SKIN);
  // Hair cap
  fillRect(buf, x0 + 10, y0 + 4 + bob, 12, 3, HAIR);

  // Eyes / hair vary by view
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
  } else { // left
    setPixel(buf, x0 + 12, y0 + 9 + bob, EYE);
    setPixel(buf, x0 + 13, y0 + 9 + bob, EYE);
  }

  // Arm vertical positions vary by walk frame and attack frame
  let leftArmY = 18, rightArmY = 18;
  if (state === 'walk') {
    if (frameInState === 0) { leftArmY = 16; rightArmY = 20; }
    else if (frameInState === 2) { leftArmY = 20; rightArmY = 16; }
  } else if (state === 'attack') {
    // 4-frame swing: windup → mid → hit → recover
    if (frameInState === 0) rightArmY = 13;
    else if (frameInState === 1) rightArmY = 16;
    else if (frameInState === 2) rightArmY = 24;
    else rightArmY = 20;
  }
  fillRect(buf, x0 + 7,  y0 + leftArmY  + bob, 2, 10, colors.dark);
  fillRect(buf, x0 + 23, y0 + rightArmY + bob, 2, 10, colors.dark);

  // Job initial centered on chest
  drawLetter(buf, x0 + 13, y0 + 22 + bob, jobLetter, WHITE);

  // Hurt frame: shift the whole cell toward red.
  if (state === 'hurt') {
    for (let dy = 0; dy < LAYOUT.cellH; dy++) {
      for (let dx = 0; dx < LAYOUT.cellW; dx++) {
        const i = ((y0 + dy) * buf.w + (x0 + dx)) * 4;
        if (buf.data[i + 3] === 0) continue;
        buf.data[i]     = Math.min(255, buf.data[i] + 60);
        buf.data[i + 1] = Math.max(0,   buf.data[i + 1] - 30);
        buf.data[i + 2] = Math.max(0,   buf.data[i + 2] - 30);
      }
    }
  }
}

// ─── Tile textures ──────────────────────────────────────────────────────────
const TERRAIN_PALETTES = {
  grass: { top: [106, 168,  79, 255], topShade: [ 78, 130,  60, 255], side: [112,  78,  50, 255], sideDark: [ 80,  56,  36, 255] },
  dirt:  { top: [139, 111,  71, 255], topShade: [110,  86,  54, 255], side: [110,  86,  54, 255], sideDark: [ 80,  60,  38, 255] },
  stone: { top: [154, 154, 154, 255], topShade: [120, 120, 120, 255], side: [110, 110, 110, 255], sideDark: [ 80,  80,  80, 255] },
  water: { top: [ 63, 127, 191, 255], topShade: [ 90, 160, 220, 255], side: [ 50, 100, 150, 255], sideDark: [ 38,  78, 120, 255] },
  sand:  { top: [214, 200, 150, 255], topShade: [180, 165, 120, 255], side: [180, 160, 110, 255], sideDark: [140, 124,  84, 255] },
};

// Fast deterministic LCG so the noise is stable across runs.
function makeRng(seedStr) {
  let s = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    s ^= seedStr.charCodeAt(i);
    s = Math.imul(s, 16777619);
  }
  s = s & 0x7fffffff;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s;
  };
}

function makeTopTexture(terrain) {
  const buf = makeBuffer(32, 32);
  const p = TERRAIN_PALETTES[terrain];
  fillRect(buf, 0, 0, 32, 32, p.top);

  if (terrain === 'water') {
    // Diagonal wave bands
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        if (((x + y) % 8) < 2) setPixel(buf, x, y, p.topShade);
      }
    }
  } else {
    const rng = makeRng(terrain + '_top');
    const count = terrain === 'stone' ? 35 : 60;
    for (let i = 0; i < count; i++) {
      const x = rng() % 32;
      const y = rng() % 32;
      setPixel(buf, x, y, p.topShade);
    }
    if (terrain === 'grass') {
      // a few brighter highlights
      const bright = [140, 200, 100, 255];
      for (let i = 0; i < 20; i++) setPixel(buf, rng() % 32, rng() % 32, bright);
    }
  }
  return buf;
}

function makeSideTexture(terrain) {
  const buf = makeBuffer(32, 32);
  const p = TERRAIN_PALETTES[terrain];
  fillRect(buf, 0, 0, 32, 32, p.side);
  // Stratified bands suggest geological layers
  for (let y = 0; y < 32; y++) {
    if (y % 6 === 0) fillRect(buf, 0, y, 32, 1, p.sideDark);
  }
  const rng = makeRng(terrain + '_side');
  for (let i = 0; i < 30; i++) {
    setPixel(buf, rng() % 32, rng() % 32, p.sideDark);
  }
  return buf;
}

// ─── Main ───────────────────────────────────────────────────────────────────
function main() {
  let written = 0, skipped = 0;

  const sheetW = LAYOUT.cellW * LAYOUT.cols;
  const sheetH = LAYOUT.cellH * LAYOUT.rows;

  for (const job of JOBS) {
    for (const team of TEAMS) {
      const path = resolve(PUBLIC_SPRITES, `units/${job}_${team}.png`);
      if (existsSync(path)) { skipped++; console.log(`skip  ${path}`); continue; }
      const buf = makeBuffer(sheetW, sheetH);
      const jobLetter = JOB_LETTER[job];
      for (let row = 0; row < LAYOUT.rows; row++) {
        const view = VIEWS[row];
        for (const [state, def] of Object.entries(LAYOUT.states)) {
          for (let i = 0; i < def.cols.length; i++) {
            drawCell(buf, def.cols[i], row, { view, state, frameInState: i, team, jobLetter });
          }
        }
      }
      writePng(buf, path);
      written++;
      console.log(`write ${path}`);
    }
  }

  for (const terrain of Object.keys(TERRAIN_PALETTES)) {
    for (const face of ['top', 'side']) {
      const path = resolve(PUBLIC_SPRITES, `tiles/${terrain}_${face}.png`);
      if (existsSync(path)) { skipped++; console.log(`skip  ${path}`); continue; }
      const buf = face === 'top' ? makeTopTexture(terrain) : makeSideTexture(terrain);
      writePng(buf, path);
      written++;
      console.log(`write ${path}`);
    }
  }

  console.log(`\n${written} written, ${skipped} skipped.`);
}

main();
