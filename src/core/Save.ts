/**
 * localStorage round-trip for the player roster.
 *
 * Schema is versioned (`version: 1`). On load, anything that fails parse or
 * fails the migrate step is dropped — caller falls back to `defaultRoster()`.
 * Enemies are never persisted (they roll fresh from `JobDef.baseStats` each
 * battle).
 */

import { Unit } from '../battle/Unit';
import { UnitProgression } from '../battle/Progression';
import { JOB_DEFS } from '../data/jobs';
import { WEAPONS, BONUS_WEAPON_IDS } from '../data/weapons';
import { ARMOR, BONUS_ARMOR_IDS } from '../data/armor';

const SAVE_KEY = 'tactics-save-v1';

/** Chance a won battle yields one loot-tier (stat-bonus) gear piece. */
const BONUS_DROP_CHANCE = 0.35;

/** Gil paid for a won battle: a flat base plus a per-defeated-enemy cut. */
const BASE_GIL = 60;
const GIL_PER_ENEMY = 25;

/** A deduped set-like pool of weapon/armor ids. */
export interface GearPool {
  weapons: string[];
  armors: string[];
}

export interface SaveFile {
  version: 1;
  roster: SavedUnit[];
  /**
   * Number of battles successfully completed (and saved). Drives the enemy
   * tier-pool. Optional on disk for backwards compatibility — old saves
   * load with `battleCount = 0`.
   */
  battleCount: number;
  /**
   * Gear scavenged from defeated enemies, accumulated across battles.
   * Widens every unit's equip options beyond their unlocked jobs. Old
   * saves load with empty pools.
   */
  foundGear: GearPool;
  /** Party-wide gil — earned from won battles, spent in the shop. Old
   *  saves load with `gil = 0`. */
  gil: number;
}

export interface SavedUnit {
  id: string;
  name: string;
  jobId: string;
  secondaryJobId: string | null;
  reaction: string | null;
  support: string | null;
  movement: string | null;
  /** Equipped gear — null tracks the job signature. */
  weaponId: string | null;
  armorId: string | null;
  progression: UnitProgression;
}

export function loadSave(): SaveFile | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch {
    return null;
  }
}

/**
 * The loot pool a won battle yields: the signature weapon/armor of every
 * defeated enemy, plus — with `BONUS_DROP_CHANCE` — one random loot-tier
 * (stat-bonus) piece. Deduped. Pass the result to `saveRoster`.
 */
export function lootFromBattle(units: readonly Unit[], rng: () => number = Math.random): GearPool {
  const weapons = new Set<string>();
  const armors = new Set<string>();
  for (const u of units) {
    if (u.team !== 'enemy' || u.isAlive) continue;
    const job = JOB_DEFS[u.jobId];
    if (!job) continue;
    if (job.weapon) weapons.add(job.weapon);
    if (job.armor) armors.add(job.armor);
  }
  // A bonus-gear drop on top of the scavenged signature gear.
  if (rng() < BONUS_DROP_CHANCE) {
    const pool = [...BONUS_WEAPON_IDS, ...BONUS_ARMOR_IDS];
    const pick = pool[Math.floor(rng() * pool.length)];
    if (pick) (BONUS_WEAPON_IDS.includes(pick) ? weapons : armors).add(pick);
  }
  return { weapons: [...weapons], armors: [...armors] };
}

/** Gil a won battle pays out — a flat base plus a cut per defeated enemy. */
export function gilFromBattle(units: readonly Unit[]): number {
  let defeated = 0;
  for (const u of units) {
    if (u.team === 'enemy' && !u.isAlive) defeated++;
  }
  return BASE_GIL + GIL_PER_ENEMY * defeated;
}

/** A SaveFile with no roster and no progress — the base before any battle. */
function freshSaveFile(): SaveFile {
  return { version: 1, roster: [], battleCount: 0, foundGear: { weapons: [], armors: [] }, gil: 0 };
}

/**
 * Commit a won battle's rewards — gil and looted gear — to the save right
 * away, so the roster screen and shop reflect them. Called once at the
 * moment of victory; `saveRoster` (at "Start Next Battle") then carries
 * the stash and balance forward without re-adding anything.
 */
export function recordBattleRewards(units: readonly Unit[], rng: () => number = Math.random): void {
  const base = loadSave() ?? freshSaveFile();
  const loot = lootFromBattle(units, rng);
  writeSave({
    ...base,
    gil: base.gil + gilFromBattle(units),
    foundGear: {
      weapons: [...new Set([...base.foundGear.weapons, ...loot.weapons])],
      armors:  [...new Set([...base.foundGear.armors,  ...loot.armors])],
    },
  });
}

