import { describe, it, expect } from 'vitest';
import { computeDisplayStats } from '../../src/battle/Stats';
import { freshRawStats, UnitProgression } from '../../src/battle/Progression';
import { JOB_DEFS } from '../../src/data/jobs';

function progFor(jobId: string): UnitProgression {
  return {
    exp: 0, totalLevel: 1, ...freshRawStats(),
    faith: JOB_DEFS[jobId].baseStats.faith,
    bravery: JOB_DEFS[jobId].baseStats.bravery,
    jobs: { [jobId]: { jp: 0, unlocked: true, learnedAbilities: [] } },
  };
}

describe('computeDisplayStats', () => {
  it('a starter unit\'s display stats equal that job\'s baseStats', () => {
    // For every job, raw = canonical baseline (50/10/5/5/10) ⇒ display equals
    // baseStats hp/mp/pa/ma/speed exactly. This is the calibration that makes
    // the M1–M10 numbers identical post-refactor for first-battle starters.
    for (const job of Object.values(JOB_DEFS)) {
      const p = progFor(job.id);
      const d = computeDisplayStats(p, job.id);
      expect(d.hp,    `${job.id}.hp`   ).toBe(job.baseStats.hp);
      expect(d.mp,    `${job.id}.mp`   ).toBe(job.baseStats.mp);
      expect(d.pa,    `${job.id}.pa`   ).toBe(job.baseStats.pa);
      expect(d.ma,    `${job.id}.ma`   ).toBe(job.baseStats.ma);
      expect(d.speed, `${job.id}.speed`).toBe(job.baseStats.speed);
      // Move/jump come straight from the job — not raw×mult.
      expect(d.move,  `${job.id}.move` ).toBe(job.baseStats.move);
      expect(d.jump,  `${job.id}.jump` ).toBe(job.baseStats.jump);
    }
  });

  it('same raw stats yield different display stats per equipped job', () => {
    const p = progFor('squire');
    // Make squire and knight both unlocked so we can switch.
    p.jobs.knight = { jp: 0, unlocked: true, learnedAbilities: [] };
    const sq = computeDisplayStats(p, 'squire');
    const kn = computeDisplayStats(p, 'knight');
    // Knight has higher HP mult and PA mult than Squire.
    expect(kn.hp).toBeGreaterThan(sq.hp);
    expect(kn.pa).toBeGreaterThan(sq.pa);
    // Black Mage has higher MA, lower HP.
    p.jobs.black_mage = { jp: 0, unlocked: true, learnedAbilities: [] };
    const bm = computeDisplayStats(p, 'black_mage');
    expect(bm.ma).toBeGreaterThan(sq.ma);
    expect(bm.hp).toBeLessThan(sq.hp);
  });

  it('faith and bravery come from progression, not from the job', () => {
    const p = progFor('squire');
    p.faith = 11;
    p.bravery = 22;
    const d = computeDisplayStats(p, 'squire');
    expect(d.faith).toBe(11);
    expect(d.bravery).toBe(22);
  });

  it('clamps display stats to floor 1 (hp/pa/ma/speed) and 0 (mp)', () => {
    const p = progFor('squire');
    p.rawHp = 0; p.rawMp = 0; p.rawPa = 0; p.rawMa = 0; p.rawSp = 0;
    const d = computeDisplayStats(p, 'squire');
    expect(d.hp).toBe(1);
    expect(d.mp).toBe(0);
    expect(d.pa).toBe(1);
    expect(d.ma).toBe(1);
    expect(d.speed).toBe(1);
  });

  it('throws on unknown jobId', () => {
    const p = progFor('squire');
    expect(() => computeDisplayStats(p, 'no_such_job')).toThrow();
  });
});
