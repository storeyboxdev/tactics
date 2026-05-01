import { describe, it, expect } from 'vitest';
import { BattleMap, MapData } from '../../src/battle/Map';
import { Unit, UnitDef, UnitStats, FACING_N, FACING_E, FACING_S, FACING_W, Facing, Team } from '../../src/battle/Unit';
import {
  resolveAttack, resolveSpell, applyBreak, computeSpellDamage,
} from '../../src/battle/ActionResolver';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 30, pa: 5, ma: 8, speed: 8, move: 4, jump: 1, faith: 50, bravery: 50,
  ...over,
});

function makeUnit(id: string, team: Team, x: number, z: number, facing: Facing, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = {
    id, name: id, team, jobId: 'x', level: 1, stats: stats(over),
  };
  return new Unit(def, x, z, facing);
}

function flatMap(width: number, depth: number, h = 1): MapData {
  const heights: number[][] = [];
  for (let z = 0; z < depth; z++) heights.push(Array(width).fill(h));
  return { name: 'flat', width, height: depth, heights, spawns: { player: [], enemy: [] } };
}

const rngHalf = () => 0.5;

describe('Faith-scaled magic damage', () => {
  it('scales with caster Faith × target Faith', () => {
    // Same MA, spell power, RNG. Only faith differs.
    const high = computeSpellDamage({ ma: 8, spellPower: 14, casterFaith: 100, targetFaith: 100, randomMul: 1.0 });
    const med  = computeSpellDamage({ ma: 8, spellPower: 14, casterFaith: 50,  targetFaith: 50,  randomMul: 1.0 });
    const low  = computeSpellDamage({ ma: 8, spellPower: 14, casterFaith: 25,  targetFaith: 25,  randomMul: 1.0 });
    expect(high).toBeGreaterThan(med);
    expect(med).toBeGreaterThan(low);
    // 8 * 14 * 1.0 * 1.0 * 1.0 = 112
    expect(high).toBe(112);
    // 8 * 14 * 0.5 * 0.5 = 28
    expect(med).toBe(28);
  });

  it('resolveSpell applies damage and respects RNG', () => {
    const caster = makeUnit('m', 'player', 0, 0, FACING_E, { ma: 10, faith: 80 });
    const target = makeUnit('t', 'enemy',  3, 0, FACING_S, { hp: 50, faith: 80 });
    const out = resolveSpell(caster, target, 14, rngHalf);
    // 10 * 14 * 0.8 * 0.8 * 1.0 = 89.6 → 89
    expect(out.damage).toBe(89);
    expect(target.hp).toBe(0);
    expect(target.isAlive).toBe(false);
  });
});

describe('Counter reaction', () => {
  it('a target equipped with Counter at high bravery counters and damages attacker', () => {
    const map = new BattleMap(flatMap(5, 5));
    const attacker = makeUnit('a', 'player', 2, 2, FACING_E, { hp: 50, pa: 5 });
    const target   = makeUnit('t', 'enemy',  3, 2, FACING_E, { hp: 50, pa: 5, bravery: 100 });
    target.reaction = 'counter';
    const out = resolveAttack(attacker, target, map, rngHalf);
    expect(out.counter).toBeDefined();
    expect(out.counter!.counterer).toBe(target);
    expect(out.counter!.victim).toBe(attacker);
    expect(attacker.hp).toBeLessThan(50);
  });

  it('does not counter when bravery roll fails', () => {
    const map = new BattleMap(flatMap(5, 5));
    const attacker = makeUnit('a', 'player', 2, 2, FACING_E, { hp: 50 });
    const target   = makeUnit('t', 'enemy',  3, 2, FACING_E, { hp: 50, bravery: 0 });
    target.reaction = 'counter';
    const out = resolveAttack(attacker, target, map, rngHalf);
    expect(out.counter).toBeUndefined();
    expect(attacker.hp).toBe(50);
  });

  it('does not counter when the target dies from the hit', () => {
    const map = new BattleMap(flatMap(5, 5));
    const attacker = makeUnit('a', 'player', 2, 2, FACING_E, { pa: 50 });
    const target   = makeUnit('t', 'enemy',  3, 2, FACING_E, { hp: 5, bravery: 100 });
    target.reaction = 'counter';
    const out = resolveAttack(attacker, target, map, rngHalf);
    expect(target.isAlive).toBe(false);
    expect(out.counter).toBeUndefined();
  });

  it('counters do not chain (no counter-of-counter)', () => {
    // Both face each other so both attacks hit "front" → 20 dmg each (5*4*1.0).
    // If chains were allowed, attacker would counter the counter, dealing
    // another 20 to target → target hp would land at 10. We expect 30.
    const map = new BattleMap(flatMap(5, 5));
    const attacker = makeUnit('a', 'player', 2, 2, FACING_E, { hp: 50, pa: 5, bravery: 100 });
    const target   = makeUnit('t', 'enemy',  3, 2, FACING_W, { hp: 50, pa: 5, bravery: 100 });
    attacker.reaction = 'counter';
    target.reaction = 'counter';
    resolveAttack(attacker, target, map, rngHalf);
    expect(target.hp).toBe(30);
    expect(attacker.hp).toBe(30);
  });

  it('does not counter when no Counter ability is equipped', () => {
    const map = new BattleMap(flatMap(5, 5));
    const attacker = makeUnit('a', 'player', 2, 2, FACING_E, { hp: 50 });
    const target   = makeUnit('t', 'enemy',  3, 2, FACING_E, { hp: 50, bravery: 100 });
    // High bravery but no Counter equipped → no counter fires.
    const out = resolveAttack(attacker, target, map, rngHalf);
    expect(out.counter).toBeUndefined();
    expect(attacker.hp).toBe(50);
  });
});

describe('applyBreak', () => {
  it('reduces the named stat and returns the actual amount applied', () => {
    const t = makeUnit('t', 'enemy', 0, 0, FACING_N, { pa: 5 });
    const o = applyBreak(makeUnit('a', 'player', 0, 0, FACING_N), t, 'pa', 2);
    expect(t.pa).toBe(3);
    expect(o.amount).toBe(2);
  });

  it('clamps the stat at 1 when a Break would drop it below', () => {
    const t = makeUnit('t', 'enemy', 0, 0, FACING_N, { speed: 2 });
    const o = applyBreak(makeUnit('a', 'player', 0, 0, FACING_N), t, 'speed', 5);
    expect(t.speed).toBe(1);
    expect(o.amount).toBe(1);
  });
});
