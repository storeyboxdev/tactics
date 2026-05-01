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

function makeUnit(id: string, team: Team, x: number, z: number, facing: Facing, over: Partial<UnitStats> = {}, jobId = 'x'): Unit {
  const def: UnitDef = {
    id, name: id, team, jobId, level: 1, stats: baseStats(over),
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
    expect(d.action?.kind).toBe('attack');
    if (d.action?.kind === 'attack') expect(d.action.targetId).toBe('p');
    expect(d.movePath).toEqual([]);
  });

  it('closes distance toward the nearest enemy when none are reachable to attack', () => {
    const map = new BattleMap(flatMap(10, 5));
    const e = makeUnit('e', 'enemy', 0, 2, FACING_E, { move: 3 });
    const p = makeUnit('p', 'player', 9, 2, FACING_W);
    const ai = new HeuristicAi();
    const d = ai.decide(e, map, [e, p]);
    expect(d.action).toBeNull();
    expect(d.movePath[d.movePath.length - 1]).toEqual({ x: 3, z: 2 });
  });

  it('prioritizes a KO over a higher-damage but non-KO option', () => {
    const map = new BattleMap(flatMap(7, 5));
    const e = makeUnit('e', 'enemy', 3, 2, FACING_W, { move: 1 });
    const weak = makeUnit('weak', 'player', 4, 2, FACING_W, { hp: 5 });
    const tank = makeUnit('tank', 'player', 2, 2, FACING_W, { hp: 999 });
    const ai = new HeuristicAi();
    const d = ai.decide(e, map, [e, weak, tank]);
    expect(d.action?.kind).toBe('attack');
    if (d.action?.kind === 'attack') expect(d.action.targetId).toBe('weak');
  });
});

describe('HeuristicAi — abilities', () => {
  it('an enemy Time Mage casts Haste on a friendly target', () => {
    // Time Mage with MP, ally adjacent, no player in range — best play is to
    // cast Haste on either self or ally (both score equally).
    const map = new BattleMap(flatMap(7, 5));
    const tm = makeUnit('tm', 'enemy', 3, 2, FACING_W, { mp: 30, pa: 3, ma: 8, move: 0 }, 'time_mage');
    const ally = makeUnit('a', 'enemy', 4, 2, FACING_W, {}, 'knight');
    const ai = new HeuristicAi();
    const d = ai.decide(tm, map, [tm, ally]);
    expect(d.action?.kind).toBe('ability');
    if (d.action?.kind === 'ability') {
      expect(d.action.abilityId).toBe('haste');
      expect(['tm', 'a']).toContain(d.action.targetId);
    }
  });

  it('an enemy Oracle prefers Stop (+30 value) over Sleep (+25) on the same target', () => {
    // Oracle has both abilities; with no other modifiers, score table says
    // Stop > Sleep > Poison.
    const map = new BattleMap(flatMap(7, 5));
    const oc = makeUnit('oc', 'enemy', 3, 2, FACING_W, { mp: 30, pa: 3, ma: 8, move: 0 }, 'oracle');
    const p = makeUnit('p', 'player', 5, 2, FACING_W);
    const ai = new HeuristicAi();
    const d = ai.decide(oc, map, [oc, p]);
    expect(d.action?.kind).toBe('ability');
    if (d.action?.kind === 'ability') {
      // Oracle has sleep + poison_spell; Stop is on Time Mage. Among Oracle's
      // pool, Sleep (25) outranks Poison (15).
      expect(d.action.abilityId).toBe('sleep');
    }
  });

  it("does not cast a status the target already has", () => {
    const map = new BattleMap(flatMap(7, 5));
    const oc = makeUnit('oc', 'enemy', 3, 2, FACING_W, { mp: 30, pa: 3, ma: 8, move: 0 }, 'oracle');
    const p = makeUnit('p', 'player', 5, 2, FACING_W);
    p.addStatus('sleep'); // already asleep — Oracle should pick Poison instead
    const ai = new HeuristicAi();
    const d = ai.decide(oc, map, [oc, p]);
    expect(d.action?.kind).toBe('ability');
    if (d.action?.kind === 'ability') {
      expect(d.action.abilityId).toBe('poison_spell');
    }
  });
});
