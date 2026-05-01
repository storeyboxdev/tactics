/**
 * Status-effect definitions. Each STATUS_DEF describes how a status behaves
 * on a unit: how it expires, what it modifies (CT growth, per-tick HP), what
 * actions it blocks, and how it should display in the HUD.
 *
 * Mutually-exclusive groups: applying a status whose `group` matches an
 * existing status replaces it (Slow ⇄ Haste).
 *
 * MVP set (S1): Poison, Slow, Haste, Sleep, Stop.
 * Future: Regen, Don't Move, Don't Act, Charm, Berserk, Silence, Petrify.
 */

export type StatusId = 'poison' | 'slow' | 'haste' | 'sleep' | 'stop';

export type StatusExpiry =
  | { kind: 'duration'; ticks: number }   // expires after N ticks
  | { kind: 'permanent' }                  // until cured
  | { kind: 'until_damaged' };             // removed when target takes damage

export interface StatusDef {
  id: StatusId;
  name: string;
  /** 3-letter HUD badge (uppercase). */
  short: string;
  /** Hex color for the badge background. */
  color: number;
  expiry: StatusExpiry;
  /** CT growth multiplier per tick (1.0 = normal, 0 = frozen). Default 1. */
  ctMultiplier?: number;
  /** HP delta applied each tick (positive = damage, negative = heal). */
  hpPerTick?: number;
  /** True if the unit's turn is auto-skipped. */
  blocksTurn?: boolean;
  /** True if the unit cannot Move action. */
  blocksMove?: boolean;
  /** True if the unit cannot Attack/Skill/Item. */
  blocksAct?: boolean;
  /** Mutual-exclusion group key — applying a new status in the same group replaces the existing one. */
  group?: string;
}

export const STATUS_DEFS: Record<StatusId, StatusDef> = {
  poison: {
    id: 'poison', name: 'Poison', short: 'POI', color: 0x8a4fbf,
    expiry: { kind: 'permanent' },
    hpPerTick: 2,
  },
  slow: {
    id: 'slow', name: 'Slow', short: 'SLW', color: 0xb8860b,
    expiry: { kind: 'duration', ticks: 32 },
    ctMultiplier: 0.5,
    group: 'time',
  },
  haste: {
    id: 'haste', name: 'Haste', short: 'HST', color: 0x40c057,
    expiry: { kind: 'duration', ticks: 32 },
    ctMultiplier: 1.5,
    group: 'time',
  },
  sleep: {
    id: 'sleep', name: 'Sleep', short: 'SLP', color: 0x4f7bff,
    expiry: { kind: 'until_damaged' },
    blocksTurn: true,
  },
  stop: {
    id: 'stop', name: 'Stop', short: 'STP', color: 0xd05050,
    expiry: { kind: 'duration', ticks: 16 },
    ctMultiplier: 0,
    blocksTurn: true,
  },
};

/** Convenience to compute net CT multiplier from active statuses. */
export function ctMultiplierFromStatuses(active: readonly StatusId[]): number {
  let mul = 1;
  for (const id of active) {
    const def = STATUS_DEFS[id];
    if (def.ctMultiplier !== undefined) mul *= def.ctMultiplier;
  }
  return mul;
}
