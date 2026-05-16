/**
 * Single source of truth for the unit sprite-sheet convention.
 *
 * Each unit sheet is a grid of fixed-size cells: 4 rows (one per relative-view
 * facing) × 14 columns (animation frames, grouped by state). Total sheet size
 * is `cellW * cols` × `cellH * rows` = 448 × 192 px.
 *
 *                col 0   col 1   col 2  col 3  col 4   col 5  col 6  col 7  col 8   col 9   col 10  col 11  col 12  col 13
 *                ─── idle ───   ────── walk ──────   ─────────── attack ──────────  hurt    ko      ──── ranged: draw / release / recover ────
 *   row 0 front
 *   row 1 right
 *   row 2 back
 *   row 3 left
 *
 * The placeholder generator (scripts/generate-placeholder-art.mjs) duplicates
 * these values — keep them in sync if you change cell size or column ranges.
 */

export type AnimStateName = 'idle' | 'walk' | 'attack' | 'hurt' | 'ko' | 'ranged';

export interface AnimStateDef {
  /** Column indices inside the sheet for this state's frames, in order. */
  cols: readonly number[];
  /** Seconds per frame. */
  frameTime: number;
  /** True = looped (idle, walk, ko). False = one-shot, returns to idle. */
  loop: boolean;
}

export const SHEET_LAYOUT = {
  cellW: 32,
  cellH: 48,
  rows: 4,
  cols: 14,

  /** Row index per relative view — matches UnitRenderer's existing FRAME_* ids. */
  rowOf: { front: 0, right: 1, back: 2, left: 3 } as const,

  states: {
    idle:   { cols: [0, 1],          frameTime: 0.40, loop: true  },
    walk:   { cols: [2, 3, 4],       frameTime: 0.15, loop: true  },
    attack: { cols: [5, 6, 7, 8],    frameTime: 0.10, loop: false },
    hurt:   { cols: [9],             frameTime: 0.30, loop: false },
    ko:     { cols: [10],            frameTime: 99.0, loop: true  },
    ranged: { cols: [11, 12, 13],    frameTime: 0.10, loop: false },
  } satisfies Record<AnimStateName, AnimStateDef>,
} as const;

/**
 * Per-job placeholder appearance — a distinct 2-char tag and an accent
 * colour drawn on the procedural unit sprite (the fallback when no PNG
 * sheet is present). Every JOB_DEFS job and monster has an entry; the
 * renderer falls back to a default only for a genuinely unknown jobId.
 */
export const JOB_APPEARANCE: Record<string, { label: string; accent: string }> = {
  // Player jobs.
  squire:     { label: 'Sq', accent: '#c2a268' },
  chemist:    { label: 'Cm', accent: '#dfe4e8' },
  knight:     { label: 'Kn', accent: '#8893a8' },
  archer:     { label: 'Ar', accent: '#5a8f4e' },
  white_mage: { label: 'WM', accent: '#f0e8c0' },
  black_mage: { label: 'BM', accent: '#5a4a78' },
  monk:       { label: 'Mk', accent: '#cf7b3a' },
  thief:      { label: 'Tf', accent: '#3f7d5c' },
  time_mage:  { label: 'TM', accent: '#4a5a9c' },
  oracle:     { label: 'Or', accent: '#3f8f8f' },
  geomancer:  { label: 'Ge', accent: '#8a6b3f' },
  lancer:     { label: 'Ln', accent: '#4f6f9f' },
  mediator:   { label: 'Md', accent: '#8f4a4a' },
  summoner:   { label: 'Sm', accent: '#a84a8f' },
  samurai:    { label: 'Sa', accent: '#9c3f3f' },
  ninja:      { label: 'Nj', accent: '#3a3a44' },
  calculator: { label: 'Cl', accent: '#6f7f8f' },
  bard:       { label: 'Bd', accent: '#6fb0d0' },
  dancer:     { label: 'Dn', accent: '#d06f9f' },
  mime:       { label: 'Mm', accent: '#9a9aa0' },
  // Monsters — creature-flavoured accents.
  goblin:       { label: 'Gb', accent: '#6b8e23' },
  chocobo:      { label: 'Co', accent: '#e8c64a' },
  red_panther:  { label: 'Pn', accent: '#c0392b' },
  bomb:         { label: 'Bo', accent: '#e0682f' },
  skeleton:     { label: 'Sk', accent: '#e8e2cf' },
  floating_eye: { label: 'Ey', accent: '#8e6fc4' },
  treant:       { label: 'Tr', accent: '#5c6b2e' },
};

/** Appearance for a jobId with no JOB_APPEARANCE entry. */
export const DEFAULT_APPEARANCE = { label: '?', accent: '#f3d6a8' };

/** Frame index (0..N-1) within an attack at which the hit "lands" on the target. */
export const ATTACK_IMPACT_FRAME = 2;
/** Frame index within ranged at which the projectile leaves the bow / fist. */
export const RANGED_IMPACT_FRAME = 1;
