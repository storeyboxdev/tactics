/**
 * Weapon catalog — Phase 1 of the equipment system.
 *
 * Each job has a signature weapon (see `JobDef.weapon`). A unit's basic
 * Attack reads `weaponPower` from its job's weapon via
 * `effectiveWeaponPower` in ActionResolver. There is no per-unit weapon
 * choice yet — that arrives with the Phase 3 equip screen.
 *
 * WP values are calibrated around the legacy `PLACEHOLDER_WEAPON_POWER`
 * (4): casters sit below it (basic Attack is a fallback for them),
 * martial jobs rise above it (their Fight command should actually hurt).
 */

import { Element } from './abilities';

/** Flat additive stat bonuses a piece of gear grants its wearer. */
export type GearBonuses = Partial<{
  hp: number;
  mp: number;
  pa: number;
  ma: number;
  speed: number;
}>;

export interface WeaponDef {
  id: string;
  name: string;
  /** Weapon-power contribution to the basic-attack damage formula. */
  weaponPower: number;
  /** Flat stat bonuses applied to the wearer. Absent on signature
   *  weapons — only loot-tier gear carries one. */
  bonuses?: GearBonuses;
  /** Gil price in the shop. Absent on signature weapons — only
   *  loot-tier gear is sold. */
  price?: number;
  /** If set, the wearer's basic Attack deals this element — interacting
   *  with the target's elemental affinity. */
  element?: Element;
  /** Basic-attack reach in Manhattan tiles. Absent means melee (1). */
  range?: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  rod:         { id: 'rod',         name: 'Rod',          weaponPower: 3 },
  instrument:  { id: 'instrument',  name: 'Instrument',   weaponPower: 3 },
  cloth:       { id: 'cloth',       name: 'Cloth',        weaponPower: 3 },
  staff:       { id: 'staff',       name: 'Staff',        weaponPower: 4 },
  dagger:      { id: 'dagger',      name: 'Dagger',       weaponPower: 5 },
  gun:         { id: 'gun',         name: 'Gun',          weaponPower: 5, range: 5 },
  pole:        { id: 'pole',        name: 'Pole',         weaponPower: 6 },
  bow:         { id: 'bow',         name: 'Bow',          weaponPower: 6, range: 4 },
  ninja_blade: { id: 'ninja_blade', name: 'Ninja Blade',  weaponPower: 6 },
  knuckle:     { id: 'knuckle',     name: 'Knuckle',      weaponPower: 8 },
  spear:       { id: 'spear',       name: 'Spear',        weaponPower: 8 },
  sword:       { id: 'sword',       name: 'Sword',        weaponPower: 9 },
  katana:      { id: 'katana',      name: 'Katana',       weaponPower: 9 },
  // Natural weapon — monsters' claws / beaks / fangs.
  claw:        { id: 'claw',        name: 'Claw',         weaponPower: 6 },

  // ─── Loot-tier weapons ────────────────────────────────────────────────────
  // Not any job's signature — reachable only as battle loot. Each pairs a
  // weapon-power line with a flat stat bonus.
  mythril_sword: { id: 'mythril_sword', name: 'Mythril Sword', weaponPower: 11, bonuses: { pa: 1 },    price: 600 },
  flame_rod:     { id: 'flame_rod',     name: 'Flame Rod',     weaponPower: 4,  bonuses: { ma: 2 },    price: 480 },
  hunting_bow:   { id: 'hunting_bow',   name: 'Hunting Bow',   weaponPower: 7,  bonuses: { speed: 1 }, price: 480, range: 4 },

  // Elemental weapons — a basic Attack that carries an element.
  flame_sword:   { id: 'flame_sword',   name: 'Flame Sword',   weaponPower: 10, bonuses: { pa: 1 },    price: 620, element: 'fire' },
  frost_dagger:  { id: 'frost_dagger',  name: 'Frost Dagger',  weaponPower: 6,  bonuses: { speed: 1 }, price: 520, element: 'ice' },
  thunder_spear: { id: 'thunder_spear', name: 'Thunder Spear', weaponPower: 9,  bonuses: { pa: 1 },    price: 600, element: 'bolt' },
};

/** Weapon ids that carry a stat bonus — the loot-tier set. Derived so a
 *  new bonus weapon needs only its WEAPONS entry. */
export const BONUS_WEAPON_IDS: string[] =
  Object.values(WEAPONS).filter(w => w.bonuses).map(w => w.id);
