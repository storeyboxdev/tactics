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
import { BONUS_WEAPON_IDS } from '../data/weapons';
import { BONUS_ARMOR_IDS } from '../data/armor';

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

const EMPTY_POOL: GearPool = { weapons: [], armors: [] };

export function saveRoster(units: Unit[], newFound: GearPool = EMPTY_POOL, gilEarned = 0): void {
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
  const prev = loadSave();
  const battleCount = (prev?.battleCount ?? 0) + 1;
  // Loot accumulates — carry the prior stash forward, union in the new find.
  const foundGear: GearPool = {
    weapons: [...new Set([...(prev?.foundGear.weapons ?? []), ...newFound.weapons])],
    armors:  [...new Set([...(prev?.foundGear.armors  ?? []), ...newFound.armors])],
  };
  // Gil accumulates — carry the prior balance forward, add the new reward.
  const gil = (prev?.gil ?? 0) + gilEarned;
  const file: SaveFile = { version: 1, roster, battleCount, foundGear, gil };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(file));
  } catch {
    // QuotaExceededError or similar — drop silently; the roster will be lost
    // on reload but the in-memory game is unaffected.
  }
}

export function wipeSave(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
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
