import { describe, it, expect } from 'vitest';
import { BattleMap, MapData } from '../../src/battle/Map';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import {
  resolveRangedAttack, resolveHeal, computeHealAmount, predictHeal, predictRangedAttack,
} from '../../src/battle/ActionResolver';
import { abilityTargets } from '../../src/battle/Targeting';
import { ABILITIES } from '../../src/data/abilities';

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

describe('resolveRangedAttack', () => {
  it('deals pa × weaponPower at flat ground, front facing', () => {
    const map = new BattleMap(flatMap(8, 8));
    const a = makeUnit('a', 'player', 0, 0, FACING_E, { pa: 5 });
    const t = makeUnit('t', 'enemy',  3, 0, FACING_W, { hp: 100 });
    const out = resolveRangedAttack(a, t, 6, map, rngHalf);
    // pa 5 × wp 6 × facing 1.0 (front) × height 1.0 × randomMul 1.0 = 30
    expect(out.damage).toBe(30);
    expect(t.hp).toBe(70);
  });

  it('benefits from side/back facing same as melee', () => {
    const map = new BattleMap(flatMap(8, 8));
    const a = makeUnit('a', 'player', 0, 0, FACING_E, { pa: 5 });
    const tBack = makeUnit('back', 'enemy', 3, 0, FACING_E);  // facing same way as a → back hit
    const out = resolveRangedAttack(a, tBack, 6, map, rngHalf);
    // back facing mod 1.25 → 30 × 1.25 = 37
    expect(out.damage).toBe(37);
    expect(out.facing).toBe('back');
  });

  it('does not trigger Counter (ranged attacks bypass it)', () => {
    const map = new BattleMap(flatMap(8, 8));
    const a = makeUnit('a', 'player', 0, 0, FACING_E, { pa: 5 });
    const t = makeUnit('t', 'enemy',  3, 0, FACING_W, { hp: 100 });
    t.reaction = 'counter';
    t.bravery = 100;
    const before = a.hp;
    resolveRangedAttack(a, t, 6, map, rngHalf);
    // Counter would normally dent the attacker; ranged bypasses it.
    expect(a.hp).toBe(before);
  });

  it('breaks Sleep on hit (same as melee)', () => {
    const map = new BattleMap(flatMap(8, 8));
    const a = makeUnit('a', 'player', 0, 0, FACING_E, { pa: 5 });
    const t = makeUnit('t', 'enemy',  3, 0, FACING_W);
    t.addStatus('sleep');
    expect(t.hasStatus('sleep')).toBe(true);
    resolveRangedAttack(a, t, 6, map, rngHalf);
    expect(t.hasStatus('sleep')).toBe(false);
  });
});

describe('predictRangedAttack', () => {
  it('matches the deterministic damage of resolveRangedAttack at randomMul=1.0', () => {
    const map = new BattleMap(flatMap(8, 8));
    const a = makeUnit('a', 'player', 0, 0, FACING_E, { pa: 5 });
    const t = makeUnit('t', 'enemy',  3, 0, FACING_W, { hp: 100 });
    const pred = predictRangedAttack(a, t, 6, map);
    expect(pred.damage).toBe(30);
    expect(pred.facing).toBe('front');
    expect(pred.heightDiff).toBe(0);
  });
});

describe('resolveHeal / computeHealAmount', () => {
  it('faith-scales like magic damage but adds HP', () => {
    // 8 ma × 12 sp × 0.7 cFaith × 0.7 tFaith × 1.0 rng = 47
    const amt = computeHealAmount({
      ma: 8, spellPower: 12, casterFaith: 70, targetFaith: 70, randomMul: 1.0,
    });
    expect(amt).toBe(Math.floor(8 * 12 * 0.7 * 0.7));
  });

  it('applied healing caps at hpMax — never overflows', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const t = makeUnit('t', 'player', 1, 0, FACING_W, { hp: 100, faith: 100 });
    t.hp = 80;
    const out = resolveHeal(c, t, 12, rngHalf);
    expect(t.hp).toBe(t.hpMax);
    expect(out.amount).toBe(20); // only the gap counted
  });

  it('predictHeal matches resolveHeal at randomMul=1.0', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E);
    const t = makeUnit('t', 'player', 1, 0, FACING_W);
    t.hp = 1;
    const pred = predictHeal(c, t, 12);
    const out = resolveHeal(c, t, 12, () => 0.5);
    // pred is the *raw* amount; out.amount is the actual gap filled (≥ pred clamped).
    expect(out.amount).toBe(Math.min(pred.amount, t.hpMax - 1));
  });

  it('a successful heal does NOT break Sleep', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E);
    const t = makeUnit('t', 'player', 1, 0, FACING_W);
    t.addStatus('sleep');
    t.hp = 50;
    resolveHeal(c, t, 12, rngHalf);
    expect(t.hasStatus('sleep')).toBe(true);
  });
});

describe('abilityTargets — new effect kinds', () => {
  it('magic-heal targets allies (incl. self) but not enemies', () => {
    const map = new BattleMap(flatMap(8, 8));
    const wm = makeUnit('wm', 'player', 0, 0, FACING_E);
    const ally  = makeUnit('al', 'player', 1, 0, FACING_W);
    const enemy = makeUnit('en', 'enemy',  2, 0, FACING_W);
    const units = [wm, ally, enemy];
    const tiles = abilityTargets(wm, ABILITIES.cure, map, units);
    const xs = tiles.map(t => `${t.x},${t.z}`).sort();
    expect(xs).toContain('0,0'); // self
    expect(xs).toContain('1,0'); // ally
    expect(xs).not.toContain('2,0'); // enemy
  });

  it('physical-ranged-damage targets enemies in range, not allies', () => {
    const map = new BattleMap(flatMap(8, 8));
    const ar = makeUnit('ar', 'player', 0, 0, FACING_E);
    const ally  = makeUnit('al', 'player', 1, 0, FACING_W);
    const enemy = makeUnit('en', 'enemy',  3, 0, FACING_W);
    const units = [ar, ally, enemy];
    const tiles = abilityTargets(ar, ABILITIES.charge_2, map, units);
    const xs = tiles.map(t => `${t.x},${t.z}`).sort();
    expect(xs).toContain('3,0');
    expect(xs).not.toContain('1,0');
    expect(xs).not.toContain('0,0');
  });
});
