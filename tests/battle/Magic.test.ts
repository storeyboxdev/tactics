import { describe, it, expect } from 'vitest';
import { BattleMap, MapData } from '../../src/battle/Map';
import { Unit, UnitDef, UnitStats, FACING_N, FACING_E, FACING_S, FACING_W, Facing, Team } from '../../src/battle/Unit';
import {
  resolveAttack, resolveSpell, resolveDamageAndStatus, applyBreak, computeSpellDamage,
  predictSpellDamage,
} from '../../src/battle/ActionResolver';
import { BONUS_ARMOR_IDS } from '../../src/data/armor';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 30, pa: 5, ma: 8, speed: 8, move: 4, jump: 1, faith: 50, bravery: 50, evasion: 10,
  ...over,
});

function makeUnit(id: string, team: Team, x: number, z: number, facing: Facing, over: Partial<UnitStats> = {}, jobId = 'x'): Unit {
  const def: UnitDef = {
    id, name: id, team, jobId, level: 1, stats: stats(over),
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
    const o = applyBreak(makeUnit('a', 'player', 0, 0, FACING_N), t, 'pa', 2, rngHalf);
    expect(o.hit).toBe(true);
    expect(t.pa).toBe(3);
    expect(o.amount).toBe(2);
  });

  it('clamps the stat at 1 when a Break would drop it below', () => {
    const t = makeUnit('t', 'enemy', 0, 0, FACING_N, { speed: 2 });
    const o = applyBreak(makeUnit('a', 'player', 0, 0, FACING_N), t, 'speed', 5, rngHalf);
    expect(t.speed).toBe(1);
    expect(o.amount).toBe(1);
  });

  it('a missed Break does not reduce the stat at all', () => {
    const t = makeUnit('t', 'enemy', 0, 0, FACING_N, { pa: 5, evasion: 200 });
    const o = applyBreak(makeUnit('a', 'player', 0, 0, FACING_N), t, 'pa', 2, rngHalf);
    expect(o.hit).toBe(false);
    expect(o.amount).toBe(0);
    expect(t.pa).toBe(5);
  });
});

describe('elemental affinity — weakness', () => {
  it('a Skeleton takes ~1.5x from Holy, its weak element', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const skel = makeUnit('s', 'enemy', 1, 0, FACING_W, { faith: 100 }, 'skeleton');
    const holy = predictSpellDamage(c, skel, 14, 'holy').damage;
    const fire = predictSpellDamage(c, skel, 14, 'fire').damage; // no fire affinity
    expect(holy).toBeGreaterThan(fire);
    expect(holy / fire).toBeCloseTo(1.5, 1);
  });

  it('an element-less spell is unaffected by affinity', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const skel = makeUnit('s', 'enemy', 1, 0, FACING_W, { faith: 100 }, 'skeleton');
    expect(predictSpellDamage(c, skel, 14).damage)
      .toBe(predictSpellDamage(c, skel, 14, 'fire').damage);
  });

  it('a unit with no affinities takes every element the same', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const plain = makeUnit('t', 'enemy', 1, 0, FACING_W, { faith: 100 }); // jobId 'x'
    expect(predictSpellDamage(c, plain, 14, 'holy').damage)
      .toBe(predictSpellDamage(c, plain, 14, 'fire').damage);
  });

  it('a Bomb is weak to Ice but not to Fire (C1)', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const bomb = makeUnit('b', 'enemy', 1, 0, FACING_W, { faith: 100 }, 'bomb');
    expect(predictSpellDamage(c, bomb, 14, 'ice').damage)
      .toBeGreaterThan(predictSpellDamage(c, bomb, 14, 'fire').damage);
  });

  it('resolveSpell applies the weakness on the live damage path', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const a = makeUnit('a', 'enemy', 1, 0, FACING_W, { hp: 999, faith: 100 }, 'skeleton');
    const b = makeUnit('b', 'enemy', 2, 0, FACING_W, { hp: 999, faith: 100 }, 'skeleton');
    const holy = resolveSpell(c, a, 14, rngHalf, 'holy').damage;
    const fire = resolveSpell(c, b, 14, rngHalf, 'fire').damage;
    expect(holy).toBeGreaterThan(fire);
  });
});

