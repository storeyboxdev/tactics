import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, Facing, Team,
} from '../../src/battle/Unit';
import { resolveFlatHeal } from '../../src/battle/ActionResolver';
import { ABILITIES } from '../../src/data/abilities';
import { JOB_DEFS } from '../../src/data/jobs';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 30, pa: 5, ma: 4, speed: 8, move: 4, jump: 1,
  faith: 50, bravery: 50, evasion: 10,
  ...over,
});

function makeUnit(id: string, team: Team, x = 0, z = 0, facing: Facing = FACING_E, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = { id, name: id, team, jobId: 'x', level: 1, stats: stats(over) };
  return new Unit(def, x, z, facing);
}

describe('resolveFlatHeal: HP restore', () => {
  it('heals the requested amount on a wounded target', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 30 });
    u.hpMax = 100;
    u.hp = 30;
    const out = resolveFlatHeal(u, u, 50);
    expect(out.hpRestored).toBe(50);
    expect(u.hp).toBe(80);
  });

  it('caps at hpMax', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 80 });
    u.hpMax = 100;
    u.hp = 80;
    const out = resolveFlatHeal(u, u, 50);
    expect(out.hpRestored).toBe(20);
    expect(u.hp).toBe(100);
  });

  it('returns 0 on a full target', () => {
    const u = makeUnit('u', 'player');
    const out = resolveFlatHeal(u, u, 50);
    expect(out.hpRestored).toBe(0);
    expect(u.hp).toBe(u.hpMax);
  });
});

describe('resolveFlatHeal: MP restore', () => {
  it('restores MP and caps at mpMax', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { mp: 5 });
    u.mpMax = 30;
    u.mp = 5;
    const out = resolveFlatHeal(u, u, undefined, 20);
    expect(out.mpRestored).toBe(20);
    expect(u.mp).toBe(25);
    // Cap test:
    const out2 = resolveFlatHeal(u, u, undefined, 20);
    expect(out2.mpRestored).toBe(5);
    expect(u.mp).toBe(30);
  });

  it('does not touch HP when only MP is requested', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 50 });
    u.hpMax = 100;
    u.hp = 50;
    u.mp = 5;
    const before = u.hp;
    resolveFlatHeal(u, u, undefined, 20);
    expect(u.hp).toBe(before);
  });
});

describe('resolveFlatHeal: combined HP + MP', () => {
  it('heals both in one call', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 30, mp: 5 });
    u.hpMax = 100; u.hp = 30;
    u.mpMax = 30;  u.mp = 5;
    const out = resolveFlatHeal(u, u, 50, 20);
    expect(out.hpRestored).toBe(50);
    expect(out.mpRestored).toBe(20);
  });
});

describe('Chemist catalog', () => {
  it('Chemist learns Hi-Potion and Ether', () => {
    expect(JOB_DEFS.chemist.learnableActives).toContain('hi_potion');
    expect(JOB_DEFS.chemist.learnableActives).toContain('ether');
  });

  it('Hi-Potion is a flat HP-only heal, melee, physical', () => {
    const ab = ABILITIES.hi_potion;
    expect(ab.range).toBe(1);
    expect(ab.type).toBe('physical');
    if (ab.effect.kind !== 'flat-heal') throw new Error('bad fixture');
    expect(ab.effect.hp).toBe(50);
    expect(ab.effect.mp).toBeUndefined();
  });

  it('Ether is a flat MP-only restore, melee, physical', () => {
    const ab = ABILITIES.ether;
    expect(ab.range).toBe(1);
    expect(ab.type).toBe('physical');
    if (ab.effect.kind !== 'flat-heal') throw new Error('bad fixture');
    expect(ab.effect.hp).toBeUndefined();
    expect(ab.effect.mp).toBe(20);
  });
});
