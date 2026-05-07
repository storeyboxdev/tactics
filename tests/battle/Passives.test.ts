import { describe, it, expect } from 'vitest';
import { BattleMap, MapData } from '../../src/battle/Map';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import {
  effectiveMa, predictSpellDamage, resolveSpell,
} from '../../src/battle/ActionResolver';
import { MovePlan } from '../../src/battle/Movement';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 30, pa: 5, ma: 8, speed: 8, move: 4, jump: 1,
  faith: 50, bravery: 50, evasion: 10,
  ...over,
});

function makeUnit(id: string, team: Team, x: number, z: number, facing: Facing, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = { id, name: id, team, jobId: 'x', level: 1, stats: stats(over) };
  return new Unit(def, x, z, facing);
}

function flatMap(width: number, depth: number, h = 1): MapData {
  const heights: number[][] = [];
  for (let z = 0; z < depth; z++) heights.push(Array(width).fill(h));
  return { name: 'flat', width, height: depth, heights, spawns: { player: [], enemy: [] } };
}

const rngHalf = () => 0.5;

describe('Move +2', () => {
  it('expands the BFS reachable set further than Move +1', () => {
    const map = new BattleMap(flatMap(15, 15));
    const u1 = makeUnit('u1', 'player', 7, 7, FACING_E, { move: 4 });
    u1.movement = 'move_plus_1';
    const plan1 = new MovePlan(u1, map, [u1]);

    const u2 = makeUnit('u2', 'player', 7, 7, FACING_E, { move: 4 });
    u2.movement = 'move_plus_2';
    const plan2 = new MovePlan(u2, map, [u2]);

    expect(plan2.endTiles().length).toBeGreaterThan(plan1.endTiles().length);
  });
});

describe('Magic Attack Up', () => {
  it('effectiveMa returns base MA for a unit with no support', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { ma: 8 });
    expect(effectiveMa(u)).toBe(8);
  });

  it('effectiveMa multiplies by the support factor when magic_attack_up is equipped', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { ma: 8 });
    u.support = 'magic_attack_up';
    // 8 × 1.25 = 10
    expect(effectiveMa(u)).toBe(10);
  });

  it('predictSpellDamage scales with the boosted MA', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const t = makeUnit('t', 'enemy',  1, 0, FACING_W, { faith: 100 });
    const baseline = predictSpellDamage(c, t, 14);
    c.support = 'magic_attack_up';
    const boosted  = predictSpellDamage(c, t, 14);
    expect(boosted.damage).toBeGreaterThan(baseline.damage);
  });

  it('resolveSpell deals more damage with magic_attack_up equipped', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const t = makeUnit('t', 'enemy',  1, 0, FACING_W, { hp: 999, faith: 100 });
    const baseline = resolveSpell(c, t, 14, rngHalf);
    t.hp = 999;
    c.support = 'magic_attack_up';
    const boosted = resolveSpell(c, t, 14, rngHalf);
    expect(boosted.damage).toBeGreaterThan(baseline.damage);
  });
});