describe('elemental affinity — absorb', () => {
  it('a Bomb absorbs Fire — the damage becomes healing', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const bomb = makeUnit('b', 'enemy', 1, 0, FACING_W, { hp: 100, faith: 100 }, 'bomb');
    bomb.applyDamage(60); // room to heal into
    const out = resolveSpell(c, bomb, 14, rngHalf, 'fire');
    expect(out.damage).toBe(0);
    expect(out.absorbed).toBeGreaterThan(0);
    expect(bomb.hp).toBeGreaterThan(40);
  });

  it('absorbed healing is capped at max HP', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const bomb = makeUnit('b', 'enemy', 1, 0, FACING_W, { hp: 100, faith: 100 }, 'bomb');
    const out = resolveSpell(c, bomb, 14, rngHalf, 'fire'); // already full
    expect(out.absorbed).toBe(0);
    expect(bomb.hp).toBe(100);
  });

  it('the Bomb still takes amplified Ice damage — C1 intact', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const bomb = makeUnit('b', 'enemy', 1, 0, FACING_W, { hp: 999, faith: 100 }, 'bomb');
    const out = resolveSpell(c, bomb, 14, rngHalf, 'ice');
    expect(out.damage).toBeGreaterThan(0);
    expect(out.absorbed ?? 0).toBe(0);
  });

  it('an absorbed damage-and-status spell still rolls its status', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const bomb = makeUnit('b', 'enemy', 1, 0, FACING_W, { hp: 100, faith: 100 }, 'bomb');
    bomb.applyDamage(40);
    const out = resolveDamageAndStatus(c, bomb, 12, 'poison', 200, rngHalf, 'fire');
    expect(out.damage).toBe(0);
    expect(out.absorbed).toBeGreaterThan(0);
    expect(out.statusApplied).toBe(true);
  });
});

describe('elemental affinity — resist gear', () => {
  it('Flame Mail halves Fire but leaves other elements alone', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const t = makeUnit('t', 'enemy', 1, 0, FACING_W, { faith: 100 });
    t.armorId = 'flame_mail';
    const fire = predictSpellDamage(c, t, 14, 'fire').damage;
    const ice = predictSpellDamage(c, t, 14, 'ice').damage;
    expect(fire).toBeLessThan(ice);
    expect(fire / ice).toBeCloseTo(0.5, 1);
  });

  it('a unit with no resist armor takes every element the same', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const t = makeUnit('t', 'enemy', 1, 0, FACING_W, { faith: 100 });
    expect(predictSpellDamage(c, t, 14, 'fire').damage)
      .toBe(predictSpellDamage(c, t, 14, 'ice').damage);
  });

  it('resolveSpell applies the resist on the live path', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const guarded = makeUnit('g', 'enemy', 1, 0, FACING_W, { hp: 999, faith: 100 });
    const bare = makeUnit('b', 'enemy', 2, 0, FACING_W, { hp: 999, faith: 100 });
    guarded.armorId = 'flame_mail';
    expect(resolveSpell(c, guarded, 14, rngHalf, 'fire').damage)
      .toBeLessThan(resolveSpell(c, bare, 14, rngHalf, 'fire').damage);
  });

  it('an innate affinity overrides resist gear', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const bomb = makeUnit('b', 'enemy', 1, 0, FACING_W, { hp: 100, faith: 100 }, 'bomb');
    bomb.applyDamage(50);
    bomb.armorId = 'flame_mail'; // resists fire — but the Bomb absorbs it
    expect(resolveSpell(c, bomb, 14, rngHalf, 'fire').absorbed).toBeGreaterThan(0);
  });

  it('the resist armors are loot-tier — sold and lootable', () => {
    expect(BONUS_ARMOR_IDS).toEqual(
      expect.arrayContaining(['flame_mail', 'frost_mail', 'storm_mail']));
  });
});

describe('predictSpellDamage hit chance', () => {
  it('damage spells report hit chance 100 — Faith already gates damage', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { faith: 30 });
    const t = makeUnit('t', 'enemy',  0, 0, FACING_W, { faith: 30 });
    const pred = predictSpellDamage(c, t, 14);
    expect(pred.hitChance).toBe(100);
    // Damage scales with faith squared, so the preview number is small —
    // but the "always-hits" property is what matters for the planner.
    expect(pred.damage).toBeGreaterThanOrEqual(1);
  });
});
