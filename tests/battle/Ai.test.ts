import { describe, it, expect } from 'vitest';
import { BattleMap, MapData } from '../../src/battle/Map';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import { HeuristicAi } from '../../src/battle/Ai';

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
  return { name: 'flat', width, height: depth, heights, spawns: { player: [], enemy: [] } };
}

describe('HeuristicAi', () => {
  it('attacks an adjacent enemy without moving when already in the optimal facing', () => {
    // 2-wide map: AI at (0,2) is on the player's back side already (player
    // faces E, AI is to the W). Moving anywhere else either gives only
    // side/front facing or is unreachable. Best play is stay and back-attack.
    const map = new BattleMap(flatMap(2, 5));
    const e = makeUnit('e', 'enemy', 0, 2, FACING_E, { move: 4 });
    const p = makeUnit('p', 'player', 1, 2, FACING_E);
    const ai = new HeuristicAi();
    const d = ai.decide(e, map, [e, p]);
    expect(d.attack?.targetId).toBe('p');
    expect(d.movePath).toEqual([]);
  });

  it('closes distance toward the nearest enemy when none are reachable to attack', () => {
    const map = new BattleMap(flatMap(10, 5));
    const e = makeUnit('e', 'enemy', 0, 2, FACING_E, { move: 3 });
    const p = makeUnit('p', 'player', 9, 2, FACING_W);
    const ai = new HeuristicAi();
    const d = ai.decide(e, map, [e, p]);
    expect(d.attack).toBeNull();
    // Best tile for closing distance is (3,2): manhattan 6 to player (lowest possible with move=3)
    expect(d.movePath[d.movePath.length - 1]).toEqual({ x: 3, z: 2 });
  });

  it('prioritizes a KO over a higher-damage but non-KO option', () => {
    // Two adjacent enemies after moving: one nearly dead (KO bonus 100 wins),
    // one full HP (raw damage only).
    const map = new BattleMap(flatMap(7, 5));
    const e = makeUnit('e', 'enemy', 3, 2, FACING_W, { move: 1 });
    const weak = makeUnit('weak', 'player', 4, 2, FACING_W, { hp: 5 });
    const tank = makeUnit('tank', 'player', 2, 2, FACING_W, { hp: 999 });
    const ai = new HeuristicAi();
    const d = ai.decide(e, map, [e, weak, tank]);
    // From (3,2) the AI is adjacent to both. The weak target's KO bonus (+100)
    // dominates any threat penalty difference, so it should be picked.
    expect(d.attack?.targetId).toBe('weak');
  });
});
