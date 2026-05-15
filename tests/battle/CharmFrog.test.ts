import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, Facing, Team,
} from '../../src/battle/Unit';
import { effectivePa } from '../../src/battle/ActionResolver';
import { ABILITIES } from '../../src/data/abilities';
import { JOB_DEFS } from '../../src/data/jobs';
import { STATUS_DEFS } from '../../src/data/statuses';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 30, pa: 10, ma: 8, speed: 10, move: 4, jump: 1,
  faith: 50, bravery: 50, evasion: 10,
  ...over,
});

function makeUnit(id: string, team: Team, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = { id, name: id, team, jobId: 'x', level: 1, stats: stats(over) };
  return new Unit(def, 0, 0, FACING_E as Facing);
}

describe('Charm status + ability', () => {
  it('Charm lasts 24 ticks', () => {
    expect(STATUS_DEFS.charm.expiry).toEqual({ kind: 'duration', ticks: 24 });
  });

  it('Mediator learns Charm', () => {
    expect(JOB_DEFS.mediator.learnableActives).toContain('charm');
  });

  it('Charm inflicts the charm status on enemies', () => {
    const ab = ABILITIES.charm;
    expect(ab.range).toBe(4);
    expect(ab.type).toBe('magical');
    if (ab.effect.kind !== 'inflict-status') throw new Error('bad fixture');
    expect(ab.effect.statusId).toBe('charm');
    expect(ab.effect.targetTeam).toBe('enemy');
  });

  it('Esuna / Remedy / Stigma Magic cure charm', () => {
    for (const id of ['esuna', 'remedy', 'stigma_magic']) {
      const eff = ABILITIES[id].effect;
      if (eff.kind !== 'cure-status') throw new Error('bad fixture');
      expect(eff.statuses).toContain('charm');
    }
  });
});

describe('Frog status + ability', () => {
  it('Frog lasts 24 ticks and sets blocksAbilities (not blocksAct)', () => {
    expect(STATUS_DEFS.frog.expiry).toEqual({ kind: 'duration', ticks: 24 });
    expect(STATUS_DEFS.frog.blocksAbilities).toBe(true);
    expect(STATUS_DEFS.frog.blocksAct).toBeUndefined();
  });

  it('effectivePa halves PA under Frog', () => {
    const u = makeUnit('u', 'player', { pa: 10 });
    expect(effectivePa(u)).toBe(10);
    u.addStatus('frog');
    expect(effectivePa(u)).toBe(5);
  });

  it('Berserk and Frog compound on effectivePa (x1.5 then x0.5)', () => {
    const u = makeUnit('u', 'player', { pa: 12 });
    u.addStatus('berserk');
    u.addStatus('frog');
    // floor(12 * 1.5) = 18, then floor(18 * 0.5) = 9
    expect(effectivePa(u)).toBe(9);
  });

  it('Oracle learns Frog', () => {
    expect(JOB_DEFS.oracle.learnableActives).toContain('frog');
  });

  it('Frog inflicts the frog status on enemies', () => {
    const ab = ABILITIES.frog;
    expect(ab.range).toBe(3);
    if (ab.effect.kind !== 'inflict-status') throw new Error('bad fixture');
    expect(ab.effect.statusId).toBe('frog');
    expect(ab.effect.targetTeam).toBe('enemy');
  });

  it('Esuna / Remedy / Stigma Magic cure frog', () => {
    for (const id of ['esuna', 'remedy', 'stigma_magic']) {
      const eff = ABILITIES[id].effect;
      if (eff.kind !== 'cure-status') throw new Error('bad fixture');
      expect(eff.statuses).toContain('frog');
    }
  });
});
