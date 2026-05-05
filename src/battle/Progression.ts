/**
 * FFT-style EXP / Job / JP progression.
 *
 * Each unit carries hidden raw stats that grow on overall level-up by the
 * percentages declared on the unit's CURRENT job. Display stats are computed
 * elsewhere (`Stats.ts`) as `floor(raw × currentJob.mult / 100)`. Faith and
 * bravery are per-unit and do NOT recompute on job change.
 *
 * JP is tracked per job. Job Levels 1–9 use the FFT canonical curve.
 * Abilities are learned (and persisted as ability ids) inside the job they
 * were bought in.
 */

import { JOB_DEFS, RAW_STAT_BASELINE } from '../data/jobs';
import { ABILITIES } from '../data/abilities';

export interface JobProgress {
  /** Cumulative JP earned in this job (never decreases except via the
   *  hypothetical "delete unit" path). */
  jp: number;
  /** Sticky once true. Set when prereqs are met or by `bootstrapUnit`. */
  unlocked: boolean;
  /** Ability ids learned inside this job. Stored as array (Set is JSON-hostile). */
  learnedAbilities: string[];
}

export interface UnitProgression {
  /** 0..99 toward next overall level. */
  exp: number;
  /** 1..99. */
  totalLevel: number;

  /** Hidden raw stats — persist across job changes. */
  rawHp: number;
  rawMp: number;
  rawPa: number;
  rawMa: number;
  rawSp: number;

  /** Per-unit, persistent. Faith/Bravery do not recompute on job change. */
  faith: number;
  bravery: number;

  /** Per-job progress. Missing entries mean the job has never been touched. */
  jobs: Record<string, JobProgress>;
}

/** FFT canonical cumulative-JP-in-job thresholds. Indices 0..8 → Job Levels 1..9. */
export const JOB_LEVEL_THRESHOLDS = [0, 100, 200, 400, 700, 1100, 1600, 2200, 2900];
export const MAX_JOB_LEVEL = JOB_LEVEL_THRESHOLDS.length;       // 9
export const MAX_OVERALL_LEVEL = 99;
export const EXP_PER_LEVEL = 100;

