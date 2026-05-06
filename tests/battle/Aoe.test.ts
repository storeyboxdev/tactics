import { describe, it, expect } from 'vitest';
import { BattleMap, MapData } from '../../src/battle/Map';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import { aoeTiles, affectedUnits } from '../../src/battle/Targeting';
import { ABILITIES } from '../../src/data/abilities';

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

describe('aoeTiles', () => {
  it('radius 0 returns just the center tile', () => {
    const map = new BattleMap(flatMap(7, 7));
    const tiles = aoeTiles(3, 3, 0, map);
    expect(tiles).toEqual([{ x: 3, z: 3 }]);
  });

  it('radius 1 returns the 5-tile cross around center', () => {
    const map = new BattleMap(flatMap(7, 7));
    const tiles = aoeTiles(3, 3, 1, map);
    const keys = tiles.map(t => `${t.x},${t.z}`).sort();
    expect(keys).toEqual(['2,3', '3,2', '3,3', '3,4', '4,3'].sort());
  });

  it('radius 2 returns 13 tiles (Manhattan diamond)', () => {
    const map = new BattleMap(flatMap(9, 9));
    const tiles = aoeTiles(4, 4, 2, map);
    expect(tiles).toHaveLength(13);
  });

  it('clamps tiles outside the map bounds', () => {
    const map = new BattleMap(flatMap(3, 3));
    // Center at corner 0,0 → only the 3 tiles inside the 3×3 grid that are
    // within Manhattan 1: (0,0), (1,0), (0,1).
    const tiles = aoeTiles(0, 0, 1, map);
    expect(tiles).toHaveLength(3);
  });
});

describe('affectedUnits', () => {
  it('Pebble Blast catches every enemy in the radius-1 cross, ignores allies', () => {
    const map = new BattleMap(flatMap(7, 7));
    const caster = makeUnit('c', 'player', 0, 0, FACING_E);
    const ally   = makeUnit('al', 'player', 4, 3, FACING_E); // adjacent to center
    const eA    = makeUnit('e1', 'enemy', 3, 3, FACING_W);  // center
    const eB    = makeUnit('e2', 'enemy', 3, 4, FACING_W);  // south of center
    const eC    = makeUnit('e3', 'enemy', 2, 3, FACING_W);  // west of center
    const eFar  = makeUnit('e4', 'enemy', 5, 5, FACING_W);  // outside radius
    const all = [caster, ally, eA, eB, eC, eFar];

    const hit = affectedUnits(caster, ABILITIES.pebble_blast, 3, 3, map, all);
    const ids = hit.map(u => u.id).sort();
    expect(ids).toEqual(['e1', 'e2', 'e3']);   // ally and eFar excluded
  });

  it('AoE heal (radius 1) catches caster + adjacent allies, never enemies', () => {
    const map = new BattleMap(flatMap(7, 7));
    const wm = makeUnit('wm', 'player', 3, 3, FACING_E);
    const ally = makeUnit('al', 'player', 4, 3, FACING_W);
    const enemy = makeUnit('en', 'enemy',  3, 4, FACING_W);
    const all = [wm, ally, enemy];

    const fakeAoEHeal = { ...ABILITIES.cure, area: { radius: 1 } };
    const hit = affectedUnits(wm, fakeAoEHeal, 3, 3, map, all);
    const ids = hit.map(u => u.id).sort();
    expect(ids).toEqual(['al', 'wm']); // enemy filtered out by team rules
  });

  it('non-AoE ability collapses to at most one unit (the center tile)', () => {
    const map = new BattleMap(flatMap(7, 7));
    const caster = makeUnit('c', 'player', 0, 0, FACING_E);
    const eA = makeUnit('e1', 'enemy', 3, 3, FACING_W);
    const eB = makeUnit('e2', 'enemy', 3, 4, FACING_W);
    const hit = affectedUnits(caster, ABILITIES.fire, 3, 3, map, [caster, eA, eB]);
    expect(hit.map(u => u.id)).toEqual(['e1']);
  });
});
