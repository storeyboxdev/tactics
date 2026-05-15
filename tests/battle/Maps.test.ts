import { describe, it, expect } from 'vitest';
import { BattleMap, MapData } from '../../src/battle/Map';
import grasslandJson from '../../src/data/maps/grassland.json';
import stoneCorridorJson from '../../src/data/maps/stone_corridor.json';
import waterPondJson from '../../src/data/maps/water_pond.json';
import highGroundJson from '../../src/data/maps/high_ground.json';
import bridgeJson from '../../src/data/maps/bridge.json';
import dunesJson from '../../src/data/maps/dunes.json';

const ALL = [grasslandJson, stoneCorridorJson, waterPondJson, highGroundJson, bridgeJson, dunesJson];

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

describe('Bridge map', () => {
  const m = new BattleMap(bridgeJson as unknown as MapData);

  it('has a water chasm and a passable crossing through it', () => {
    let water = 0;
    let crossing = 0;
    for (let z = 0; z < m.depth; z++) {
      for (let x = 6; x <= 8; x++) {            // the chasm columns
        if (m.getTile(x, z).terrain === 'water') water++;
        else if (m.isPassable(x, z)) crossing++;
      }
    }
    expect(water, 'chasm has water tiles').toBeGreaterThan(0);
    expect(crossing, 'a dry crossing exists').toBeGreaterThan(0);
  });
});

describe('Dunes map', () => {
  const m = new BattleMap(dunesJson as unknown as MapData);

  it('is sand terrain throughout', () => {
    for (let z = 0; z < m.depth; z++) {
      for (let x = 0; x < m.width; x++) {
        expect(m.getTile(x, z).terrain, `(${x},${z})`).toBe('sand');
      }
    }
  });
});
