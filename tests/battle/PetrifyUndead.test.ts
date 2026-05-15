import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, Facing, Team,
} from '../../src/battle/Unit';
import { ABILITIES } from '../../src/data/abilities';
import { JOB_DEFS } from '../../src/data/jobs';
import { STATUS_DEFS } from '../../src/data/statuses';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 30, pa: 8, ma: 8, speed: 10, move: 4, jump: 1,
  faith: 100, bravery: 50, evasion: 10,
  ...over,
});

function makeUnit(id: string, team: Team, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = { id, name: id, team, jobId: 'x', level: 1, stats: stats(over) };
  return new Unit(def, 0, 0, FACING_E as Facing);
}

/** Mirror of checkBattleEnd's team-standing predicate. */
function teamStanding(units: Unit[], team: Team): boolean {
  return units.some(u => u.team === team && u.isAlive && !u.hasStatus('petrify'));
}

describe('Petrify status', () => {
  it('is permanent and blocks the turn', () => {
    expect(STATUS_DEFS.petrify.expiry).toEqual({ kind: 'permanent' });
    expect(STATUS_DEFS.petrify.blocksTurn).toBe(true);
  });

  it('a petrified unit does not count toward its team standing', () => {
    const a = makeUnit('a', 'player');
    const b = makeUnit('b', 'player');
    const e = makeUnit('e', 'enemy');
    expect(teamStanding([a, b, e], 'player')).toBe(true);
    a.addStatus('petrify');
    expect(teamStanding([a, b, e], 'player')).toBe(true); // b still stands
    b.addStatus('petrify');
    expect(teamStanding([a, b, e], 'player')).toBe(false); // both petrified → down
  });

  it('a petrified unit is still alive (soft KO, not a real KO)', () => {
    const u = makeUnit('u', 'player');
    u.addStatus('petrify');
    expect(u.isAlive).toBe(true);
  });

  it('Oracle learns Petrify', () => {
    expect(JOB_DEFS.oracle.learnableActives).toContain('petrify');
  });

  it('Petrify inflicts the petrify status on enemies at a low baseAcc', () => {
    const ab = ABILITIES.petrify;
    if (ab.effect.kind !== 'inflict-status') throw new Error('bad fixture');
    expect(ab.effect.statusId).toBe('petrify');
    expect(ab.effect.targetTeam).toBe('enemy');
    expect(ab.effect.baseAccuracy).toBe(60);
  });

  it('Esuna / Remedy / Stigma Magic cure petrify', () => {
    for (const id of ['esuna', 'remedy', 'stigma_magic']) {
      const eff = ABILITIES[id].effect;
      if (eff.kind !== 'cure-status') throw new Error('bad fixture');
      expect(eff.statuses).toContain('petrify');
    }
  });
});
