import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateMapData, loadCustomMaps, saveCustomMap, deleteCustomMap,
  selectMapForBattle, resolveBattleMap,
} from '../../src/core/CustomMaps';
import { MapData } from '../../src/battle/Map';

// Vitest's node environment has no Web Storage — install in-memory shims.
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string): string | null { return this.data.get(k) ?? null; }
  setItem(k: string, v: string): void { this.data.set(k, v); }
  removeItem(k: string): void { this.data.delete(k); }
  clear(): void { this.data.clear(); }
}
(globalThis as any).localStorage = new MemoryStorage();
(globalThis as any).sessionStorage = new MemoryStorage();

function sampleMap(name = 'Test Map'): MapData {
  return {
    name, width: 3, height: 2,
    heights: [[1, 1, 1], [1, 2, 0]],
    spawns: { player: [[0, 0]], enemy: [[2, 1]] },
  };
}

describe('validateMapData', () => {
  it('accepts a well-formed map', () => {
    expect(validateMapData(sampleMap())).not.toBeNull();
  });

  it('rejects a heights grid that does not match width/height', () => {
    const m = sampleMap();
    m.heights = [[1, 1, 1]]; // 1 row, but height is 2
    expect(validateMapData(m)).toBeNull();
  });

  it('rejects a spawn out of bounds', () => {
    const m = sampleMap();
    m.spawns.enemy = [[9, 9]];
    expect(validateMapData(m)).toBeNull();
  });

  it('rejects a missing name', () => {
    expect(validateMapData(sampleMap(''))).toBeNull();
  });
});

describe('custom map store', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a saved map', () => {
    saveCustomMap(sampleMap('Alpha'));
    const loaded = loadCustomMaps();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Alpha');
  });

  it('upserts by name — saving the same name replaces, not duplicates', () => {
    saveCustomMap(sampleMap('Alpha'));
    const edited = sampleMap('Alpha');
    edited.heights[0][0] = 3;
    saveCustomMap(edited);
    const loaded = loadCustomMaps();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].heights[0][0]).toBe(3);
  });

  it('deletes by name', () => {
    saveCustomMap(sampleMap('Alpha'));
    saveCustomMap(sampleMap('Beta'));
    deleteCustomMap('Alpha');
    expect(loadCustomMaps().map(m => m.name)).toEqual(['Beta']);
  });
});

describe('resolveBattleMap', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it('returns a one-shot editor selection, then consumes it', () => {
    selectMapForBattle(sampleMap('Selected'));
    expect(resolveBattleMap([sampleMap('BuiltIn')]).name).toBe('Selected');
    // consumed — the next call falls back to the pool
    expect(resolveBattleMap([sampleMap('BuiltIn')]).name).toBe('BuiltIn');
  });

  it('picks from the built-in maps plus the custom store', () => {
    saveCustomMap(sampleMap('Custom'));
    const names = new Set<string>();
    for (let i = 0; i < 40; i++) names.add(resolveBattleMap([sampleMap('BuiltIn')]).name);
    expect([...names].sort()).toEqual(['BuiltIn', 'Custom']);
  });
});
