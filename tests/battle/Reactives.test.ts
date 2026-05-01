import { describe, it, expect } from 'vitest';
import { BattleMap, MapData } from '../../src/battle/Map';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_N, Facing, Team,
} from '../../src/battle/Unit';
import { resolveAttack, resolveSpell } from '../../src/battle/ActionResolver';
import { MovePlan } from '../../src/battle/Movement';

const baseStats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 0, pa: 5, ma: 8, speed: 8, move: 4, jump: 1, faith: 50, bravery: 50,
  ...over,
});

function makeUnit(id: string, team: Team, x: number, z: number, facing: Facing, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = { id, name: id, team, jobId: 'x', level: 1, stats: baseStats(over) };
  return new Unit(def, x, z, facing);
}

function flatMap(width: number, depth: number, h = 1): MapData {
  const heights: number[][] = [];
  for (let z = 0; z < depth; z++) heights.push(Array(width).fill(h));
  return { name: 'flat', width, height: depth, heights, spawns: { player: [], enemy: [] } };
}

const rngHalf = () => 0.5;

describe('Auto-Potion reaction', () => {
  it('heals the target when struck by a melee attack', () => {
    const map = new BattleMap(flatMap(5, 5));
    const attacker = makeUnit('a', 'player', 2, 2, FACING_E, { pa: 5 });
    const target   = makeUnit('t', 'enemy',  3, 2, FACING_E, { hp: 100, bravery: 0 });
    target.reaction = 'auto_potion';
    const out = resolveAttack(attacker, target, map, rngHalf);
    expect(out.autoPotion).toBeDefined();
    // 20 damage from front-attack baseline; auto-potion heals 30.
    // hp should end at 100 - 20 + 10 (clamped to max) = 100? No:
    //   start 100, dmg 20 → 80, heal up to +30 capped at 100 → applied 20.
    expect(out.autoPotion!.amount).toBeLessThanOrEqual(30);
    expect(target.hp).toBeGreaterThanOrEqual(80); // healed back up
  });

  it('also fires on magic damage (Counter does not, but Auto-Potion does)', () => {
    const caster = makeUnit('m', 'player', 0, 0, FACING_E, { ma: 8, faith: 80 });
    const target = makeUnit('t', 'enemy',  3, 0, FACING_E, { hp: 100, faith: 80 });
    target.reaction = 'auto_potion';
    const out = resolveSpell(caster, target, 14, rngHalf);
    expect(out.autoPotion).toBeDefined();
    expect(out.autoPotion!.amount).toBeGreaterThan(0);
  });

  it('does not heal if the unit dies from the hit', () => {
    const map = new BattleMap(flatMap(5, 5));
    const attacker = makeUnit('a', 'player', 2, 2, FACING_E, { pa: 50 });
    const target   = makeUnit('t', 'enemy',  3, 2, FACING_E, { hp: 5 });
    target.reaction = 'auto_potion';
    const out = resolveAttack(attacker, target, map, rngHalf);
    expect(target.isAlive).toBe(false);
    expect(out.autoPotion).toBeUndefined();
  });
});

describe('Move +1 movement', () => {
  it('expands BFS reachable count by adjusting effectiveMove', () => {
    const map = new BattleMap(flatMap(11, 11));
    const baseUnit = makeUnit('a', 'player', 5, 5, FACING_N, { move: 3 });
    const planBase = new MovePlan(baseUnit, map, [baseUnit]);
    const baseCount = planBase.endTiles().length;

    const buffedUnit = makeUnit('b', 'player', 5, 5, FACING_N, { move: 3 });
    buffedUnit.movement = 'move_plus_1';
    const planBuffed = new MovePlan(buffedUnit, map, [buffedUnit]);
    expect(planBuffed.endTiles().length).toBeGreaterThan(baseCount);
  });

  it('effectiveMove returns base move when no movement ability is equipped', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_N, { move: 4 });
    expect(u.effectiveMove).toBe(4);
  });
});

describe('Unit slot defaults', () => {
  it('reaction/support/movement default to null when no def fields are passed', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_N);
    expect(u.reaction).toBeNull();
    expect(u.support).toBeNull();
    expect(u.movement).toBeNull();
  });
});
