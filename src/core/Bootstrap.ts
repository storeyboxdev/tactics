/**
 * Default roster construction. Used on first launch (no save) and after
 * "Wipe Save" in the roster screen.
 *
 * `bootstrapUnit` walks the prereq chain of the starting job and stamps every
 * job in that chain as `unlocked: true` with synthetic JP equal to the
 * threshold for the demanded Job Level. No raw-stat growth is applied for the
 * synthetic levels — the unit is overall Level 1 with raw stats at the
 * canonical baseline, so its display stats match the starting job's
 * `baseStats` exactly (the same numbers the original M1–M10 build shipped).
 */

import { JOB_DEFS, RAW_STAT_BASELINE } from '../data/jobs';
import {
  UnitProgression, JOB_LEVEL_THRESHOLDS,
} from '../battle/Progression';
import { SavedUnit } from './Save';

export interface RosterSeed {
  id: string;
  name: string;
  jobId: string;
}

// FFT-canonical: every recruit starts as a Squire and branches out via JP
// spent in the roster screen. Mixed-job starters were tempting for the visual
// variety but they short-circuit the unlock loop the progression plan exists
// to drive.
const DEFAULT_ROSTER_SEEDS: RosterSeed[] = [
  { id: 'p1', name: 'P1', jobId: 'squire' },
  { id: 'p2', name: 'P2', jobId: 'squire' },
  { id: 'p3', name: 'P3', jobId: 'squire' },
  { id: 'p4', name: 'P4', jobId: 'squire' },
  { id: 'p5', name: 'P5', jobId: 'squire' },
];

export function defaultRoster(): SavedUnit[] {
  return DEFAULT_ROSTER_SEEDS.map(bootstrapUnit);
}

/**
 * Tiered enemy job pools, indexed by completed-battle count. Battle 0 is
 * Squires-only (the very first fight the player ever sees). Each tier
 * widens the pool — the previous tier is always still in. By battle 6+
 * every job is a possible roll.
 */
const ENEMY_TIERS: Array<readonly string[]> = [
  // 0 — first battle: pure mirror, full safety net.
  ['squire'],
  // 2 — basic Tier-1 jobs come in (chemists patch, knights bash, archers ping).
  //     Goblins start prowling — the first monster the player meets.
  ['squire', 'chemist', 'knight', 'archer', 'goblin'],
  // 4 — first wave of casters and rogues (sleep / poison / mug pressure),
  //     and Chocobos join the beast roster.
  ['squire', 'chemist', 'knight', 'archer', 'monk', 'thief', 'white_mage', 'black_mage', 'oracle',
   'goblin', 'chocobo'],
  // 6 — full pool. Anything goes — every job and every monster.
  [
    'squire', 'chemist', 'knight', 'archer', 'monk', 'thief',
    'white_mage', 'black_mage', 'time_mage', 'oracle',
    'geomancer', 'lancer', 'mediator', 'summoner',
    'samurai', 'ninja', 'calculator', 'bard', 'dancer', 'mime',
    'goblin', 'chocobo', 'red_panther', 'bomb',
  ],
];

/** The enemy job/monster pool eligible for a battle at `battleCount`. Exported
 *  so tests can assert tier composition directly. */
export function poolFor(battleCount: number): readonly string[] {
  if (battleCount >= 6) return ENEMY_TIERS[3];
  if (battleCount >= 4) return ENEMY_TIERS[2];
  if (battleCount >= 2) return ENEMY_TIERS[1];
  return ENEMY_TIERS[0];
}

/**
 * Pick `count` enemy job ids for the next battle. Always includes one
 * Squire so the player has at least one "vanilla" target to read against.
 * The remaining slots are sampled from the tier-appropriate pool.
 */
export function pickEnemyJobs(battleCount: number, count: number, rng: () => number = Math.random): string[] {
  if (count <= 0) return [];
  const pool = poolFor(battleCount);
  const out: string[] = ['squire'];
  for (let i = 1; i < count; i++) {
    out.push(pool[Math.floor(rng() * pool.length)]);
  }
  // Shuffle so the squire isn't always first.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function bootstrapUnit(seed: RosterSeed): SavedUnit {
  const startingJob = JOB_DEFS[seed.jobId];
  if (!startingJob) throw new Error(`bootstrapUnit: unknown jobId ${seed.jobId}`);

  const progression: UnitProgression = {
    exp: 0,
    totalLevel: 1,
    rawHp: RAW_STAT_BASELINE.hp,
    rawMp: RAW_STAT_BASELINE.mp,
    rawPa: RAW_STAT_BASELINE.pa,
    rawMa: RAW_STAT_BASELINE.ma,
    rawSp: RAW_STAT_BASELINE.speed,
    faith:   startingJob.baseStats.faith,
    bravery: startingJob.baseStats.bravery,
    jobs: {},
  };

  // Starting job: unlocked, JP 0 (Job Level 1). The unit comes pre-trained in
  // every active their starting job teaches — otherwise battle 1 has no
  // skills (Time Mage with no Haste, Black Mage with no Fire) and the only
  // way to earn JP is to attack with `Fight`. Switching into a *different*
  // job later still requires JP-grinding its abilities — that's the FFT
  // pressure to invest. Reactions/Supports/Movements remain unlearned so
  // the equip dropdowns stay meaningfully empty until the first JP buy.
  progression.jobs[seed.jobId] = {
    jp: 0,
    unlocked: true,
    learnedAbilities: [...startingJob.learnableActives],
  };

  // Walk prereqs recursively. For each prereq job we record the highest
  // demanded Job Level along any path; that becomes the synthetic JP we
  // stamp on the entry. Deeper-chain jobs (prereqs of prereqs) are seeded at
  // Level 1 (jp = 0) — they only need `unlocked: true` so the user can switch
  // into them mid-campaign.
  const required = new Map<string, number>();
  const visit = (jobId: string, level: number) => {
    const prev = required.get(jobId) ?? 0;
    if (level <= prev) return;
    required.set(jobId, level);
    const job = JOB_DEFS[jobId];
    if (!job) return;
    for (const p of job.prereqs) visit(p.jobId, p.level);
  };
  for (const p of startingJob.prereqs) visit(p.jobId, p.level);

  for (const [jobId, level] of required) {
    if (jobId === seed.jobId) continue;
    const jp = JOB_LEVEL_THRESHOLDS[level - 1] ?? 0;
    progression.jobs[jobId] = { jp, unlocked: true, learnedAbilities: [] };
  }

  return {
    id: seed.id,
    name: seed.name,
    jobId: seed.jobId,
    secondaryJobId: null,
    reaction:  null,
    support:   null,
    movement:  null,
    weaponId:  null,
    armorId:   null,
    progression,
  };
}
