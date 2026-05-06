/**
 * Generic-job catalog for the FFT-style class system.
 *
 * Every job is listed up-front so the unlock-tree UI (post-MVP) can render the
 * full graph immediately. The four MVP jobs (Squire, Chemist, Knight, Black
 * Mage) have populated `learnableActives`; the rest will fill in as their
 * abilities are implemented.
 *
 * Reaction / Support / Movement abilities are a separate ability category that
 * isn't wired through ActionResolver yet (M9 ships only one reaction —
 * Counter — handled inline in resolveAttack). Those arrays stay empty until
 * the ability-slot system lands.
 *
 * Stats are decomposed into:
 *  - `baseStats` — display-equivalent values at the canonical raw baseline
 *    (hp 50, mp 10, pa 5, ma 5, speed 10). Used for enemy units (raw legacy
 *    path) and as the source of truth for `mult` calibration.
 *  - `mult` — per-stat display multiplier ×raw/100. A starter unit with
 *    raw = canonical baseline displays `floor(raw × mult / 100) = baseStats`.
 *  - `growth` — % gain to each raw stat per overall level-up while in this
 *    job (FFT-style: Knight HP grows fast, Black Mage MA grows fast).
 *  - `move`/`jump`/`faith`/`bravery` — fixed per job (move/jump) or per-unit
 *    persistent (faith/bravery, stored on UnitProgression, seeded from job).
 */

export interface JobPrereq { jobId: string; level: number; }

export interface JobStats {
  hp: number; mp: number; pa: number; ma: number; speed: number;
  move: number; jump: number; faith: number; bravery: number;
  /** Class Evade %, 0–60ish. Subtracted from physical-hit chance. */
  evasion: number;
}

/** Per-stat display multiplier (× raw / 100). Move/jump/faith/bravery omitted. */
export interface JobMult {
  hp: number; mp: number; pa: number; ma: number; speed: number;
}

/** Per-stat raw growth (% per level-up while in this job). */
export interface JobGrowth {
  hp: number; mp: number; pa: number; ma: number; speed: number;
}

export interface JobDef {
  id: string;
  name: string;
  prereqs: JobPrereq[];
  baseStats: JobStats;
  mult: JobMult;
  growth: JobGrowth;
  learnableActives: string[];
  learnableReactions: string[];
  learnableSupports: string[];
  learnableMovements: string[];
}

/**
 * Canonical raw-stat baseline. A starter unit's raw stats equal this; each
 * job's `mult` scales it back into that job's `baseStats` on display. Tying
 * the baseline to `stat()` defaults keeps everything consistent.
 */
export const RAW_STAT_BASELINE = { hp: 50, mp: 10, pa: 5, ma: 5, speed: 10 };

const stat = (over: Partial<JobStats>): JobStats => ({
  hp: 50, mp: 10, pa: 5, ma: 5, speed: 10, move: 4, jump: 1, faith: 50, bravery: 50,
  evasion: 10,
  ...over,
});

const noAbilities = {
  learnableActives: [] as string[],
  learnableReactions: [] as string[],
  learnableSupports: [] as string[],
  learnableMovements: [] as string[],
};

