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

const SAVE_KEY = 'tactics-save-v1';

export interface SaveFile {
  version: 1;
  roster: SavedUnit[];
  /**
   * Number of battles successfully completed (and saved). Drives the enemy
   * tier-pool. Optional on disk for backwards compatibility — old saves
   * load with `battleCount = 0`.
   */
  battleCount: number;
}

export interface SavedUnit {
  id: string;
  name: string;
  jobId: string;
  secondaryJobId: string | null;
  reaction: string | null;
  support: string | null;
  movement: string | null;
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
      progression: u.progression,
    });
  }
  // Bump the battle counter — every saveRoster call follows a battle finish,
  // so this naturally tracks "how many battles has this party survived".
  const prev = loadSave();
  const battleCount = (prev?.battleCount ?? 0) + 1;
  const file: SaveFile = { version: 1, roster, battleCount };
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
  const obj = raw as { version?: unknown; roster?: unknown; battleCount?: unknown };
  if (obj.version !== 1) return null;
  if (!Array.isArray(obj.roster)) return null;
  const roster: SavedUnit[] = [];
  for (const entry of obj.roster) {
    const su = validateSavedUnit(entry);
    if (su) roster.push(su);
  }
  const battleCount = typeof obj.battleCount === 'number' ? obj.battleCount : 0;
  return { version: 1, roster, battleCount };
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
    progression: p as unknown as UnitProgression,
  };
}
