/**
 * Pure display-stat computation: raw × jobMult / 100.
 *
 * Move/Jump are NOT scaled by mult — they're per-job fixed values pulled
 * straight from `JOB_DEFS[jobId].baseStats`. Faith/Bravery come from the
 * unit's progression (per-unit persistent, not job-scaled).
 */

import { JOB_DEFS } from '../data/jobs';
import { UnitProgression } from './Progression';

export interface DisplayStats {
  hp: number;
  mp: number;
  pa: number;
  ma: number;
  speed: number;
  move: number;
  jump: number;
  faith: number;
  bravery: number;
}

/** Compute the unit's currently-equipped-job display stats from progression. */
export function computeDisplayStats(p: UnitProgression, jobId: string): DisplayStats {
  const job = JOB_DEFS[jobId];
  if (!job) throw new Error(`computeDisplayStats: unknown jobId ${jobId}`);
  const m = job.mult;
  return {
    hp:    Math.max(1, Math.floor(p.rawHp * m.hp / 100)),
    mp:    Math.max(0, Math.floor(p.rawMp * m.mp / 100)),
    pa:    Math.max(1, Math.floor(p.rawPa * m.pa / 100)),
    ma:    Math.max(1, Math.floor(p.rawMa * m.ma / 100)),
    speed: Math.max(1, Math.floor(p.rawSp * m.speed / 100)),
    move:  job.baseStats.move,
    jump:  job.baseStats.jump,
    faith:   p.faith,
    bravery: p.bravery,
  };
}
