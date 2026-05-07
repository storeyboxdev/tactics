import { describe, it, expect } from 'vitest';
import { BattleMap, MapData } from '../../src/battle/Map';
import grasslandJson from '../../src/data/maps/grassland.json';
import stoneCorridorJson from '../../src/data/maps/stone_corridor.json';
import waterPondJson from '../../src/data/maps/water_pond.json';
import highGroundJson from '../../src/data/maps/high_ground.json';

const ALL = [grasslandJson, stoneCorridorJson, waterPondJson, highGroundJson];

describe('All map JSONs', () => {
  it('every map parses into a BattleMap without errors', () => {
    for (const j of ALL) {
      expect(() => new BattleMap(j as unknown as MapData)).not.toThrow();
    }
  });

  it('every map declares 5 player spawns and 5 enemy spawns on passable tiles', () => {
    for (const j of ALL) {
      const m = new BattleMap(j as unknown as MapData);
      expect(m.spawns.player.length, `${m.name}: player spawn count`).toBe(5);
      expect(m.spawns.enemy.length, `${m.name}: enemy spawn count`).toBe(5);
      for (const [x, z] of m.spawns.player) {
        expect(m.isPassable(x, z), `${m.name}: player spawn (${x},${z}) passable`).toBe(true);
      }
      for (const [x, z] of m.spawns.enemy) {
        expect(m.isPassable(x, z), `${m.name}: enemy spawn (${x},${z}) passable`).toBe(true);
      }
    }
  });

  it('every map\'s heights array shape matches the declared dimensions', () => {
    for (const j of ALL) {
      const data = j as unknown as MapData;
      expect(data.heights.length).toBe(data.height);
      for (const row of data.heights) {
        expect(row.length).toBe(data.width);
      }
    }
  });
});