export const JOB_DEFS: Record<string, JobDef> = {
  // ─── Tier 0: starter jobs (no prereqs) ────────────────────────────────────
  squire: {
    id: 'squire', name: 'Squire',
    prereqs: [],
    baseStats: stat({ hp: 55, pa: 5, ma: 4, bravery: 60, evasion: 5 }),
    mult:   { hp: 110, mp: 100, pa: 100, ma:  80, speed: 100 },
    growth: { hp:   6, mp:   3, pa:   5, ma:   4, speed:   1 },
    ...noAbilities,
  },
  chemist: {
    id: 'chemist', name: 'Chemist',
    prereqs: [],
    baseStats: stat({ hp: 45, mp: 16, pa: 4, ma: 4, evasion: 5 }),
    mult:   { hp:  90, mp: 160, pa:  80, ma:  80, speed: 100 },
    growth: { hp:   4, mp:   6, pa:   3, ma:   4, speed:   1 },
    ...noAbilities,
  },

  // ─── Tier 1: from Squire ──────────────────────────────────────────────────
  knight: {
    id: 'knight', name: 'Knight',
    prereqs: [{ jobId: 'squire', level: 2 }],
    baseStats: stat({ hp: 70, pa: 7, ma: 3, speed: 9, move: 3, faith: 40, bravery: 75, evasion: 5 }),
    mult:   { hp: 140, mp: 100, pa: 140, ma:  60, speed:  90 },
    growth: { hp:   9, mp:   2, pa:   7, ma:   2, speed:   1 },
    learnableActives: ['power_break', 'speed_break'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },
  archer: {
    id: 'archer', name: 'Archer',
    prereqs: [{ jobId: 'squire', level: 2 }],
    baseStats: stat({ pa: 6, ma: 3, speed: 11, jump: 2, evasion: 15 }),
    mult:   { hp: 100, mp: 100, pa: 120, ma:  60, speed: 110 },
    growth: { hp:   5, mp:   2, pa:   6, ma:   2, speed:   2 },
    learnableActives: ['charge_2'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },

  // ─── Tier 1: from Chemist ─────────────────────────────────────────────────
  white_mage: {
    id: 'white_mage', name: 'White Mage',
    prereqs: [{ jobId: 'chemist', level: 2 }],
    baseStats: stat({ mp: 24, pa: 3, ma: 7, speed: 9, move: 3, faith: 70 }),
    mult:   { hp: 100, mp: 240, pa:  60, ma: 140, speed:  90 },
    growth: { hp:   4, mp:   8, pa:   2, ma:   7, speed:   1 },
    learnableActives: ['cure', 'cura'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },
  black_mage: {
    id: 'black_mage', name: 'Black Mage',
    prereqs: [{ jobId: 'chemist', level: 2 }],
    baseStats: stat({ hp: 38, mp: 32, pa: 3, ma: 9, move: 3, faith: 80, bravery: 35 }),
    mult:   { hp:  76, mp: 320, pa:  60, ma: 180, speed: 100 },
    growth: { hp:   3, mp:   9, pa:   2, ma:   9, speed:   1 },
    learnableActives: ['fire', 'bolt', 'ice'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },

  // ─── Tier 2: physical branch ──────────────────────────────────────────────
  monk: {
    id: 'monk', name: 'Monk',
    prereqs: [{ jobId: 'knight', level: 2 }],
    baseStats: stat({ hp: 60, mp: 8, pa: 8, ma: 3, speed: 11, jump: 2, evasion: 15 }),
    mult:   { hp: 120, mp:  80, pa: 160, ma:  60, speed: 110 },
    growth: { hp:   9, mp:   2, pa:   9, ma:   2, speed:   2 },
    learnableActives: ['wave_fist', 'chakra'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },
  thief: {
    id: 'thief', name: 'Thief',
    prereqs: [{ jobId: 'archer', level: 2 }],
    baseStats: stat({ hp: 45, mp: 8, pa: 5, ma: 3, speed: 13, move: 5, jump: 3, evasion: 30 }),
    mult:   { hp:  90, mp:  80, pa: 100, ma:  60, speed: 130 },
    growth: { hp:   4, mp:   2, pa:   5, ma:   2, speed:   3 },
    ...noAbilities,
  },

  // ─── Tier 2: magic branch ─────────────────────────────────────────────────
  time_mage: {
    id: 'time_mage', name: 'Time Mage',
    prereqs: [{ jobId: 'black_mage', level: 2 }, { jobId: 'white_mage', level: 2 }],
    baseStats: stat({ hp: 40, mp: 28, pa: 3, ma: 8, move: 3, faith: 70 }),
    mult:   { hp:  80, mp: 280, pa:  60, ma: 160, speed: 100 },
    growth: { hp:   4, mp:   9, pa:   2, ma:   7, speed:   1 },
    learnableActives: ['haste', 'slow', 'stop'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },
  oracle: {
    id: 'oracle', name: 'Oracle',
    prereqs: [{ jobId: 'white_mage', level: 4 }],
    baseStats: stat({ hp: 42, mp: 26, pa: 3, ma: 8, speed: 9, move: 3, faith: 65 }),
    mult:   { hp:  84, mp: 260, pa:  60, ma: 160, speed:  90 },
    growth: { hp:   4, mp:   8, pa:   2, ma:   7, speed:   1 },
    learnableActives: ['sleep', 'poison_spell'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },

  // ─── Tier 3: physical specialists ─────────────────────────────────────────
  geomancer: {
    id: 'geomancer', name: 'Geomancer',
    prereqs: [{ jobId: 'monk', level: 4 }],
    baseStats: stat({ hp: 55, mp: 18, pa: 6, ma: 6, jump: 2, evasion: 15 }),
    mult:   { hp: 110, mp: 180, pa: 120, ma: 120, speed: 100 },
    growth: { hp:   6, mp:   5, pa:   5, ma:   5, speed:   1 },
    learnableActives: ['pebble_blast'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },
  lancer: {
    id: 'lancer', name: 'Lancer',
    prereqs: [{ jobId: 'knight', level: 4 }, { jobId: 'thief', level: 4 }],
    baseStats: stat({ hp: 65, mp: 12, pa: 7, ma: 3, speed: 9, jump: 4, evasion: 5 }),
    mult:   { hp: 130, mp: 120, pa: 140, ma:  60, speed:  90 },
    growth: { hp:   8, mp:   3, pa:   7, ma:   2, speed:   1 },
    ...noAbilities,
  },

  // ─── Tier 3: magic specialists ────────────────────────────────────────────
  mediator: {
    id: 'mediator', name: 'Mediator',
    prereqs: [{ jobId: 'oracle', level: 2 }],
    baseStats: stat({ hp: 45, mp: 20, pa: 4, ma: 5 }),
    mult:   { hp:  90, mp: 200, pa:  80, ma: 100, speed: 100 },
    growth: { hp:   5, mp:   6, pa:   3, ma:   5, speed:   1 },
    ...noAbilities,
  },
  summoner: {
    id: 'summoner', name: 'Summoner',
    prereqs: [{ jobId: 'time_mage', level: 2 }],
    baseStats: stat({ hp: 38, mp: 36, pa: 3, ma: 10, speed: 9, move: 3, faith: 75 }),
    mult:   { hp:  76, mp: 360, pa:  60, ma: 200, speed:  90 },
    growth: { hp:   3, mp:   9, pa:   2, ma:  10, speed:   1 },
    ...noAbilities,
  },

  // ─── Tier 4: elite ────────────────────────────────────────────────────────
  samurai: {
    id: 'samurai', name: 'Samurai',
    prereqs: [
      { jobId: 'knight', level: 4 }, { jobId: 'monk', level: 5 },
      { jobId: 'lancer', level: 2 }, { jobId: 'geomancer', level: 2 },
    ],
    baseStats: stat({ hp: 65, mp: 12, pa: 7, ma: 5, move: 3, bravery: 70, evasion: 5 }),
    mult:   { hp: 130, mp: 120, pa: 140, ma: 100, speed: 100 },
    growth: { hp:   8, mp:   4, pa:   7, ma:   5, speed:   1 },
    ...noAbilities,
  },
  ninja: {
    // Throw is a thin slice of the FFT Ninja kit — just one thrown weapon, no
    // dual-wield. The job's full identity (Throw subtypes, dual-wield support)
    // arrives later.
    id: 'ninja', name: 'Ninja',
    prereqs: [
      { jobId: 'archer', level: 4 }, { jobId: 'thief', level: 5 },
      { jobId: 'geomancer', level: 2 },
    ],
    baseStats: stat({ pa: 7, ma: 3, speed: 14, move: 5, jump: 3, evasion: 25 }),
    mult:   { hp: 100, mp: 100, pa: 140, ma:  60, speed: 140 },
    growth: { hp:   5, mp:   2, pa:   8, ma:   2, speed:   3 },
    learnableActives: ['throw_shuriken'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },
  calculator: {
    id: 'calculator', name: 'Calculator',
    prereqs: [
      { jobId: 'white_mage', level: 5 }, { jobId: 'black_mage', level: 5 },
      { jobId: 'time_mage', level: 4 }, { jobId: 'oracle', level: 4 },
    ],
    baseStats: stat({ hp: 40, mp: 24, pa: 3, ma: 7, speed: 8, move: 3 }),
    mult:   { hp:  80, mp: 240, pa:  60, ma: 140, speed:  80 },
    growth: { hp:   3, mp:   8, pa:   2, ma:   8, speed:   1 },
    ...noAbilities,
  },

  // ─── Tier 5: gendered & mime (deepest unlocks) ────────────────────────────
  bard: {
    id: 'bard', name: 'Bard',
    prereqs: [{ jobId: 'summoner', level: 4 }, { jobId: 'mediator', level: 4 }],
    baseStats: stat({ mp: 22, pa: 4, ma: 6, speed: 9 }),
    mult:   { hp: 100, mp: 220, pa:  80, ma: 120, speed:  90 },
    growth: { hp:   4, mp:   7, pa:   3, ma:   6, speed:   1 },
    ...noAbilities,
  },
  dancer: {
    id: 'dancer', name: 'Dancer',
    prereqs: [{ jobId: 'geomancer', level: 4 }, { jobId: 'mediator', level: 4 }],
    baseStats: stat({ mp: 22, pa: 4, ma: 6, speed: 9, evasion: 20 }),
    mult:   { hp: 100, mp: 220, pa:  80, ma: 120, speed:  90 },
    growth: { hp:   5, mp:   5, pa:   6, ma:   4, speed:   1 },
    ...noAbilities,
  },
  mime: {
    id: 'mime', name: 'Mime',
    prereqs: [
      { jobId: 'squire', level: 8 }, { jobId: 'chemist', level: 8 },
      { jobId: 'knight', level: 4 }, { jobId: 'archer', level: 4 },
      { jobId: 'monk', level: 4 },   { jobId: 'thief',  level: 4 },
      { jobId: 'white_mage', level: 4 }, { jobId: 'black_mage', level: 4 },
      { jobId: 'time_mage',  level: 4 }, { jobId: 'oracle',     level: 4 },
      { jobId: 'geomancer',  level: 4 }, { jobId: 'lancer',     level: 4 },
      { jobId: 'mediator',   level: 4 }, { jobId: 'summoner',   level: 4 },
    ],
    baseStats: stat({ hp: 50, pa: 5, ma: 5 }),
    mult:   { hp: 100, mp: 100, pa: 100, ma: 100, speed: 100 },
    growth: { hp:   5, mp:   5, pa:   5, ma:   5, speed:   1 },
    ...noAbilities,
  },
};
