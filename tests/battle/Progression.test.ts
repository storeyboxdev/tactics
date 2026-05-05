import { describe, it, expect } from 'vitest';
import {
  awardExp, awardJp, jobLevelFor, jpToNextJobLevel, prereqsSatisfied,
  ensureJobProgress, freshRawStats, learn, canLearn, learnedActivesInJob,
  allLearnedPassives, JOB_LEVEL_THRESHOLDS, MAX_OVERALL_LEVEL, EXP_PER_LEVEL,
  UnitProgression,
} from '../../src/battle/Progression';
import { JOB_DEFS, RAW_STAT_BASELINE } from '../../src/data/jobs';

function freshProgression(jobId: string): UnitProgression {
  return {
    exp: 0, totalLevel: 1,
    ...freshRawStats(),
    faith: JOB_DEFS[jobId].baseStats.faith,
    bravery: JOB_DEFS[jobId].baseStats.bravery,
    jobs: { [jobId]: { jp: 0, unlocked: true, learnedAbilities: [] } },
  };
}

describe('jobLevelFor', () => {
  it('reads cumulative-JP into Job Levels 1..9', () => {
    expect(jobLevelFor(0)).toBe(1);
    expect(jobLevelFor(99)).toBe(1);
    expect(jobLevelFor(100)).toBe(2);
    expect(jobLevelFor(199)).toBe(2);
    expect(jobLevelFor(200)).toBe(3);
    expect(jobLevelFor(2899)).toBe(8);
    expect(jobLevelFor(2900)).toBe(9);
    expect(jobLevelFor(99_999)).toBe(9);
  });
});

describe('jpToNextJobLevel', () => {
  it('returns null at max job level', () => {
    expect(jpToNextJobLevel(JOB_LEVEL_THRESHOLDS[JOB_LEVEL_THRESHOLDS.length - 1])).toBeNull();
  });
  it('reports the JP required to reach the next level', () => {
    const r = jpToNextJobLevel(150);
    expect(r).not.toBeNull();
    expect(r!.current).toBe(100);
    expect(r!.next).toBe(200);
    expect(r!.remaining).toBe(50);
  });
});

describe('awardExp', () => {
  it('adds EXP, levels up, and applies the current job\'s growth', () => {
    const p = freshProgression('knight');
    const beforeHp = p.rawHp;
    const beforePa = p.rawPa;
    const res = awardExp(p, 'knight', 100);
    expect(res.leveledUp).toBe(true);
    expect(res.from).toBe(1);
    expect(res.to).toBe(2);
    expect(p.totalLevel).toBe(2);
    // Knight growth: hp 9%, pa 7%
    expect(p.rawHp).toBeCloseTo(beforeHp * 1.09, 5);
    expect(p.rawPa).toBeCloseTo(beforePa * 1.07, 5);
  });

  it('handles multi-level overflow', () => {
    const p = freshProgression('squire');
    const res = awardExp(p, 'squire', 250);
    expect(res.from).toBe(1);
    expect(res.to).toBe(3);
    expect(p.totalLevel).toBe(3);
    expect(p.exp).toBe(50);
  });

  it('caps at MAX_OVERALL_LEVEL', () => {
    const p = freshProgression('squire');
    p.totalLevel = MAX_OVERALL_LEVEL;
    const res = awardExp(p, 'squire', EXP_PER_LEVEL * 5);
    expect(res.leveledUp).toBe(false);
    expect(p.totalLevel).toBe(MAX_OVERALL_LEVEL);
    expect(p.exp).toBe(0);
  });

  it('zero or negative awards are no-ops', () => {
    const p = freshProgression('squire');
    expect(awardExp(p, 'squire', 0).leveledUp).toBe(false);
    expect(awardExp(p, 'squire', -50).leveledUp).toBe(false);
    expect(p.exp).toBe(0);
  });

  it('different jobs apply different growth profiles to the same raw stats', () => {
    const a = freshProgression('knight');
    const b = freshProgression('black_mage');
    awardExp(a, 'knight', 100);
    awardExp(b, 'black_mage', 100);
    // Knight grows HP fast, Black Mage grows MA fast.
    expect(a.rawHp).toBeGreaterThan(b.rawHp);
    expect(b.rawMa).toBeGreaterThan(a.rawMa);
  });
});

