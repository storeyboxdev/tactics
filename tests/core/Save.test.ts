import { describe, it, expect, beforeEach } from 'vitest';
import { Unit, UnitDef, UnitStats } from '../../src/battle/Unit';
import { JOB_DEFS } from '../../src/data/jobs';
import {
  loadSave, saveRoster, wipeSave, lootFromBattle, gilFromBattle, buyGear,
  SavedUnit, SaveFile,
} from '../../src/core/Save';
import { bootstrapUnit } from '../../src/core/Bootstrap';
import { WEAPONS, BONUS_WEAPON_IDS } from '../../src/data/weapons';
import { ARMOR, BONUS_ARMOR_IDS } from '../../src/data/armor';

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

function enemyUnit(id: string, jobId: string): Unit {
  const job = JOB_DEFS[jobId];
  const def: UnitDef = {
    id, name: id, team: 'enemy', jobId, level: 1,
    stats: { ...job.baseStats } as UnitStats,
  };
  return new Unit(def, 0, 0, 1);
}

describe('lootFromBattle', () => {
  it('collects the signature gear of defeated enemies only', () => {
    const deadKnight = enemyUnit('e1', 'knight'); deadKnight.applyDamage(9999);
    const deadGoblin = enemyUnit('e2', 'goblin'); deadGoblin.applyDamage(9999);
    const liveArcher = enemyUnit('e3', 'archer'); // still standing — not looted
    const player = unitFromSaved(bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'squire' }));
    const loot = lootFromBattle([deadKnight, deadGoblin, liveArcher, player], () => 0.99);
    expect([...loot.weapons].sort()).toEqual(['claw', 'sword']);
    expect([...loot.armors].sort()).toEqual(['heavy_armor', 'light_armor']);
    expect(loot.weapons).not.toContain('bow'); // the surviving archer's bow
  });

  it('dedupes gear from multiple enemies of the same job', () => {
    const k1 = enemyUnit('e1', 'knight'); k1.applyDamage(9999);
    const k2 = enemyUnit('e2', 'knight'); k2.applyDamage(9999);
    // A no-drop rng keeps the assertion to the signature gear.
    expect(lootFromBattle([k1, k2], () => 0.99).weapons).toEqual(['sword']);
  });

  it('a won battle can drop one bonus-gear piece', () => {
    const dead = enemyUnit('e1', 'knight'); dead.applyDamage(9999);
    const loot = lootFromBattle([dead], () => 0); // forced drop
    const bonus = [...BONUS_WEAPON_IDS, ...BONUS_ARMOR_IDS];
    const dropped = [...loot.weapons, ...loot.armors].filter(id => bonus.includes(id));
    expect(dropped).toHaveLength(1);
  });

  it('no bonus piece drops when the roll misses — signature loot stands', () => {
    const dead = enemyUnit('e1', 'knight'); dead.applyDamage(9999);
    const loot = lootFromBattle([dead], () => 0.99); // no drop
    const bonus = [...BONUS_WEAPON_IDS, ...BONUS_ARMOR_IDS];
    expect([...loot.weapons, ...loot.armors].some(id => bonus.includes(id))).toBe(false);
    expect(loot.weapons).toContain('sword');
  });
});

function freshSave(gil: number): SaveFile {
  return { version: 1, roster: [], battleCount: 0, foundGear: { weapons: [], armors: [] }, gil };
}

describe('buyGear', () => {
  it('debits gil and adds a bought weapon to foundGear', () => {
    const after = buyGear(freshSave(1000), 'flame_rod'); // price 480
    expect(after).not.toBeNull();
    expect(after!.gil).toBe(520);
    expect(after!.foundGear.weapons).toContain('flame_rod');
  });

  it('a bought armor lands in the armor pool', () => {
    const after = buyGear(freshSave(1000), 'chain_mail');
    expect(after!.foundGear.armors).toContain('chain_mail');
  });

  it('fails when the party cannot afford it', () => {
    expect(buyGear(freshSave(100), 'mythril_sword')).toBeNull();
  });

  it('fails on gear already owned', () => {
    const save = { ...freshSave(1000), foundGear: { weapons: ['flame_rod'], armors: [] } };
    expect(buyGear(save, 'flame_rod')).toBeNull();
  });

  it('fails on signature (unpriced) or unknown gear', () => {
    expect(buyGear(freshSave(9999), 'sword')).toBeNull();
    expect(buyGear(freshSave(9999), 'no_such_gear')).toBeNull();
  });

  it('the loot-tier pieces are priced; signature gear is not', () => {
    expect(WEAPONS.flame_rod.price).toBeGreaterThan(0);
    expect(WEAPONS.sword.price).toBeUndefined();
    expect(ARMOR.chain_mail.price).toBeGreaterThan(0);
    expect(ARMOR.heavy_armor.price).toBeUndefined();
  });
});

