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

export type StatusId =
  | 'poison' | 'slow' | 'haste' | 'sleep' | 'stop'
  | 'regen' | 'silence' | 'dont_move' | 'dont_act'
  | 'reraise' | 'death_sentence'
  | 'berserk' | 'confuse' | 'charm' | 'frog'
  | 'petrify' | 'undead';

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
  /** True if the unit cannot cast magical-type abilities (Silence). */
  blocksMagic?: boolean;
  /** True if the unit cannot use abilities/items but CAN still basic-attack
   *  and move (Frog). Distinct from blocksAct, which kills Attack too. */
  blocksAbilities?: boolean;
  /** When the status's duration counter hits 0, KO the unit by routing lethal
   *  damage through applyDamage (so Reraise and on-damage reactions trigger). */
  koOnExpire?: boolean;
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
  regen: {
    id: 'regen', name: 'Regen', short: 'REG', color: 0x66c2a5,
    expiry: { kind: 'duration', ticks: 32 },
    hpPerTick: -4,
  },
  silence: {
    id: 'silence', name: 'Silence', short: 'SIL', color: 0x9aa0a6,
    expiry: { kind: 'duration', ticks: 32 },
    blocksMagic: true,
  },
  dont_move: {
    id: 'dont_move', name: "Don't Move", short: 'DMV', color: 0xc4763e,
    expiry: { kind: 'duration', ticks: 24 },
    blocksMove: true,
    group: 'restraint',
  },
  dont_act: {
    id: 'dont_act', name: "Don't Act", short: 'DAC', color: 0xa83a3a,
    expiry: { kind: 'duration', ticks: 24 },
    blocksAct: true,
    group: 'restraint',
  },
  reraise: {
    // One-shot phoenix: when damage would KO the bearer, restore HP to
    // ceil(hpMax × 10%) and consume the status. Permanent until triggered
    // or dispelled. Buffs aren't on the cure-status target list, so Esuna
    // won't strip it.
    id: 'reraise', name: 'Reraise', short: 'RRZ', color: 0xf5c95a,
    expiry: { kind: 'permanent' },
  },
  death_sentence: {
    // 24-tick countdown to a guaranteed KO. The lethal damage routes through
    // applyDamage on expiry, so a target with Reraise gets one last chance.
    // Esuna / Remedy cure this — it's a debuff, not a buff.
    id: 'death_sentence', name: 'Death Sentence', short: 'DST', color: 0x8a0000,
    expiry: { kind: 'duration', ticks: 24 },
    koOnExpire: true,
  },
  berserk: {
    // The unit's turn is forced into a basic-attack on the nearest opposing-
    // team unit. +50% PA on the attack (applied via effectivePa). No menu,
    // no abilities — pure swing. Affects both teams equally; a berserked
    // player Squire is a problem you have to cure.
    id: 'berserk', name: 'Berserk', short: 'BSK', color: 0xc8602a,
    expiry: { kind: 'duration', ticks: 32 },
  },
  confuse: {
    // Like Berserk but the target is RANDOM — any alive unit other than the
    // confused one, regardless of team. A confused frontline Knight can
    // accidentally bash their own White Mage. No PA boost — confuse is
    // disorientation, not rage.
    id: 'confuse', name: 'Confuse', short: 'CON', color: 0xa040c0,
    expiry: { kind: 'duration', ticks: 24 },
  },
  charm: {
    // The unit fights for the other side: its turn walks toward and
    // basic-attacks its nearest FORMER ally. Still counts as its original
    // team for the victory check (it's alive, just misbehaving) so the
    // battle doesn't mis-resolve while the 24-tick duration runs.
    id: 'charm', name: 'Charm', short: 'CHM', color: 0xe85d9c,
    expiry: { kind: 'duration', ticks: 24 },
  },
  frog: {
    // Transformed: the unit can still move and basic-attack, but can't use
    // abilities or items (blocksAbilities) and its PA is halved (via
    // effectivePa). A frogged mage simply can't cast — no separate MA
    // penalty needed.
    id: 'frog', name: 'Frog', short: 'FRG', color: 0x6fae3f,
    expiry: { kind: 'duration', ticks: 24 },
    blocksAbilities: true,
  },
  petrify: {
    // Turned to stone — a soft KO. Turn auto-skipped (blocksTurn) and
    // permanent until cured. checkBattleEnd treats a petrified unit as
    // down: a team whose only survivors are petrified loses.
    id: 'petrify', name: 'Petrify', short: 'PET', color: 0x9a9488,
    expiry: { kind: 'permanent' },
    blocksTurn: true,
  },
  undead: {
    // Cursed flesh — healing flips to damage. resolveHeal / resolveFlatHeal
    // and Regen ticks all deal damage to an undead target instead of
    // restoring HP. The combo: Zombie a tanky enemy, then "heal" them.
    id: 'undead', name: 'Undead', short: 'UND', color: 0x6b8f3a,
    expiry: { kind: 'duration', ticks: 32 },
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
