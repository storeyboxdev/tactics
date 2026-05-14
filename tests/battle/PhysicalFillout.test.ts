import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import { applyStatShift } from '../../src/battle/ActionResolver';
import { ABILITIES } from '../../src/data/abilities';
import { JOB_DEFS } from '../../src/data/jobs';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 30, pa: 5, ma: 8, speed: 8, move: 4, jump: 1,
  faith: 50, bravery: 50, evasion: 10,
  ...over,
});

function makeUnit(id: string, team: Team, x = 0, z = 0, facing: Facing = FACING_E, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = { id, name: id, team, jobId: 'x', level: 1, stats: stats(over) };
  return new Unit(def, x, z, facing);
}

describe('applyStatShift: PA / MA / Speed (per-battle by default)', () => {
  it('shifts PA and does NOT touch UnitProgression', () => {
    const a = makeUnit('a', 'player', 0, 0, FACING_E);
    const b = makeUnit('b', 'player', 1, 0, FACING_W, { pa: 5 });
    const out = applyStatShift(a, b, 'pa', 1);
    expect(out.before).toBe(5);
    expect(out.after).toBe(6);
    expect(b.pa).toBe(6);
    // No progression on test units, so the sync path is a no-op either way —
    // but the function should not crash.
    expect(b.progression).toBeFalsy();
  });

  it('shifts MA upward with the same clamp behavior as faith/bravery', () => {
    const a = makeUnit('a', 'player', 0, 0, FACING_E);
    const b = makeUnit('b', 'player', 1, 0, FACING_W, { ma: 99 });
    const out = applyStatShift(a, b, 'ma', 5);
    expect(out.after).toBe(100);     // clamped
    expect(b.ma).toBe(100);
  });

  it('shifts Speed downward and floors at 1', () => {
    const a = makeUnit('a', 'enemy', 0, 0, FACING_E);
    const b = makeUnit('b', 'player', 1, 0, FACING_W, { speed: 3 });
    const out = applyStatShift(a, b, 'speed', -10);
    expect(out.after).toBe(1);
    expect(b.speed).toBe(1);
  });

  it('faith/bravery still clamp the same way (regression)', () => {
    const a = makeUnit('a', 'player', 0, 0, FACING_E);
    const b = makeUnit('b', 'player', 1, 0, FACING_W, { faith: 95 });
    applyStatShift(a, b, 'faith', 10);
    expect(b.faith).toBe(100);
  });

  it('explicit persistent=false on faith does not sync to progression', () => {
    // No progression on test units; this just confirms the gate compiles and
    // runs without throwing.
    const a = makeUnit('a', 'player', 0, 0, FACING_E);
    const b = makeUnit('b', 'player', 1, 0, FACING_W, { faith: 60 });
    expect(() => applyStatShift(a, b, 'faith', 5, false)).not.toThrow();
    expect(b.faith).toBe(65);
  });
});

describe('Archer: Aim tiers', () => {
  it('Archer learns Aim+1, Charge+2, Aim+3 in CT order', () => {
    const archer = JOB_DEFS.archer.learnableActives;
    expect(archer).toEqual(['aim_plus_1', 'charge_2', 'aim_plus_3']);
  });

  it('Aim tiers trade charge time for weaponPower', () => {
    const a1 = ABILITIES.aim_plus_1.effect;
    const c2 = ABILITIES.charge_2.effect;
    const a3 = ABILITIES.aim_plus_3.effect;
    if (a1.kind !== 'physical-ranged-damage') throw new Error('bad fixture');
    if (c2.kind !== 'physical-ranged-damage') throw new Error('bad fixture');
    if (a3.kind !== 'physical-ranged-damage') throw new Error('bad fixture');
    expect(a1.weaponPower).toBeLessThan(c2.weaponPower);
    expect(c2.weaponPower).toBeLessThan(a3.weaponPower);
    expect(ABILITIES.aim_plus_1.chargeTime).toBeLessThan(ABILITIES.charge_2.chargeTime);
    expect(ABILITIES.charge_2.chargeTime).toBeLessThan(ABILITIES.aim_plus_3.chargeTime);
  });
});

describe('Knight: Magic Break', () => {
  it('Knight learns Magic Break alongside Power/Speed Break', () => {
    const knight = JOB_DEFS.knight.learnableActives;
    expect(knight).toContain('power_break');
    expect(knight).toContain('speed_break');
    expect(knight).toContain('magic_break');
  });

  it('Magic Break is an ma debuff at melee range', () => {
    const eff = ABILITIES.magic_break.effect;
    if (eff.kind !== 'debuff') throw new Error('bad fixture');
    expect(eff.stat).toBe('ma');
    expect(eff.amount).toBe(2);
    expect(ABILITIES.magic_break.range).toBe(1);
  });
});

describe('Squire: Accumulate + Yell', () => {
  it('Squire learns Accumulate and Yell', () => {
    expect(JOB_DEFS.squire.learnableActives).toContain('accumulate');
    expect(JOB_DEFS.squire.learnableActives).toContain('yell');
  });

  it('Accumulate is a non-persistent self PA buff', () => {
    const eff = ABILITIES.accumulate.effect;
    if (eff.kind !== 'stat-shift') throw new Error('bad fixture');
    expect(eff.stat).toBe('pa');
    expect(eff.amount).toBe(1);
    expect(eff.persistent).toBe(false);
    expect(ABILITIES.accumulate.range).toBe(0); // self-only
  });

  it('Yell is a non-persistent ally Speed buff at range 1', () => {
    const eff = ABILITIES.yell.effect;
    if (eff.kind !== 'stat-shift') throw new Error('bad fixture');
    expect(eff.stat).toBe('speed');
    expect(eff.amount).toBe(1);
    expect(eff.persistent).toBe(false);
    expect(ABILITIES.yell.range).toBe(1);
  });
});
