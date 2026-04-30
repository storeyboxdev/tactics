import { describe, it, expect } from 'vitest';
import { BattleMap, MapData } from '../../src/battle/Map';
import { Unit, UnitDef, UnitStats, FACING_E } from '../../src/battle/Unit';
import { MovePlan } from '../../src/battle/Movement';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 50, mp: 0, pa: 5, ma: 5, speed: 8, move: 4, jump: 1, faith: 50, bravery: 50,
  ...over,
});

function makeUnit(id: string, x: number, z: number, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = {
    id, name: id, team: 'player', jobId: 'squire', level: 1, stats: stats(over),
  };
  return new Unit(def, x, z, FACING_E);
}

function flatMap(width: number, depth: number, h = 1): MapData {
  const heights: number[][] = [];
  for (let z = 0; z < depth; z++) heights.push(Array(width).fill(h));
  return {
    name: 'flat', width, height: depth, heights,
    spawns: { player: [], enemy: [] },
  };
}

describe('MovePlan', () => {
  it('reaches all tiles within Manhattan distance ≤ move on a flat empty map', () => {
    const map = new BattleMap(flatMap(7, 7));
    const u = makeUnit('u', 3, 3, { move: 2 });
    const plan = new MovePlan(u, map, [u]);
    const reachable = plan.endTiles();
    // Manhattan ball of radius 2 at center has 1 + 4 + 8 = 13 tiles
    expect(reachable.length).toBe(13);
    expect(plan.canEndAt(3, 3)).toBe(true);  // origin
    expect(plan.canEndAt(5, 3)).toBe(true);  // edge of range
    expect(plan.canEndAt(6, 3)).toBe(false); // beyond
  });

  it('blocks tiles whose height differs from neighbor by more than jump', () => {
    const data = flatMap(5, 5, 1);
    data.heights[2][3] = 4; // wall at (3,2): h=4, neighbor h=1, diff=3 > jump=1
    const map = new BattleMap(data);
    const u = makeUnit('u', 2, 2, { move: 4, jump: 1 });
    const plan = new MovePlan(u, map, [u]);
    expect(plan.canEndAt(3, 2)).toBe(false); // can't climb the wall directly
    expect(plan.canEndAt(2, 3)).toBe(true);  // step south is fine
    expect(plan.canEndAt(4, 2)).toBe(true);  // routes around: (2,1)->(3,1)->(4,1)->(4,2), 4 steps
  });

  it('treats water as impassable', () => {
    const data = flatMap(5, 5, 1);
    data.heights[2][3] = 0; // water at (3,2)
    const map = new BattleMap(data);
    const u = makeUnit('u', 2, 2, { move: 3, jump: 5 });
    const plan = new MovePlan(u, map, [u]);
    expect(plan.canEndAt(3, 2)).toBe(false);
  });

  it('blocks tiles occupied by other units', () => {
    const map = new BattleMap(flatMap(5, 5));
    // move=4 lets the unit detour around the occupied (3,2) tile to reach (4,2)
    // in 4 steps: (2,2)->(2,1)->(3,1)->(4,1)->(4,2).
    const u = makeUnit('u', 2, 2, { move: 4 });
    const ally = makeUnit('a', 3, 2);
    const plan = new MovePlan(u, map, [u, ally]);
    expect(plan.canEndAt(3, 2)).toBe(false); // ally tile is blocked
    expect(plan.canEndAt(4, 2)).toBe(true);  // reachable via the 4-step detour
  });

  it('produces a valid step-by-step path', () => {
    const map = new BattleMap(flatMap(5, 5));
    const u = makeUnit('u', 0, 0, { move: 4 });
    const plan = new MovePlan(u, map, [u]);
    const path = plan.pathTo(2, 2);
    expect(path[0]).toEqual({ x: 0, z: 0 });
    expect(path[path.length - 1]).toEqual({ x: 2, z: 2 });
    // each step is a 4-neighbor move
    for (let i = 1; i < path.length; i++) {
      const dx = Math.abs(path[i].x - path[i - 1].x);
      const dz = Math.abs(path[i].z - path[i - 1].z);
      expect(dx + dz).toBe(1);
    }
  });
});