describe('awardJp + unlocks', () => {
  it('reaching a prereq Job Level unlocks the dependent job', () => {
    const p = freshProgression('squire');
    expect(prereqsSatisfied(p, 'knight')).toBe(false);
    const res = awardJp(p, 'squire', 100); // Squire JL 2 — Knight prereq
    expect(res.jobLevelGained).toBe(true);
    expect(res.newlyUnlocked).toContain('knight');
    expect(p.jobs.knight.unlocked).toBe(true);
    // Re-running shouldn't double-report.
    const res2 = awardJp(p, 'squire', 0);
    expect(res2.newlyUnlocked).toEqual([]);
  });

  it('chained prereqs require both parents at level', () => {
    const p = freshProgression('chemist');
    awardJp(p, 'chemist', 100); // Chemist JL 2 → unlocks white_mage + black_mage
    expect(p.jobs.white_mage.unlocked).toBe(true);
    expect(p.jobs.black_mage.unlocked).toBe(true);
    // Time Mage requires both at JL 2 — they're at JL 1 (jp 0) so no unlock.
    expect(p.jobs.time_mage?.unlocked ?? false).toBe(false);
  });

  it('does not unlock dependent jobs whose prereqs are not yet met', () => {
    const p = freshProgression('squire');
    // Award nothing — but awardJp still walks JOB_DEFS and may flip newly-
    // satisfied roots. Knight (Squire:lvl:2) is NOT yet satisfied at jp=0.
    const res = awardJp(p, 'squire', 0);
    expect(res.newlyUnlocked).not.toContain('knight');
    expect(p.jobs.knight?.unlocked ?? false).toBe(false);
  });
});

describe('learn / canLearn', () => {
  it('learns an active when JP is sufficient and ability is in the job', () => {
    const p = freshProgression('knight');
    awardJp(p, 'knight', 200); // enough for Power Break (200 JP)
    expect(canLearn(p, 'knight', 'power_break')).toBe(true);
    expect(learn(p, 'knight', 'power_break')).toBe(true);
    expect(p.jobs.knight.learnedAbilities).toContain('power_break');
    expect(p.jobs.knight.jp).toBe(0); // FFT spends from cumulative
    // Re-learn is rejected.
    expect(canLearn(p, 'knight', 'power_break')).toBe(false);
    expect(learn(p, 'knight', 'power_break')).toBe(false);
  });

  it('rejects learning when JP is insufficient', () => {
    const p = freshProgression('knight');
    awardJp(p, 'knight', 100);
    expect(canLearn(p, 'knight', 'power_break')).toBe(false);
  });

  it('rejects abilities not in the job\'s learnable list', () => {
    const p = freshProgression('knight');
    awardJp(p, 'knight', 1000);
    expect(canLearn(p, 'knight', 'fire')).toBe(false);
  });

  it('learnedActivesInJob filters to current-job-learned actives only', () => {
    const p = freshProgression('knight');
    awardJp(p, 'knight', 200);
    learn(p, 'knight', 'power_break');
    expect(learnedActivesInJob(p, 'knight')).toEqual(['power_break']);
    // No active learned in another job → empty
    ensureJobProgress(p, 'squire').unlocked = true;
    expect(learnedActivesInJob(p, 'squire')).toEqual([]);
  });
});

describe('allLearnedPassives', () => {
  it('aggregates passives across unlocked jobs only', () => {
    const p = freshProgression('knight');
    // No reactions/supports/movements declared on Knight, so this is an
    // empty-aggregate sanity check; the union itself is what we're testing.
    const pass = allLearnedPassives(p);
    expect(pass.reactions).toEqual([]);
    expect(pass.supports).toEqual([]);
    expect(pass.movements).toEqual([]);
  });
});

describe('canonical baseline', () => {
  it('freshRawStats matches RAW_STAT_BASELINE', () => {
    const r = freshRawStats();
    expect(r.rawHp).toBe(RAW_STAT_BASELINE.hp);
    expect(r.rawMp).toBe(RAW_STAT_BASELINE.mp);
    expect(r.rawPa).toBe(RAW_STAT_BASELINE.pa);
    expect(r.rawMa).toBe(RAW_STAT_BASELINE.ma);
    expect(r.rawSp).toBe(RAW_STAT_BASELINE.speed);
  });
});
