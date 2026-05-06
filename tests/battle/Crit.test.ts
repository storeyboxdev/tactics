import { describe, it, expect } from 'vitest';
import { BattleMap, MapData } from '../../src/battle/Map';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, FACING_N, FACING_S, Facing, Team,
} from '../../src/battle/Unit';
import {
  rollCrit, resolveAttack, resolveRangedAttack, predictAttackDamage,
  CRIT_MULTIPLIER, CRIT_CHANCE_BY_FACING,
} from '../../src/battle/ActionResolver';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 0, pa: 5, ma: 8, speed: 8, move: 4, jump: 1,
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

describe('rollCrit', () => {
  it('uses the per-facing chance table', () => {
    expect(CRIT_CHANCE_BY_FACING.front).toBe(5);
    expect(CRIT_CHANCE_BY_FACING.side).toBe(10);
    expect(CRIT_CHANCE_BY_FACING.back).toBe(15);
  });

  it('front: rng 0.04 crits, 0.06 does not', () => {
    expect(rollCrit('front', () => 0.04)).toBe(true);
    expect(rollCrit('front', () => 0.06)).toBe(false);
  });

  it('back: rng 0.14 crits, 0.16 does not', () => {
    expect(rollCrit('back', () => 0.14)).toBe(true);
    expect(rollCrit('back', () => 0.16)).toBe(false);
  });
});

describe('resolveAttack — crit application', () => {
  it('records crit:false on a normal hit (rng=0.5 never crits at any facing)', () => {
    const map = new BattleMap(flatMap(5, 5));
    const tgt = makeUnit('t', 'enemy', 2, 2, FACING_N, { hp: 200 });
    const out = resolveAttack(makeUnit('a', 'player', 2, 1, FACING_S), tgt, map, () => 0.5);
    expect(out.hit).toBe(true);
    expect(out.crit).toBe(false);
  });

  it('applies the 1.5x multiplier on crit', () => {
    // Sequenced rng so the second pull (crit roll) lands at 0.01 — guaranteed
    // crit at any facing. The third pull is the damage random multiplier.
    const seq = [0.5 /*hit*/, 0.01 /*crit yes*/, 0.5 /*randomMul=1.0*/];
    let i = 0;
    const rng = () => seq[i++];
    const map = new BattleMap(flatMap(5, 5));
    const tgt = makeUnit('t', 'enemy', 2, 2, FACING_N, { hp: 200 });
    const out = resolveAttack(makeUnit('a', 'player', 2, 1, FACING_S), tgt, map, rng);
    expect(out.hit).toBe(true);
    expect(out.crit).toBe(true);
    // Same attack at rng=0.5 normally deals pa*wp*facing*height*1.0. With
    // crit applied: floor(base * 1.5).
    // pa=5, wp=4, front facing 1.0, height 1.0 = 20 base, crit → 30.
    expect(out.damage).toBe(Math.floor(20 * CRIT_MULTIPLIER));
  });

  it('a missed attack never crits', () => {
    const map = new BattleMap(flatMap(5, 5));
    const tgt = makeUnit('t', 'enemy', 2, 2, FACING_N, { hp: 200, evasion: 200 });
    // rng=0.5 → hit roll 50 < 0 → miss, short-circuits before crit roll.
    const out = resolveAttack(makeUnit('a', 'player', 2, 1, FACING_S), tgt, map, () => 0.5);
    expect(out.hit).toBe(false);
    expect(out.crit).toBe(false);
  });
});

describe('resolveRangedAttack — crit application', () => {
  it('mirrors melee: crit:true and 1.5x damage when forced', () => {
    const seq = [0.5 /*hit*/, 0.01 /*crit*/, 0.5 /*randomMul*/];
    let i = 0;
    const rng = () => seq[i++];
    const map = new BattleMap(flatMap(5, 5));
    const a = makeUnit('a', 'player', 0, 0, FACING_E, { pa: 5 });
    const t = makeUnit('t', 'enemy', 3, 0, FACING_W);
    const out = resolveRangedAttack(a, t, 6, map, rng);
    expect(out.hit).toBe(true);
    expect(out.crit).toBe(true);
    // pa 5 × wp 6 × front × randomMul 1.0 = 30 base, crit → 45
    expect(out.damage).toBe(Math.floor(30 * CRIT_MULTIPLIER));
  });
});

describe('predictAttackDamage — exposes critChance', () => {
  it('reports the per-facing crit chance for the planner', () => {
    const map = new BattleMap(flatMap(5, 5));
    const tgt = makeUnit('t', 'enemy', 2, 2, FACING_N);
    // attacker on (2,1) facing south → strikes target's front.
    const front = predictAttackDamage(makeUnit('a', 'player', 2, 1, FACING_S), tgt, map);
    expect(front.facing).toBe('front');
    expect(front.critChance).toBe(CRIT_CHANCE_BY_FACING.front);

    // attacker on (2,3) facing north → target's back.
    const back = predictAttackDamage(makeUnit('a', 'player', 2, 3, FACING_N), tgt, map);
    expect(back.facing).toBe('back');
    expect(back.critChance).toBe(CRIT_CHANCE_BY_FACING.back);
  });
});
