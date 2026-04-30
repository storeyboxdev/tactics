/**
 * Single source of truth for the unit sprite-sheet convention.
 *
 * Each unit sheet is a grid of fixed-size cells: 4 rows (one per relative-view
 * facing) × 11 columns (animation frames, grouped by state). Total sheet size
 * is `cellW * cols` × `cellH * rows` = 352 × 192 px.
 *
 *                col 0   col 1   col 2  col 3  col 4   col 5  col 6  col 7  col 8   col 9   col 10
 *                ─── idle ───   ────── walk ──────   ─────────── attack ──────────  hurt    ko
 *   row 0 front
 *   row 1 right
 *   row 2 back
 *   row 3 left
 *
 * The placeholder generator (scripts/generate-placeholder-art.mjs) duplicates
 * these values — keep them in sync if you change cell size or column ranges.
 */

export type AnimStateName = 'idle' | 'walk' | 'attack' | 'hurt' | 'ko';

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
  cols: 11,

  /** Row index per relative view — matches UnitRenderer's existing FRAME_* ids. */
  rowOf: { front: 0, right: 1, back: 2, left: 3 } as const,

  states: {
    idle:   { cols: [0, 1],          frameTime: 0.40, loop: true  },
    walk:   { cols: [2, 3, 4],       frameTime: 0.15, loop: true  },
    attack: { cols: [5, 6, 7, 8],    frameTime: 0.10, loop: false },
    hurt:   { cols: [9],             frameTime: 0.30, loop: false },
    ko:     { cols: [10],            frameTime: 99.0, loop: true  },
  } satisfies Record<AnimStateName, AnimStateDef>,
} as const;

/** Frame index (0..N-1) within an attack at which the hit "lands" on the target. */
export const ATTACK_IMPACT_FRAME = 2;
