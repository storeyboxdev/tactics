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
 */

export interface JobPrereq { jobId: string; level: number; }

export interface JobStats {
  hp: number; mp: number; pa: number; ma: number; speed: number;
  move: number; jump: number; faith: number; bravery: number;
}

export interface JobDef {
  id: string;
  name: string;
  prereqs: JobPrereq[];
  baseStats: JobStats;
  learnableActives: string[];
  learnableReactions: string[];
  learnableSupports: string[];
  learnableMovements: string[];
}

const stat = (over: Partial<JobStats>): JobStats => ({
  hp: 50, mp: 10, pa: 5, ma: 5, speed: 10, move: 4, jump: 1, faith: 50, bravery: 50,
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
    baseStats: stat({ hp: 55, pa: 5, ma: 4, bravery: 60 }),
    ...noAbilities,
  },
  chemist: {
    id: 'chemist', name: 'Chemist',
    prereqs: [],
    baseStats: stat({ hp: 45, mp: 16, pa: 4, ma: 4 }),
    ...noAbilities,
  },

  // ─── Tier 1: from Squire ──────────────────────────────────────────────────
  knight: {
    id: 'knight', name: 'Knight',
    prereqs: [{ jobId: 'squire', level: 2 }],
    baseStats: stat({ hp: 70, pa: 7, ma: 3, speed: 9, move: 3, faith: 40, bravery: 75 }),
    learnableActives: ['power_break', 'speed_break'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },
  archer: {
    id: 'archer', name: 'Archer',
    prereqs: [{ jobId: 'squire', level: 2 }],
    baseStats: stat({ pa: 6, ma: 3, speed: 11, jump: 2 }),
    ...noAbilities,
  },

  // ─── Tier 1: from Chemist ─────────────────────────────────────────────────
  white_mage: {
    id: 'white_mage', name: 'White Mage',
    prereqs: [{ jobId: 'chemist', level: 2 }],
    baseStats: stat({ mp: 24, pa: 3, ma: 7, speed: 9, move: 3, faith: 70 }),
    ...noAbilities,
  },
  black_mage: {
    id: 'black_mage', name: 'Black Mage',
    prereqs: [{ jobId: 'chemist', level: 2 }],
    baseStats: stat({ hp: 38, mp: 32, pa: 3, ma: 9, move: 3, faith: 80, bravery: 35 }),
    learnableActives: ['fire', 'bolt', 'ice'],
    learnableReactions: [], learnableSupports: [], learnableMovements: [],
  },

  // ─── Tier 2: physical branch ──────────────────────────────────────────────
  monk: {
    id: 'monk', name: 'Monk',
    prereqs: [{ jobId: 'knight', level: 2 }],
    baseStats: stat({ hp: 60, mp: 8, pa: 8, ma: 3, speed: 11, jump: 2 }),
    ...noAbilities,
  },
  thief: {
    id: 'thief', name: 'Thief',
    prereqs: [{ jobId: 'archer', level: 2 }],
    baseStats: stat({ hp: 45, mp: 8, pa: 5, ma: 3, speed: 13, move: 5, jump: 3 }),
    ...noAbilities,
  },

  // ─── Tier 2: magic branch ─────────────────────────────────────────────────
  time_mage: {
    id: 'time_mage', name: 'Time Mage',
    prereqs: [{ jobId: 'black_mage', level: 2 }, { jobId: 'white_mage', level: 2 }],
    baseStats: stat({ hp: 40, mp: 28, pa: 3, ma: 8, move: 3, faith: 70 }),
    ...noAbilities,
  },
  oracle: {
    id: 'oracle', name: 'Oracle',
    prereqs: [{ jobId: 'white_mage', level: 4 }],
    baseStats: stat({ hp: 42, mp: 26, pa: 3, ma: 8, speed: 9, move: 3, faith: 65 }),
    ...noAbilities,
  },

  // ─── Tier 3: physical specialists ─────────────────────────────────────────
  geomancer: {
    id: 'geomancer', name: 'Geomancer',
    prereqs: [{ jobId: 'monk', level: 4 }],
    baseStats: stat({ hp: 55, mp: 18, pa: 6, ma: 6, jump: 2 }),
    ...noAbilities,
  },
  lancer: {
    id: 'lancer', name: 'Lancer',
    prereqs: [{ jobId: 'knight', level: 4 }, { jobId: 'thief', level: 4 }],
    baseStats: stat({ hp: 65, mp: 12, pa: 7, ma: 3, speed: 9, jump: 4 }),
    ...noAbilities,
  },

  // ─── Tier 3: magic specialists ────────────────────────────────────────────
  mediator: {
    id: 'mediator', name: 'Mediator',
    prereqs: [{ jobId: 'oracle', level: 2 }],
    baseStats: stat({ hp: 45, mp: 20, pa: 4, ma: 5 }),
    ...noAbilities,
  },
  summoner: {
    id: 'summoner', name: 'Summoner',
    prereqs: [{ jobId: 'time_mage', level: 2 }],
    baseStats: stat({ hp: 38, mp: 36, pa: 3, ma: 10, speed: 9, move: 3, faith: 75 }),
    ...noAbilities,
  },

  // ─── Tier 4: elite ────────────────────────────────────────────────────────
  samurai: {
    id: 'samurai', name: 'Samurai',
    prereqs: [
      { jobId: 'knight', level: 4 }, { jobId: 'monk', level: 5 },
      { jobId: 'lancer', level: 2 }, { jobId: 'geomancer', level: 2 },
    ],
    baseStats: stat({ hp: 65, mp: 12, pa: 7, ma: 5, move: 3, bravery: 70 }),
    ...noAbilities,
  },
  ninja: {
    id: 'ninja', name: 'Ninja',
    prereqs: [
      { jobId: 'archer', level: 4 }, { jobId: 'thief', level: 5 },
      { jobId: 'geomancer', level: 2 },
    ],
    baseStats: stat({ pa: 7, ma: 3, speed: 14, move: 5, jump: 3 }),
    ...noAbilities,
  },
  calculator: {
    id: 'calculator', name: 'Calculator',
    prereqs: [
      { jobId: 'white_mage', level: 5 }, { jobId: 'black_mage', level: 5 },
      { jobId: 'time_mage', level: 4 }, { jobId: 'oracle', level: 4 },
    ],
    baseStats: stat({ hp: 40, mp: 24, pa: 3, ma: 7, speed: 8, move: 3 }),
    ...noAbilities,
  },

  // ─── Tier 5: gendered & mime (deepest unlocks) ────────────────────────────
  bard: {
    id: 'bard', name: 'Bard',
    prereqs: [{ jobId: 'summoner', level: 4 }, { jobId: 'mediator', level: 4 }],
    baseStats: stat({ mp: 22, pa: 4, ma: 6, speed: 9 }),
    ...noAbilities,
  },
  dancer: {
    id: 'dancer', name: 'Dancer',
    prereqs: [{ jobId: 'geomancer', level: 4 }, { jobId: 'mediator', level: 4 }],
    baseStats: stat({ mp: 22, pa: 4, ma: 6, speed: 9 }),
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
    ...noAbilities,
  },
};