export function saveRoster(units: Unit[]): void {
  const roster: SavedUnit[] = [];
  for (const u of units) {
    if (u.team !== 'player' || !u.progression) continue;
    roster.push({
      id: u.id,
      name: u.name,
      jobId: u.jobId,
      secondaryJobId: u.secondaryJobId,
      reaction: u.reaction,
      support: u.support,
      movement: u.movement,
      weaponId: u.weaponId,
      armorId: u.armorId,
      progression: u.progression,
    });
  }
  // Bump the battle counter — every saveRoster call follows a battle finish,
  // so this naturally tracks "how many battles has this party survived".
  // Gil and loot were already committed by recordBattleRewards at victory;
  // here they just carry forward untouched.
  const prev = loadSave();
  writeSave({
    version: 1,
    roster,
    battleCount: (prev?.battleCount ?? 0) + 1,
    foundGear: prev?.foundGear ?? { weapons: [], armors: [] },
    gil: prev?.gil ?? 0,
  });
}

/**
 * Persist a SaveFile verbatim. The shop uses this to commit a `buyGear`
 * result without saveRoster's battle-finish semantics (battleCount bump,
 * roster rebuild). A failed write is dropped silently — the in-memory
 * game is unaffected.
 */
export function writeSave(file: SaveFile): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(file));
  } catch {
    // QuotaExceededError or similar — drop silently.
  }
}

export function wipeSave(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

/**
 * Buy a piece of loot-tier gear: a pure transaction. Returns an updated
 * SaveFile, or `null` when the purchase can't go through — the id is
 * unknown or unpriced (signature gear isn't sold), the party can't
 * afford it, or it's already in `foundGear`.
 */
export function buyGear(save: SaveFile, gearId: string): SaveFile | null {
  const weapon = WEAPONS[gearId];
  const armor = ARMOR[gearId];
  const price = weapon?.price ?? armor?.price;
  if (price === undefined) return null;
  if (save.gil < price) return null;
  const isWeapon = !!weapon;
  const owned = isWeapon ? save.foundGear.weapons : save.foundGear.armors;
  if (owned.includes(gearId)) return null;
  return {
    ...save,
    gil: save.gil - price,
    foundGear: {
      weapons: isWeapon ? [...save.foundGear.weapons, gearId] : save.foundGear.weapons,
      armors:  isWeapon ? save.foundGear.armors : [...save.foundGear.armors, gearId],
    },
  };
}

/**
 * Translates a previous-version save into the current shape. Returns null if
 * unrecognised or corrupt. Today there is only `version: 1`.
 */
function migrate(raw: unknown): SaveFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as {
    version?: unknown; roster?: unknown; battleCount?: unknown;
    foundGear?: unknown; gil?: unknown;
  };
  if (obj.version !== 1) return null;
  if (!Array.isArray(obj.roster)) return null;
  const roster: SavedUnit[] = [];
  for (const entry of obj.roster) {
    const su = validateSavedUnit(entry);
    if (su) roster.push(su);
  }
  const battleCount = typeof obj.battleCount === 'number' ? obj.battleCount : 0;
  const gil = typeof obj.gil === 'number' ? obj.gil : 0;
  return { version: 1, roster, battleCount, foundGear: parseGearPool(obj.foundGear), gil };
}

/** Parse a persisted GearPool, tolerating absent/corrupt data → empty pools. */
function parseGearPool(raw: unknown): GearPool {
  if (!raw || typeof raw !== 'object') return { weapons: [], armors: [] };
  const r = raw as { weapons?: unknown; armors?: unknown };
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return { weapons: strings(r.weapons), armors: strings(r.armors) };
}

function validateSavedUnit(raw: unknown): SavedUnit | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const p = r.progression as Record<string, unknown> | undefined;
  if (!p || typeof p !== 'object') return null;
  if (!p.jobs || typeof p.jobs !== 'object') return null;
  if (typeof r.id !== 'string' || typeof r.name !== 'string' || typeof r.jobId !== 'string') return null;
  return {
    id: r.id,
    name: r.name,
    jobId: r.jobId,
    secondaryJobId: typeof r.secondaryJobId === 'string' ? r.secondaryJobId : null,
    reaction:  typeof r.reaction  === 'string' ? r.reaction  : null,
    support:   typeof r.support   === 'string' ? r.support   : null,
    movement:  typeof r.movement  === 'string' ? r.movement  : null,
    weaponId:  typeof r.weaponId  === 'string' ? r.weaponId  : null,
    armorId:   typeof r.armorId   === 'string' ? r.armorId   : null,
    progression: p as unknown as UnitProgression,
  };
}
