import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import { BattleMap, MapData } from '../../src/battle/Map';
import { effectivePa, resolveAttack } from '../../src/battle/ActionResolver';
import { ABILITIES } from '../../src/data/abilities';
import { JOB_DEFS } from '../../src/data/jobs';
import { STATUS_DEFS } from '../../src/data/statuses';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 30, pa: 10, ma: 8, speed: 10, move: 4, jump: 1,
  faith: 50, bravery: 50, evasion: 0,
  ...over,
});

function makeUnit(id: string, team: Team, x = 0, z = 0, facing: Facing = FACING_E, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = { id, name: id, team, jobId: 'x', level: 1, stats: stats(over) };
  return new Unit(def, x, z, facing);
}

function flatMap(width: number, depth: number, h = 1): MapData {
  const heights: number[][] = [];
  for (let z = 0; z < depth; z++) heights.push(Array(width).fill(h));
  return { name: 'flat', width, height: depth, heights, spawns: { player: [], enemy: [] } };
}

describe('effectivePa: Berserk PA boost', () => {
  it('returns pa unchanged when no berserk', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { pa: 10 });
    expect(effectivePa(u)).toBe(10);
  });

  it('multiplies pa by 1.5 (floored) under Berserk', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { pa: 10 });
    u.addStatus('berserk');
    expect(effectivePa(u)).toBe(15);
  });

  it('uses Math.floor (pa 7 → 10 under berserk)', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { pa: 7 });
    u.addStatus('berserk');
    expect(effectivePa(u)).toBe(10);
  });

  it('resolveAttack damage is higher when attacker is berserked', () => {
    const map = new BattleMap(flatMap(5, 5));
    const baseAtk = makeUnit('a', 'player', 1, 1, FACING_E, { pa: 10 });
    const ragedAtk = makeUnit('r', 'player', 1, 1, FACING_E, { pa: 10 });
    ragedAtk.addStatus('berserk');
    const t1 = makeUnit('t1', 'enemy', 2, 1, FACING_W, { hp: 9999, evasion: 0 });
    const t2 = makeUnit('t2', 'enemy', 2, 1, FACING_W, { hp: 9999, evasion: 0 });
    const baseOut  = resolveAttack(baseAtk, t1, map, () => 0.5);
    const ragedOut = resolveAttack(ragedAtk, t2, map, () => 0.5);
    expect(ragedOut.damage).toBeGreaterThan(baseOut.damage);
  });
});

describe('Berserk status catalog', () => {
  it('Berserk lasts 32 ticks', () => {
    expect(STATUS_DEFS.berserk.expiry).toEqual({ kind: 'duration', ticks: 32 });
  });

  it('Oracle learns Berserk Touch', () => {
    expect(JOB_DEFS.oracle.learnableActives).toContain('berserk_touch');
  });

  it('Berserk Touch is melee range, inflicts berserk', () => {
    const ab = ABILITIES.berserk_touch;
    expect(ab.range).toBe(1);
    expect(ab.type).toBe('magical');
    if (ab.effect.kind !== 'inflict-status') throw new Error('bad fixture');
    expect(ab.effect.statusId).toBe('berserk');
    expect(ab.effect.targetTeam).toBe('enemy');
  });

  it('Esuna / Remedy / Stigma Magic cure berserk', () => {
    for (const id of ['esuna', 'remedy', 'stigma_magic']) {
      const eff = ABILITIES[id].effect;
      if (eff.kind !== 'cure-status') throw new Error('bad fixture');
      expect(eff.statuses).toContain('berserk');
    }
  });
});

describe('Confuse status catalog', () => {
  it('Confuse lasts 24 ticks', () => {
    expect(STATUS_DEFS.confuse.expiry).toEqual({ kind: 'duration', ticks: 24 });
  });

  it('Confuse does NOT boost PA (disorientation, not rage)', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { pa: 10 });
    u.addStatus('confuse');
    expect(effectivePa(u)).toBe(10);
  });

  it('Oracle learns Confuse', () => {
    expect(JOB_DEFS.oracle.learnableActives).toContain('confuse');
  });

  it('Confuse is ranged, charged, inflicts confuse', () => {
    const ab = ABILITIES.confuse;
    expect(ab.range).toBe(4);
    expect(ab.chargeTime).toBe(2);
    if (ab.effect.kind !== 'inflict-status') throw new Error('bad fixture');
    expect(ab.effect.statusId).toBe('confuse');
    expect(ab.effect.targetTeam).toBe('enemy');
  });

  it('Esuna / Remedy / Stigma Magic cure confuse', () => {
    for (const id of ['esuna', 'remedy', 'stigma_magic']) {
      const eff = ABILITIES[id].effect;
      if (eff.kind !== 'cure-status') throw new Error('bad fixture');
      expect(eff.statuses).toContain('confuse');
    }
  });
});
