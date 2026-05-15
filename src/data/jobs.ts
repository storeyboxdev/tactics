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
  /** Signature weapon id (see WEAPONS) — drives basic-attack weaponPower. */
  weapon: string;
  /** Signature armor id (see ARMOR) — drives incoming-damage reduction. */
  armor: string;
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

// Every job now declares learnableActives explicitly. The legacy `noAbilities`
// helper was removed when Calculator was filled in — every JobDef should
// list its slots so adding a new ability is a one-line append.

export const JOB_DEFS: Record<string, JobDef> = {
  // ─── Tier 0: starter jobs (no prereqs) ────────────────────────────────────
  squire: {
    id: 'squire', name: 'Squire', weapon: 'dagger', armor: 'light_armor',
    prereqs: [],
    baseStats: stat({ hp: 55, pa: 5, ma: 4, bravery: 60, evasion: 5 }),
    mult:   { hp: 110, mp: 100, pa: 100, ma:  80, speed: 100 },
    growth: { hp:   6, mp:   3, pa:   5, ma:   4, speed:   1 },
    learnableActives: ['throw_stone', 'accumulate', 'yell'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },
  chemist: {
    id: 'chemist', name: 'Chemist', weapon: 'dagger', armor: 'clothes',
    prereqs: [],
    baseStats: stat({ hp: 45, mp: 16, pa: 4, ma: 4, evasion: 5 }),
    mult:   { hp:  90, mp: 160, pa:  80, ma:  80, speed: 100 },
    growth: { hp:   4, mp:   6, pa:   3, ma:   4, speed:   1 },
    learnableActives: ['phoenix_down', 'remedy', 'hi_potion', 'ether'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },

  // ─── Tier 1: from Squire ──────────────────────────────────────────────────
  knight: {
    id: 'knight', name: 'Knight', weapon: 'sword', armor: 'heavy_armor',
    prereqs: [{ jobId: 'squire', level: 2 }],
    baseStats: stat({ hp: 70, pa: 7, ma: 3, speed: 9, move: 3, faith: 40, bravery: 75, evasion: 5 }),
    mult:   { hp: 140, mp: 100, pa: 140, ma:  60, speed:  90 },
    growth: { hp:   9, mp:   2, pa:   7, ma:   2, speed:   1 },
    learnableActives: ['power_break', 'speed_break', 'magic_break', 'stasis_sword', 'lightning_stab'],
    learnableReactions: ['hp_restore'], learnableSupports: ['defense_up'], learnableMovements: [],
  },
  archer: {
    id: 'archer', name: 'Archer', weapon: 'bow', armor: 'light_armor',
    prereqs: [{ jobId: 'squire', level: 2 }],
    baseStats: stat({ pa: 6, ma: 3, speed: 11, jump: 2, evasion: 15 }),
    mult:   { hp: 100, mp: 100, pa: 120, ma:  60, speed: 110 },
    growth: { hp:   5, mp:   2, pa:   6, ma:   2, speed:   2 },
    learnableActives: ['aim_plus_1', 'charge_2', 'aim_plus_3'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },

  // ─── Tier 1: from Chemist ─────────────────────────────────────────────────
  white_mage: {
    id: 'white_mage', name: 'White Mage', weapon: 'staff', armor: 'robe',
    prereqs: [{ jobId: 'chemist', level: 2 }],
    baseStats: stat({ mp: 24, pa: 3, ma: 7, speed: 9, move: 3, faith: 70 }),
    mult:   { hp: 100, mp: 240, pa:  60, ma: 140, speed:  90 },
    growth: { hp:   4, mp:   8, pa:   2, ma:   7, speed:   1 },
    learnableActives: ['cure', 'cura', 'curaja', 'raise', 'reraise', 'regen', 'esuna', 'holy'],
    learnableReactions: [], learnableSupports: ['magic_defense_up'], learnableMovements: [],
  },
  black_mage: {
    id: 'black_mage', name: 'Black Mage', weapon: 'rod', armor: 'robe',
    prereqs: [{ jobId: 'chemist', level: 2 }],
    baseStats: stat({ hp: 38, mp: 32, pa: 3, ma: 9, move: 3, faith: 80, bravery: 35 }),
    mult:   { hp:  76, mp: 320, pa:  60, ma: 180, speed: 100 },
    growth: { hp:   3, mp:   9, pa:   2, ma:   9, speed:   1 },
    learnableActives: ['fire', 'bolt', 'ice', 'fire_2', 'bolt_2', 'ice_2', 'flare'],
    learnableReactions: [], learnableSupports: ['magic_attack_up'], learnableMovements: [],
  },

  // ─── Tier 2: physical branch ──────────────────────────────────────────────
  monk: {
    id: 'monk', name: 'Monk', weapon: 'knuckle', armor: 'light_armor',
    prereqs: [{ jobId: 'knight', level: 2 }],
    baseStats: stat({ hp: 60, mp: 8, pa: 8, ma: 3, speed: 11, jump: 2, evasion: 15 }),
    mult:   { hp: 120, mp:  80, pa: 160, ma:  60, speed: 110 },
    growth: { hp:   9, mp:   2, pa:   9, ma:   2, speed:   2 },
    learnableActives: ['wave_fist', 'earth_slash', 'chakra', 'stigma_magic', 'revive_monk'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },
  thief: {
    id: 'thief', name: 'Thief', weapon: 'dagger', armor: 'light_armor',
    prereqs: [{ jobId: 'archer', level: 2 }],
    baseStats: stat({ hp: 45, mp: 8, pa: 5, ma: 3, speed: 13, move: 5, jump: 3, evasion: 30 }),
    mult:   { hp:  90, mp:  80, pa: 100, ma:  60, speed: 130 },
    growth: { hp:   4, mp:   2, pa:   5, ma:   2, speed:   3 },
    learnableActives: ['mug', 'steal_heart'],
    learnableReactions: [], learnableSupports: [], learnableMovements: ['move_plus_2'],
  },

  // ─── Tier 2: magic branch ─────────────────────────────────────────────────
  time_mage: {
    id: 'time_mage', name: 'Time Mage', weapon: 'rod', armor: 'robe',
    prereqs: [{ jobId: 'black_mage', level: 2 }, { jobId: 'white_mage', level: 2 }],
    baseStats: stat({ hp: 40, mp: 28, pa: 3, ma: 8, move: 3, faith: 70 }),
    mult:   { hp:  80, mp: 280, pa:  60, ma: 160, speed: 100 },
    growth: { hp:   4, mp:   9, pa:   2, ma:   7, speed:   1 },
    learnableActives: ['haste', 'slow', 'stop'],
    learnableReactions: [], learnableSupports: [], learnableMovements: ['float'],
  },
  oracle: {
    id: 'oracle', name: 'Oracle', weapon: 'pole', armor: 'robe',
    prereqs: [{ jobId: 'white_mage', level: 4 }],
    baseStats: stat({ hp: 42, mp: 26, pa: 3, ma: 8, speed: 9, move: 3, faith: 65 }),
    mult:   { hp:  84, mp: 260, pa:  60, ma: 160, speed:  90 },
    growth: { hp:   4, mp:   8, pa:   2, ma:   7, speed:   1 },
    learnableActives: ['sleep', 'poison_spell', 'silence_song', 'paralyze', 'foxbird', 'berserk_touch', 'confuse', 'frog', 'petrify', 'zombie'],
    learnableReactions: [], learnableSupports: ['magic_defense_up'], learnableMovements: [],
  },

  // ─── Tier 3: physical specialists ─────────────────────────────────────────
  geomancer: {
    id: 'geomancer', name: 'Geomancer', weapon: 'pole', armor: 'light_armor',
    prereqs: [{ jobId: 'monk', level: 4 }],
    baseStats: stat({ hp: 55, mp: 18, pa: 6, ma: 6, jump: 2, evasion: 15 }),
    mult:   { hp: 110, mp: 180, pa: 120, ma: 120, speed: 100 },
    growth: { hp:   6, mp:   5, pa:   5, ma:   5, speed:   1 },
    learnableActives: ['pebble_blast', 'hell_ivy', 'local_quake', 'wind_slash', 'water_ball', 'will_o_wisp'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },
  lancer: {
    id: 'lancer', name: 'Lancer', weapon: 'spear', armor: 'heavy_armor',
    prereqs: [{ jobId: 'knight', level: 4 }, { jobId: 'thief', level: 4 }],
    baseStats: stat({ hp: 65, mp: 12, pa: 7, ma: 3, speed: 9, jump: 4, evasion: 5 }),
    mult:   { hp: 130, mp: 120, pa: 140, ma:  60, speed:  90 },
    growth: { hp:   8, mp:   3, pa:   7, ma:   2, speed:   1 },
    learnableActives: ['jump', 'high_jump', 'wide_jump'],
    learnableReactions: [], learnableSupports: [], learnableMovements: ['jump_plus_1', 'jump_plus_2'],
  },

  // ─── Tier 3: magic specialists ────────────────────────────────────────────
  mediator: {
    id: 'mediator', name: 'Mediator', weapon: 'gun', armor: 'clothes',
    prereqs: [{ jobId: 'oracle', level: 2 }],
    baseStats: stat({ hp: 45, mp: 20, pa: 4, ma: 5 }),
    mult:   { hp:  90, mp: 200, pa:  80, ma: 100, speed: 100 },
    growth: { hp:   5, mp:   6, pa:   3, ma:   5, speed:   1 },
    learnableActives: ['praise', 'insult', 'solution', 'preach', 'death_sentence', 'charm'],
    learnableReactions: [], learnableSupports: ['jp_up'], learnableMovements: [],
  },
  summoner: {
    id: 'summoner', name: 'Summoner', weapon: 'rod', armor: 'robe',
    prereqs: [{ jobId: 'time_mage', level: 2 }],
    baseStats: stat({ hp: 38, mp: 36, pa: 3, ma: 10, speed: 9, move: 3, faith: 75 }),
    mult:   { hp:  76, mp: 360, pa:  60, ma: 200, speed:  90 },
    growth: { hp:   3, mp:   9, pa:   2, ma:  10, speed:   1 },
    learnableActives: ['summon_ifrit', 'summon_shiva', 'summon_ramuh'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },

  // ─── Tier 4: elite ────────────────────────────────────────────────────────
  samurai: {
    id: 'samurai', name: 'Samurai', weapon: 'katana', armor: 'heavy_armor',
    prereqs: [
      { jobId: 'knight', level: 4 }, { jobId: 'monk', level: 5 },
      { jobId: 'lancer', level: 2 }, { jobId: 'geomancer', level: 2 },
    ],
    baseStats: stat({ hp: 65, mp: 12, pa: 7, ma: 5, move: 3, bravery: 70, evasion: 5 }),
    mult:   { hp: 130, mp: 120, pa: 140, ma: 100, speed: 100 },
    growth: { hp:   8, mp:   4, pa:   7, ma:   5, speed:   1 },
    learnableActives: ['asura', 'koutetsu', 'murasame', 'kiyomori', 'chirijiraden'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },
  ninja: {
    // Throw is a thin slice of the FFT Ninja kit — just one thrown weapon, no
    // dual-wield. The job's full identity (Throw subtypes, dual-wield support)
    // arrives later.
    id: 'ninja', name: 'Ninja', weapon: 'ninja_blade', armor: 'light_armor',
    prereqs: [
      { jobId: 'archer', level: 4 }, { jobId: 'thief', level: 5 },
      { jobId: 'geomancer', level: 2 },
    ],
    baseStats: stat({ pa: 7, ma: 3, speed: 14, move: 5, jump: 3, evasion: 25 }),
    mult:   { hp: 100, mp: 100, pa: 140, ma:  60, speed: 140 },
    growth: { hp:   5, mp:   2, pa:   8, ma:   2, speed:   3 },
    learnableActives: ['throw_shuriken', 'throw_knife', 'throw_spear', 'throw_bomb', 'poison_shuriken'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },
  calculator: {
    id: 'calculator', name: 'Calculator', weapon: 'staff', armor: 'robe',
    prereqs: [
      { jobId: 'white_mage', level: 5 }, { jobId: 'black_mage', level: 5 },
      { jobId: 'time_mage', level: 4 }, { jobId: 'oracle', level: 4 },
    ],
    baseStats: stat({ hp: 40, mp: 24, pa: 3, ma: 7, speed: 8, move: 3 }),
    mult:   { hp:  80, mp: 240, pa:  60, ma: 140, speed:  80 },
    growth: { hp:   3, mp:   8, pa:   2, ma:   8, speed:   1 },
    learnableActives: ['math_lvl_3', 'math_lvl_4', 'math_ct_5'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },

  // ─── Tier 5: gendered & mime (deepest unlocks) ────────────────────────────
  bard: {
    id: 'bard', name: 'Bard', weapon: 'instrument', armor: 'clothes',
    prereqs: [{ jobId: 'summoner', level: 4 }, { jobId: 'mediator', level: 4 }],
    baseStats: stat({ mp: 22, pa: 4, ma: 6, speed: 9 }),
    mult:   { hp: 100, mp: 220, pa:  80, ma: 120, speed:  90 },
    growth: { hp:   4, mp:   7, pa:   3, ma:   6, speed:   1 },
    learnableActives: ['cheer_song', 'angel_song', 'battle_song', 'magic_song'],
    learnableReactions: ['brave_up'], learnableSupports: [], learnableMovements: [],
  },
  dancer: {
    id: 'dancer', name: 'Dancer', weapon: 'cloth', armor: 'clothes',
    prereqs: [{ jobId: 'geomancer', level: 4 }, { jobId: 'mediator', level: 4 }],
    baseStats: stat({ mp: 22, pa: 4, ma: 6, speed: 9, evasion: 20 }),
    mult:   { hp: 100, mp: 220, pa:  80, ma: 120, speed:  90 },
    growth: { hp:   5, mp:   5, pa:   6, ma:   4, speed:   1 },
    learnableActives: ['slow_dance', 'polka_polka', 'witch_hunt', 'wiznaibus', 'disillusion'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },
  mime: {
    id: 'mime', name: 'Mime', weapon: 'knuckle', armor: 'clothes',
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
    learnableActives: ['mimic'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },
};
