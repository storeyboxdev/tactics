import { describe, it, expect, beforeEach } from 'vitest';
import { Unit, UnitDef, UnitStats } from '../../src/battle/Unit';
import { JOB_DEFS } from '../../src/data/jobs';
import { loadSave, saveRoster, wipeSave, SavedUnit } from '../../src/core/Save';
import { bootstrapUnit } from '../../src/core/Bootstrap';

// Vitest's `node` environment doesn't supply localStorage. Install a tiny
// in-memory shim before any test runs.
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string): string | null { return this.data.get(k) ?? null; }
  setItem(k: string, v: string): void { this.data.set(k, v); }
  removeItem(k: string): void { this.data.delete(k); }
  clear(): void { this.data.clear(); }
}
(globalThis as any).localStorage = new MemoryStorage();

function unitFromSaved(saved: SavedUnit): Unit {
  const job = JOB_DEFS[saved.jobId];
  const def: UnitDef = {
    id: saved.id, name: saved.name, team: 'player',
    jobId: saved.jobId, level: saved.progression.totalLevel,
    stats: { ...job.baseStats } as UnitStats,
    reaction: saved.reaction, support: saved.support, movement: saved.movement,
    progression: saved.progression,
    secondaryJobId: saved.secondaryJobId,
  };
  return new Unit(def, 0, 0, 1);
}

describe('Save round-trip', () => {
  beforeEach(() => wipeSave());

  it('returns null when no save exists', () => {
    expect(loadSave()).toBeNull();
  });

  it('persists and restores a player roster', () => {
    const seed = bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'knight' });
    seed.reaction = 'counter';
    const u = unitFromSaved(seed);
    saveRoster([u]);
    const loaded = loadSave();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(1);
    expect(loaded!.roster).toHaveLength(1);
    const r = loaded!.roster[0];
    expect(r.id).toBe('p1');
    expect(r.jobId).toBe('knight');
    expect(r.reaction).toBe('counter');
    // Knight bootstraps with all three Breaks pre-learned.
    expect(r.progression.jobs.knight.learnedAbilities).toEqual(['power_break', 'speed_break', 'magic_break']);
  });

  it('learnedAbilities round-trips as a string array', () => {
    const seed = bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'black_mage' });
    seed.progression.jobs.black_mage.learnedAbilities = ['fire', 'ice'];
    saveRoster([unitFromSaved(seed)]);
    const loaded = loadSave()!;
    const learned = loaded.roster[0].progression.jobs.black_mage.learnedAbilities;
    expect(Array.isArray(learned)).toBe(true);
    expect(learned).toEqual(['fire', 'ice']);
  });

  it('saveRoster filters out enemy units', () => {
    const playerSeed = bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'knight' });
    const player = unitFromSaved(playerSeed);
    const enemyDef: UnitDef = {
      id: 'e1', name: 'E1', team: 'enemy',
      jobId: 'knight', level: 1,
      stats: { ...JOB_DEFS.knight.baseStats } as UnitStats,
    };
    const enemy = new Unit(enemyDef, 5, 5, 1);
    saveRoster([player, enemy]);
    const loaded = loadSave()!;
    expect(loaded.roster).toHaveLength(1);
    expect(loaded.roster[0].id).toBe('p1');
  });

  it('battleCount increments on each saveRoster call', () => {
    const seed = bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'squire' });
    const u = unitFromSaved(seed);
    saveRoster([u]);
    expect(loadSave()?.battleCount).toBe(1);
    saveRoster([u]);
    expect(loadSave()?.battleCount).toBe(2);
    saveRoster([u]);
    expect(loadSave()?.battleCount).toBe(3);
  });

  it('migrate fills battleCount to 0 for a save written before the field existed', () => {
    localStorage.setItem('tactics-save-v1', JSON.stringify({
      version: 1,
      roster: [],
    }));
    expect(loadSave()?.battleCount).toBe(0);
  });

  it('wipeSave clears the persisted roster', () => {
    saveRoster([unitFromSaved(bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'squire' }))]);
    expect(loadSave()).not.toBeNull();
    wipeSave();
    expect(loadSave()).toBeNull();
  });

  it('rejects malformed saves rather than throwing', () => {
    localStorage.setItem('tactics-save-v1', 'not-json{');
    expect(loadSave()).toBeNull();
    localStorage.setItem('tactics-save-v1', JSON.stringify({ version: 99, roster: [] }));
    expect(loadSave()).toBeNull();
    localStorage.setItem('tactics-save-v1', JSON.stringify({ version: 1, roster: 'oops' }));
    expect(loadSave()).toBeNull();
    localStorage.setItem('tactics-save-v1', JSON.stringify({
      version: 1, roster: [{ id: 'p1', name: 'P1' /* missing fields */ }],
    }));
    const loaded = loadSave();
    expect(loaded).not.toBeNull();
    expect(loaded!.roster).toEqual([]); // bad entries dropped, valid ones kept
  });
});