describe('gilFromBattle', () => {
  it('pays a base plus a cut per defeated enemy', () => {
    const e1 = enemyUnit('e1', 'knight'); e1.applyDamage(9999);
    const e2 = enemyUnit('e2', 'goblin'); e2.applyDamage(9999);
    const alive = enemyUnit('e3', 'archer'); // survivor — no payout
    const player = unitFromSaved(bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'squire' }));
    // base 60 + 25 per defeated enemy, 2 defeated → 110
    expect(gilFromBattle([e1, e2, alive, player])).toBe(110);
  });

  it('pays the base alone when nothing was defeated', () => {
    expect(gilFromBattle([enemyUnit('e1', 'knight')])).toBe(60);
  });
});

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
    // Knight bootstraps with its full active list pre-learned.
    expect(r.progression.jobs.knight.learnedAbilities).toEqual(['power_break', 'speed_break', 'magic_break', 'stasis_sword', 'lightning_stab']);
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

  it('round-trips equipped weapon and armor', () => {
    const seed = bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'knight' });
    const u = unitFromSaved(seed);
    u.weaponId = 'katana';
    u.armorId = 'robe';
    saveRoster([u]);
    const r = loadSave()!.roster[0];
    expect(r.weaponId).toBe('katana');
    expect(r.armorId).toBe('robe');
  });

  it('migrates a save written before weaponId/armorId to null', () => {
    saveRoster([unitFromSaved(bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'squire' }))]);
    const raw = JSON.parse(localStorage.getItem('tactics-save-v1')!);
    delete raw.roster[0].weaponId;
    delete raw.roster[0].armorId;
    localStorage.setItem('tactics-save-v1', JSON.stringify(raw));
    const r = loadSave()!.roster[0];
    expect(r.weaponId).toBeNull();
    expect(r.armorId).toBeNull();
  });

  it('round-trips foundGear', () => {
    const u = unitFromSaved(bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'squire' }));
    saveRoster([u], { weapons: ['katana'], armors: ['robe'] });
    const f = loadSave()!.foundGear;
    expect(f.weapons).toEqual(['katana']);
    expect(f.armors).toEqual(['robe']);
  });

  it('migrates a save written before foundGear to empty pools', () => {
    localStorage.setItem('tactics-save-v1', JSON.stringify({ version: 1, roster: [] }));
    expect(loadSave()!.foundGear).toEqual({ weapons: [], armors: [] });
  });

  it('foundGear accumulates across battles, deduped', () => {
    const u = unitFromSaved(bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'squire' }));
    saveRoster([u], { weapons: ['sword'], armors: ['heavy_armor'] });
    saveRoster([u], { weapons: ['sword', 'spear'], armors: ['robe'] });
    const f = loadSave()!.foundGear;
    expect([...f.weapons].sort()).toEqual(['spear', 'sword']);
    expect([...f.armors].sort()).toEqual(['heavy_armor', 'robe']);
  });

  it('round-trips and accumulates gil', () => {
    const u = unitFromSaved(bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'squire' }));
    saveRoster([u], undefined, 100);
    expect(loadSave()!.gil).toBe(100);
    saveRoster([u], undefined, 50);
    expect(loadSave()!.gil).toBe(150);
  });

  it('migrates a save written before gil to 0', () => {
    localStorage.setItem('tactics-save-v1', JSON.stringify({ version: 1, roster: [] }));
    expect(loadSave()!.gil).toBe(0);
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
