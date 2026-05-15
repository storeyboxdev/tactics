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

export interface WeaponDef {
  id: string;
  name: string;
  /** Weapon-power contribution to the basic-attack damage formula. */
  weaponPower: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  rod:         { id: 'rod',         name: 'Rod',          weaponPower: 3 },
  instrument:  { id: 'instrument',  name: 'Instrument',   weaponPower: 3 },
  cloth:       { id: 'cloth',       name: 'Cloth',        weaponPower: 3 },
  staff:       { id: 'staff',       name: 'Staff',        weaponPower: 4 },
  dagger:      { id: 'dagger',      name: 'Dagger',       weaponPower: 5 },
  gun:         { id: 'gun',         name: 'Gun',          weaponPower: 5 },
  pole:        { id: 'pole',        name: 'Pole',         weaponPower: 6 },
  bow:         { id: 'bow',         name: 'Bow',          weaponPower: 6 },
  ninja_blade: { id: 'ninja_blade', name: 'Ninja Blade',  weaponPower: 6 },
  knuckle:     { id: 'knuckle',     name: 'Knuckle',      weaponPower: 8 },
  spear:       { id: 'spear',       name: 'Spear',        weaponPower: 8 },
  sword:       { id: 'sword',       name: 'Sword',        weaponPower: 9 },
  katana:      { id: 'katana',      name: 'Katana',       weaponPower: 9 },
};
