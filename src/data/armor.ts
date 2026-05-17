/**
 * Armor catalog — Phase 2 of the equipment system.
 *
 * Each job has a signature armor class (see `JobDef.armor`). Armor
 * contributes two damage-reduction multipliers, applied to incoming
 * damage via `effectiveDefenseFactor` / `effectiveMagicDefenseFactor`
 * in ActionResolver. There is no per-unit armor choice yet — that
 * arrives with the Phase 3 equip screen.
 *
 * The four classes form a rock-paper-scissors texture: heavy armor
 * shrugs off steel but not spells; robes resist magic but not steel;
 * light armor is the balanced middle; clothes are the barely-armored
 * baseline.
 */

import { GearBonuses } from './weapons';
import { Element } from './abilities';

export interface ArmorDef {
  id: string;
  name: string;
  /** Multiplier on incoming physical damage (1.0 = none, 0.78 = 22% off). */
  physicalFactor: number;
  /** Multiplier on incoming magic damage. */
  magicalFactor: number;
  /** Flat stat bonuses applied to the wearer. Absent on signature
   *  armor — only loot-tier gear carries one. */
  bonuses?: GearBonuses;
  /** Gil price in the shop. Absent on signature armor — only
   *  loot-tier gear is sold. */
  price?: number;
  /** If set, the wearer takes half damage from this element. */
  resists?: Element;
}

export const ARMOR: Record<string, ArmorDef> = {
  heavy_armor: { id: 'heavy_armor', name: 'Heavy Armor', physicalFactor: 0.78, magicalFactor: 1.00 },
  light_armor: { id: 'light_armor', name: 'Light Armor', physicalFactor: 0.90, magicalFactor: 0.92 },
  robe:        { id: 'robe',        name: 'Robe',        physicalFactor: 1.00, magicalFactor: 0.82 },
  clothes:     { id: 'clothes',     name: 'Clothes',     physicalFactor: 0.95, magicalFactor: 0.95 },

  // ─── Loot-tier armor ──────────────────────────────────────────────────────
  // Not any job's signature — reachable only as battle loot.
  chain_mail: { id: 'chain_mail', name: 'Chain Mail', physicalFactor: 0.82, magicalFactor: 0.95, bonuses: { hp: 12 }, price: 520 },
  silk_robe:  { id: 'silk_robe',  name: 'Silk Robe',  physicalFactor: 1.00, magicalFactor: 0.80, bonuses: { mp: 12 }, price: 520 },

  // Resist armor — halves one element on top of a modest stat line.
  flame_mail:    { id: 'flame_mail',    name: 'Flame Mail',    physicalFactor: 0.84, magicalFactor: 0.95, bonuses: { hp: 8 }, price: 540, resists: 'fire' },
  frost_mail:    { id: 'frost_mail',    name: 'Frost Mail',    physicalFactor: 0.84, magicalFactor: 0.95, bonuses: { hp: 8 }, price: 540, resists: 'ice' },
  storm_mail:    { id: 'storm_mail',    name: 'Storm Mail',    physicalFactor: 0.84, magicalFactor: 0.95, bonuses: { hp: 8 }, price: 540, resists: 'bolt' },
  stone_mail:    { id: 'stone_mail',    name: 'Stone Mail',    physicalFactor: 0.84, magicalFactor: 0.95, bonuses: { hp: 8 }, price: 540, resists: 'earth' },
  hallowed_mail: { id: 'hallowed_mail', name: 'Hallowed Mail', physicalFactor: 0.84, magicalFactor: 0.95, bonuses: { hp: 8 }, price: 540, resists: 'holy' },
  tide_mail:     { id: 'tide_mail',     name: 'Tide Mail',     physicalFactor: 0.84, magicalFactor: 0.95, bonuses: { hp: 8 }, price: 540, resists: 'water' },
};

/** Armor ids that carry a stat bonus — the loot-tier set. */
export const BONUS_ARMOR_IDS: string[] =
  Object.values(ARMOR).filter(a => a.bonuses).map(a => a.id);
