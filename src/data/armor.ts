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

export interface ArmorDef {
  id: string;
  name: string;
  /** Multiplier on incoming physical damage (1.0 = none, 0.78 = 22% off). */
  physicalFactor: number;
  /** Multiplier on incoming magic damage. */
  magicalFactor: number;
}

export const ARMOR: Record<string, ArmorDef> = {
  heavy_armor: { id: 'heavy_armor', name: 'Heavy Armor', physicalFactor: 0.78, magicalFactor: 1.00 },
  light_armor: { id: 'light_armor', name: 'Light Armor', physicalFactor: 0.90, magicalFactor: 0.92 },
  robe:        { id: 'robe',        name: 'Robe',        physicalFactor: 1.00, magicalFactor: 0.82 },
  clothes:     { id: 'clothes',     name: 'Clothes',     physicalFactor: 0.95, magicalFactor: 0.95 },
};
