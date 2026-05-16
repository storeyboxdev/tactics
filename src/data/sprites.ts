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
 * Per-job placeholder appearance — a distinct 2-char tag drawn on the
 * procedural unit sprite (the fallback when no PNG sheet is present).
 * Every JOB_DEFS job and monster has an entry; the renderer falls back
 * to '?' only for a genuinely unknown jobId.
 */
export const JOB_APPEARANCE: Record<string, { label: string }> = {
  // Player jobs.
  squire:     { label: 'Sq' },
  chemist:    { label: 'Cm' },
  knight:     { label: 'Kn' },
  archer:     { label: 'Ar' },
  white_mage: { label: 'WM' },
  black_mage: { label: 'BM' },
  monk:       { label: 'Mk' },
  thief:      { label: 'Tf' },
  time_mage:  { label: 'TM' },
  oracle:     { label: 'Or' },
  geomancer:  { label: 'Ge' },
  lancer:     { label: 'Ln' },
  mediator:   { label: 'Md' },
  summoner:   { label: 'Sm' },
  samurai:    { label: 'Sa' },
  ninja:      { label: 'Nj' },
  calculator: { label: 'Cl' },
  bard:       { label: 'Bd' },
  dancer:     { label: 'Dn' },
  mime:       { label: 'Mm' },
  // Monsters.
  goblin:       { label: 'Gb' },
  chocobo:      { label: 'Co' },
  red_panther:  { label: 'Pn' },
  bomb:         { label: 'Bo' },
  skeleton:     { label: 'Sk' },
  floating_eye: { label: 'Ey' },
};

/** Frame index (0..N-1) within an attack at which the hit "lands" on the target. */
export const ATTACK_IMPACT_FRAME = 2;
/** Frame index within ranged at which the projectile leaves the bow / fist. */
export const RANGED_IMPACT_FRAME = 1;
