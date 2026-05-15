import { describe, it, expect } from 'vitest';
import { defaultRoster, bootstrapUnit, pickEnemyJobs } from '../../src/core/Bootstrap';
import { JOB_DEFS, RAW_STAT_BASELINE } from '../../src/data/jobs';
import { ABILITIES } from '../../src/data/abilities';
import { jobLevelFor, prereqsSatisfied, MAX_OVERALL_LEVEL } from '../../src/battle/Progression';

describe('bootstrapUnit', () => {
  it('starts at overall Level 1 with canonical raw stats', () => {
    const u = bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'knight' });
    expect(u.progression.totalLevel).toBe(1);
    expect(u.progression.exp).toBe(0);
    expect(u.progression.rawHp).toBe(RAW_STAT_BASELINE.hp);
    expect(u.progression.rawMp).toBe(RAW_STAT_BASELINE.mp);
    expect(u.progression.rawPa).toBe(RAW_STAT_BASELINE.pa);
    expect(u.progression.rawMa).toBe(RAW_STAT_BASELINE.ma);
    expect(u.progression.rawSp).toBe(RAW_STAT_BASELINE.speed);
  });

  it('seeds faith and bravery from the starting job', () => {
    const u = bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'black_mage' });
    expect(u.progression.faith).toBe(JOB_DEFS.black_mage.baseStats.faith);
    expect(u.progression.bravery).toBe(JOB_DEFS.black_mage.baseStats.bravery);
  });

  it('unlocks the starting job at JL 1 with 0 JP and pre-learned actives', () => {
    const u = bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'knight' });
    const k = u.progression.jobs.knight;
    expect(k.unlocked).toBe(true);
    expect(k.jp).toBe(0);
    expect(jobLevelFor(k.jp)).toBe(1);
    // Starting-job actives are pre-trained so battle 1 isn't toothless.
    expect(k.learnedAbilities).toEqual(JOB_DEFS.knight.learnableActives);
  });

  it('walks the prereq chain and stamps each prereq job at the threshold JP', () => {
    // Time Mage requires {Black Mage:2, White Mage:2}, both of which require
    // Chemist:2 in turn.
    const u = bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'time_mage' });
    expect(u.progression.jobs.black_mage.unlocked).toBe(true);
    expect(jobLevelFor(u.progression.jobs.black_mage.jp)).toBeGreaterThanOrEqual(2);
    expect(u.progression.jobs.white_mage.unlocked).toBe(true);
    expect(jobLevelFor(u.progression.jobs.white_mage.jp)).toBeGreaterThanOrEqual(2);
    expect(u.progression.jobs.chemist.unlocked).toBe(true);
    // Chemist only needs unlocked status (it's a deeper-chain prereq) — JL 1 is fine.
  });

  it('the starting job has prereqsSatisfied true after bootstrap', () => {
    const u = bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'oracle' });
    expect(prereqsSatisfied(u.progression, 'oracle')).toBe(true);
  });

  it('only the starting job has learned abilities; chain-prereq jobs are blank', () => {
    const u = bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'oracle' });
    expect(u.progression.jobs.oracle.learnedAbilities).toEqual(JOB_DEFS.oracle.learnableActives);
    for (const [jobId, prog] of Object.entries(u.progression.jobs)) {
      if (jobId === 'oracle') continue;
      expect(prog.learnedAbilities, `${jobId} should be empty`).toEqual([]);
    }
  });

  it('bootstrapping every starting job produces internally consistent saves', () => {
    for (const job of Object.values(JOB_DEFS)) {
      const u = bootstrapUnit({ id: 't', name: 'T', jobId: job.id });
      expect(u.progression.totalLevel).toBeLessThanOrEqual(MAX_OVERALL_LEVEL);
      expect(u.jobId).toBe(job.id);
      // No reference to unknown abilities anywhere.
      for (const prog of Object.values(u.progression.jobs)) {
        for (const id of prog.learnedAbilities) {
          expect(ABILITIES[id]).toBeDefined();
        }
      }
    }
  });

  it('throws on unknown jobId', () => {
    expect(() => bootstrapUnit({ id: 't', name: 'T', jobId: 'no_such_job' })).toThrow();
  });
});

describe('pickEnemyJobs — tier ramp', () => {
  // Deterministic rng: always 0.0 (picks first index).
  const rng0 = () => 0;
  // Deterministic rng: always 0.999 (picks last index).
  const rng1 = () => 0.999;

  it('battle 0 returns squires only', () => {
    const jobs = pickEnemyJobs(0, 5, rng1);
    expect(jobs.every(j => j === 'squire')).toBe(true);
  });

  it('battle 2 widens past pure Squires', () => {
    const jobs = pickEnemyJobs(2, 5, rng1);
    // rng1 always picks the last entry of the tier-1 pool (a Goblin since
    // monsters were appended). Plus the always-included squire.
    expect(jobs).toContain('goblin');
    expect(jobs).toContain('squire');
    // The tier widened — not every slot is a squire anymore.
    expect(jobs.some(j => j !== 'squire')).toBe(true);
  });

  it('battle 6 reaches the full pool', () => {
    const jobs = pickEnemyJobs(6, 5, rng1);
    // rng1 picks the last entry of the full pool: 'red_panther'.
    expect(jobs).toContain('red_panther');
  });

  it('always includes at least one squire as a sanity baseline', () => {
    for (const battle of [0, 2, 4, 6, 10]) {
      const jobs = pickEnemyJobs(battle, 5, rng0);
      expect(jobs).toContain('squire');
    }
  });

  it('count=0 returns an empty array', () => {
    expect(pickEnemyJobs(5, 0)).toEqual([]);
  });
});

describe('defaultRoster', () => {
  it('returns five player units with valid jobIds', () => {
    const roster = defaultRoster();
    expect(roster).toHaveLength(5);
    for (const u of roster) {
      expect(JOB_DEFS[u.jobId]).toBeDefined();
      expect(u.progression).toBeDefined();
      expect(u.progression.totalLevel).toBe(1);
    }
  });

  it('every unit\'s starting job is unlocked', () => {
    for (const u of defaultRoster()) {
      expect(u.progression.jobs[u.jobId].unlocked).toBe(true);
    }
  });
});
