import { describe, it, expect } from 'vitest';
import { BattleMap, MapData } from '../../src/battle/Map';
import {
  Unit, UnitDef, UnitStats, FACING_N, FACING_E, FACING_S, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import { resolveAttack, resolvePotion, relativeFacing } from '../../src/battle/ActionResolver';

const baseStats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 0, pa: 5, ma: 5, speed: 8, move: 4, jump: 1, faith: 50, bravery: 50,
  ...over,
});

function makeUnit(id: string, team: Team, x: number, z: number, facing: Facing, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = {
    id, name: id, team, jobId: 'x', level: 1, stats: baseStats(over),
  };
  return new Unit(def, x, z, facing);
}

function flatMap(width: number, depth: number, h = 1): MapData {
  const heights: number[][] = [];
  for (let z = 0; z < depth; z++) heights.push(Array(width).fill(h));
  return {
    name: 'flat', width, height: depth, heights,
    spawns: { player: [], enemy: [] },
  };
}

// Deterministic RNG that always returns 0.5 — random factor becomes exactly 1.0
// so we can predict damage by the deterministic part of the formula.
const rngHalf = () => 0.5;

describe('relativeFacing', () => {
  // Target at (3,3) facing N (looking at -z). Attacker positions:
  //   north (3,2) is in front; south (3,4) is behind; east (4,3) and west (2,3) are sides.
  it('classifies attack direction relative to target facing', () => {
    const tgt = makeUnit('t', 'enemy', 3, 3, FACING_N);
    expect(relativeFacing(makeUnit('a', 'player', 3, 2, FACING_S), tgt)).toBe('front');
    expect(relativeFacing(makeUnit('a', 'player', 3, 4, FACING_N), tgt)).toBe('back');
    expect(relativeFacing(makeUnit('a', 'player', 4, 3, FACING_W), tgt)).toBe('side');
    expect(relativeFacing(makeUnit('a', 'player', 2, 3, FACING_E), tgt)).toBe('side');
  });
});

describe('resolveAttack', () => {
  it('back attack outdamages a side attack which outdamages a front attack', () => {
    // Same attacker stats, same elevation, same RNG → only facing differs.
    const map = new BattleMap(flatMap(7, 7));
    const make = () => makeUnit('t', 'enemy', 3, 3, FACING_N, { hp: 999 });

    const tgtFront = make();
    const tgtSide  = make();
    const tgtBack  = make();

    const front = resolveAttack(makeUnit('a', 'player', 3, 2, FACING_S), tgtFront, map, rngHalf);
    const side  = resolveAttack(makeUnit('a', 'player', 4, 3, FACING_W), tgtSide,  map, rngHalf);
    const back  = resolveAttack(makeUnit('a', 'player', 3, 4, FACING_N), tgtBack,  map, rngHalf);

    expect(side.damage).toBeGreaterThan(front.damage);
    expect(back.damage).toBeGreaterThan(side.damage);
  });

  it('high ground deals more damage than low ground', () => {
    // Attacker at (3,2) on h=4, target at (3,3) on h=1 → +3 elevation advantage.
    const data = flatMap(7, 7, 1);
    data.heights[2][3] = 4;
    const map = new BattleMap(data);

    const tgtHigh = makeUnit('t', 'enemy', 3, 3, FACING_N, { hp: 999 });
    const tgtLow  = makeUnit('t', 'enemy', 3, 3, FACING_N, { hp: 999 });

    const high = resolveAttack(makeUnit('a', 'player', 3, 2, FACING_S), tgtHigh, map, rngHalf);

    const flat = new BattleMap(flatMap(7, 7, 1));
    const low = resolveAttack(makeUnit('a', 'player', 3, 2, FACING_S), tgtLow, flat, rngHalf);

    expect(high.heightDiff).toBe(3);
    expect(low.heightDiff).toBe(0);
    expect(high.damage).toBeGreaterThan(low.damage);
  });

  it('subtracts damage from target HP and clamps at 0', () => {
    const map = new BattleMap(flatMap(5, 5));
    const tgt = makeUnit('t', 'enemy', 2, 2, FACING_N, { hp: 5 });
    const out = resolveAttack(makeUnit('a', 'player', 2, 1, FACING_S), tgt, map, rngHalf);
    expect(out.damage).toBeGreaterThan(0);
    expect(tgt.hp).toBe(0);
    expect(tgt.isAlive).toBe(false);
  });
});

describe('resolvePotion', () => {
  it('heals up to hpMax and reports the actual amount applied', () => {
    const tgt = makeUnit('t', 'player', 0, 0, FACING_N);
    tgt.hp = 10;
    const out = resolvePotion(tgt, tgt);
    expect(out.amount).toBe(30);
    expect(tgt.hp).toBe(40);

    tgt.hp = 90;
    const out2 = resolvePotion(tgt, tgt);
    expect(out2.amount).toBe(10); // capped at hpMax (100)
    expect(tgt.hp).toBe(100);
  });
});