/** Returns 1..MAX_JOB_LEVEL (9). Cumulative JP determines current Job Level. */
export function jobLevelFor(jp: number): number {
  let level = 1;
  for (let i = 1; i < JOB_LEVEL_THRESHOLDS.length; i++) {
    if (jp >= JOB_LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return level;
}

/** JP needed for the *next* job level. Returns null when already at MAX_JOB_LEVEL. */
export function jpToNextJobLevel(jp: number): { current: number; next: number; remaining: number } | null {
  const lvl = jobLevelFor(jp);
  if (lvl >= MAX_JOB_LEVEL) return null;
  const current = JOB_LEVEL_THRESHOLDS[lvl - 1];
  const next = JOB_LEVEL_THRESHOLDS[lvl];
  return { current, next, remaining: next - jp };
}

/** Lazily creates a JobProgress entry. */
export function ensureJobProgress(p: UnitProgression, jobId: string): JobProgress {
  if (!p.jobs[jobId]) {
    p.jobs[jobId] = { jp: 0, unlocked: false, learnedAbilities: [] };
  }
  return p.jobs[jobId];
}

/** Fresh raw-stat block at the canonical baseline. */
export function freshRawStats(): { rawHp: number; rawMp: number; rawPa: number; rawMa: number; rawSp: number } {
  return {
    rawHp: RAW_STAT_BASELINE.hp,
    rawMp: RAW_STAT_BASELINE.mp,
    rawPa: RAW_STAT_BASELINE.pa,
    rawMa: RAW_STAT_BASELINE.ma,
    rawSp: RAW_STAT_BASELINE.speed,
  };
}

/**
 * Award EXP. Caller passes the unit's CURRENT jobId — stat growth on each
 * level-up applies that job's `growth` percentages. Returns flags for HUD use.
 */
export function awardExp(p: UnitProgression, currentJobId: string, amount: number):
  { leveledUp: boolean; from: number; to: number }
{
  const fromLevel = p.totalLevel;
  if (amount <= 0 || p.totalLevel >= MAX_OVERALL_LEVEL) {
    return { leveledUp: false, from: fromLevel, to: fromLevel };
  }
  p.exp += amount;
  while (p.exp >= EXP_PER_LEVEL && p.totalLevel < MAX_OVERALL_LEVEL) {
    p.exp -= EXP_PER_LEVEL;
    p.totalLevel++;
    applyLevelUpGrowth(p, currentJobId);
  }
  if (p.totalLevel >= MAX_OVERALL_LEVEL) p.exp = 0;
  return { leveledUp: p.totalLevel > fromLevel, from: fromLevel, to: p.totalLevel };
}

function applyLevelUpGrowth(p: UnitProgression, jobId: string): void {
  const job = JOB_DEFS[jobId];
  if (!job) return;
  const g = job.growth;
  p.rawHp *= 1 + g.hp / 100;
  p.rawMp *= 1 + g.mp / 100;
  p.rawPa *= 1 + g.pa / 100;
  p.rawMa *= 1 + g.ma / 100;
  p.rawSp *= 1 + g.speed / 100;
}

/**
 * Award JP to the unit's current job. Re-evaluates prereqs and unlocks any
 * newly-eligible jobs. Returns flags for HUD use.
 */
export function awardJp(p: UnitProgression, currentJobId: string, amount: number):
  { jpFrom: number; jpTo: number; jobLevelGained: boolean; newlyUnlocked: string[] }
{
  const prog = ensureJobProgress(p, currentJobId);
  const jpFrom = prog.jp;
  const lvlFrom = jobLevelFor(jpFrom);
  if (amount > 0) prog.jp += amount;
  const lvlTo = jobLevelFor(prog.jp);

  const newlyUnlocked: string[] = [];
  for (const job of Object.values(JOB_DEFS)) {
    const target = ensureJobProgress(p, job.id);
    if (target.unlocked) continue;
    if (prereqsSatisfied(p, job.id)) {
      target.unlocked = true;
      newlyUnlocked.push(job.id);
    }
  }

  return {
    jpFrom,
    jpTo: prog.jp,
    jobLevelGained: lvlTo > lvlFrom,
    newlyUnlocked,
  };
}

/** True iff every prereq of the target job has its prereq job unlocked AND
 *  at the required Job Level (in cumulative-JP terms). Root jobs (no prereqs)
 *  are always satisfied. */
export function prereqsSatisfied(p: UnitProgression, jobId: string): boolean {
  const job = JOB_DEFS[jobId];
  if (!job) return false;
  if (job.prereqs.length === 0) return true;
  for (const req of job.prereqs) {
    const prog = p.jobs[req.jobId];
    if (!prog || !prog.unlocked) return false;
    if (jobLevelFor(prog.jp) < req.level) return false;
  }
  return true;
}

/** Can the unit currently learn this ability inside `jobId`? */
export function canLearn(p: UnitProgression, jobId: string, abilityId: string): boolean {
  const ab = ABILITIES[abilityId];
  if (!ab) return false;
  const prog = p.jobs[jobId];
  if (!prog || !prog.unlocked) return false;
  if (prog.learnedAbilities.includes(abilityId)) return false;
  if (prog.jp < ab.jpCost) return false;
  if (!isLearnableInJob(jobId, abilityId)) return false;
  return true;
}

function isLearnableInJob(jobId: string, abilityId: string): boolean {
  const job = JOB_DEFS[jobId];
  if (!job) return false;
  return (
    job.learnableActives.includes(abilityId) ||
    job.learnableReactions.includes(abilityId) ||
    job.learnableSupports.includes(abilityId) ||
    job.learnableMovements.includes(abilityId)
  );
}

/** Spend JP to learn an ability inside `jobId`. Returns true if the buy went through. */
export function learn(p: UnitProgression, jobId: string, abilityId: string): boolean {
  if (!canLearn(p, jobId, abilityId)) return false;
  const ab = ABILITIES[abilityId];
  const prog = p.jobs[jobId];
  prog.jp -= ab.jpCost;   // FFT spends from cumulative — reduces it (Job Level can drop!)
  prog.learnedAbilities.push(abilityId);
  return true;
}

/** All passive ability ids the unit has learned across every unlocked job
 *  (used by the roster screen to populate reaction/support/movement dropdowns). */
export function allLearnedPassives(p: UnitProgression): { reactions: string[]; supports: string[]; movements: string[] } {
  const reactions = new Set<string>();
  const supports = new Set<string>();
  const movements = new Set<string>();
  for (const [jobId, prog] of Object.entries(p.jobs)) {
    if (!prog.unlocked) continue;
    const job = JOB_DEFS[jobId];
    if (!job) continue;
    for (const id of prog.learnedAbilities) {
      if (job.learnableReactions.includes(id)) reactions.add(id);
      if (job.learnableSupports.includes(id))  supports.add(id);
      if (job.learnableMovements.includes(id)) movements.add(id);
    }
  }
  return {
    reactions: [...reactions],
    supports: [...supports],
    movements: [...movements],
  };
}

/** Active abilities learnable by this unit *inside `jobId`* (used for the
 *  in-battle skill menu — actives only come from the current job, no
 *  Secondary Command yet). */
export function learnedActivesInJob(p: UnitProgression, jobId: string): string[] {
  const prog = p.jobs[jobId];
  if (!prog || !prog.unlocked) return [];
  const job = JOB_DEFS[jobId];
  if (!job) return [];
  return prog.learnedAbilities.filter(id => job.learnableActives.includes(id));
}
