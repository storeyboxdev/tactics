/**
 * Active ability definitions used by skill targeting and resolution.
 *
 * MVP scope (M9): two Knight Breaks (instant physical debuffs) and the three
 * elemental Black Mage spells (charged magic damage). The full FFT-style
 * `Ability` schema (reactions, supports, movements) is deferred — when those
 * land, this table grows but its consumers shouldn't need to change much.
 */

import { StatusId } from './statuses';

export type AbilityEffect =
  | { kind: 'magic-damage'; spellPower: number; element?: 'fire' | 'ice' | 'bolt' | 'earth' }
  | { kind: 'magic-heal'; spellPower: number }
  | { kind: 'physical-ranged-damage'; weaponPower: number }
  | { kind: 'debuff'; stat: 'pa' | 'speed' | 'ma'; amount: number }
  /**
   * Cast a status. `baseAccuracy` is FFT's "Y" parameter — fed into the
   * faith-scaled hit formula `Y × casterFaith/100 × targetFaith/100` and
   * clamped to [0, 100].
   */
  | { kind: 'inflict-status'; statusId: StatusId; targetTeam: 'enemy' | 'ally' | 'any'; baseAccuracy: number }
  // Passive: reactions trigger when the unit is hit.
  | { kind: 'reaction-counter' }
  | { kind: 'reaction-auto-potion'; amount: number }
  // Passive: supports modify the unit between events.
  | { kind: 'support-mp-recovery'; amount: number }
  // Passive: movements modify movement / fire when moving.
  | { kind: 'movement-move-plus'; amount: number }
  | { kind: 'movement-hp-up'; amount: number };

export type AbilityKind = 'physical' | 'magical' | 'reaction' | 'support' | 'movement';

export interface Ability {
  id: string;
  name: string;
  jpCost: number;        // unused until JP/job progression lands
  type: AbilityKind;
  range: number;         // Manhattan tiles (0 for passive)
  chargeTime: number;    // 0 = instant; >0 = ticks to wait before resolving
  mpCost: number;
  effect: AbilityEffect;
  /**
   * Area-of-effect pattern around the target tile. Omitted = single-target.
   * The cross-radius pattern is FFT-canonical: every tile within Manhattan
   * distance ≤ radius (including the center). Each affected unit rolls hit
   * and damage independently — a Fire2 cluster can land on three units and
   * crit one, miss one, and softball the third.
   */
  area?: { radius: number };
}

export const ABILITIES: Record<string, Ability> = {
  power_break: {
    id: 'power_break',
    name: 'Power Break',
    jpCost: 200,
    type: 'physical',
    range: 1,
    chargeTime: 0,
    mpCost: 0,
    effect: { kind: 'debuff', stat: 'pa', amount: 2 },
  },
  speed_break: {
    id: 'speed_break',
    name: 'Speed Break',
    jpCost: 400,
    type: 'physical',
    range: 1,
    chargeTime: 0,
    mpCost: 0,
    effect: { kind: 'debuff', stat: 'speed', amount: 2 },
  },
  fire: {
    id: 'fire',
    name: 'Fire',
    jpCost: 200,
    type: 'magical',
    range: 4,
    chargeTime: 4,
    mpCost: 6,
    effect: { kind: 'magic-damage', spellPower: 14, element: 'fire' },
  },
  bolt: {
    id: 'bolt',
    name: 'Bolt',
    jpCost: 200,
    type: 'magical',
    range: 4,
    chargeTime: 5,
    mpCost: 6,
    effect: { kind: 'magic-damage', spellPower: 16, element: 'bolt' },
  },
  ice: {
    id: 'ice',
    name: 'Ice',
    jpCost: 200,
    type: 'magical',
    range: 4,
    chargeTime: 3,
    mpCost: 6,
    effect: { kind: 'magic-damage', spellPower: 12, element: 'ice' },
  },

  // Tier-2 elemental spells — same range / element as their tier-1, but
  // bigger spellpower, longer charge, and a Manhattan radius-1 AoE. Roughly
  // FFT-canonical scaling.
  fire_2: {
    id: 'fire_2', name: 'Fire 2',
    jpCost: 400, type: 'magical', range: 4, chargeTime: 5, mpCost: 12,
    effect: { kind: 'magic-damage', spellPower: 20, element: 'fire' },
    area: { radius: 1 },
  },
  bolt_2: {
    id: 'bolt_2', name: 'Bolt 2',
    jpCost: 400, type: 'magical', range: 4, chargeTime: 6, mpCost: 12,
    effect: { kind: 'magic-damage', spellPower: 22, element: 'bolt' },
    area: { radius: 1 },
  },
  ice_2: {
    id: 'ice_2', name: 'Ice 2',
    jpCost: 400, type: 'magical', range: 4, chargeTime: 4, mpCost: 12,
    effect: { kind: 'magic-damage', spellPower: 18, element: 'ice' },
    area: { radius: 1 },
  },

  // ─── Time Mage ────────────────────────────────────────────────────────────
  haste: {
    id: 'haste', name: 'Haste',
    jpCost: 300, type: 'magical', range: 3, chargeTime: 2, mpCost: 8,
    effect: { kind: 'inflict-status', statusId: 'haste', targetTeam: 'ally', baseAccuracy: 200 },
  },
  slow: {
    id: 'slow', name: 'Slow',
    jpCost: 400, type: 'magical', range: 3, chargeTime: 3, mpCost: 8,
    effect: { kind: 'inflict-status', statusId: 'slow', targetTeam: 'enemy', baseAccuracy: 120 },
  },
  stop: {
    id: 'stop', name: 'Stop',
    jpCost: 600, type: 'magical', range: 3, chargeTime: 4, mpCost: 14,
    effect: { kind: 'inflict-status', statusId: 'stop', targetTeam: 'enemy', baseAccuracy: 100 },
  },

  // ─── Oracle ───────────────────────────────────────────────────────────────
  sleep: {
    id: 'sleep', name: 'Sleep',
    jpCost: 300, type: 'magical', range: 3, chargeTime: 2, mpCost: 8,
    effect: { kind: 'inflict-status', statusId: 'sleep', targetTeam: 'enemy', baseAccuracy: 130 },
  },
  poison_spell: {
    id: 'poison_spell', name: 'Poison',
    jpCost: 200, type: 'magical', range: 3, chargeTime: 2, mpCost: 6,
    effect: { kind: 'inflict-status', statusId: 'poison', targetTeam: 'enemy', baseAccuracy: 140 },
  },

  // ─── White Mage ───────────────────────────────────────────────────────────
  cure: {
    id: 'cure', name: 'Cure',
    jpCost: 100, type: 'magical', range: 4, chargeTime: 2, mpCost: 6,
    effect: { kind: 'magic-heal', spellPower: 12 },
  },
  cura: {
    id: 'cura', name: 'Cura',
    jpCost: 250, type: 'magical', range: 4, chargeTime: 3, mpCost: 14,
    effect: { kind: 'magic-heal', spellPower: 18 },
  },

  // ─── Archer ───────────────────────────────────────────────────────────────
  charge_2: {
    id: 'charge_2', name: 'Charge+2',
    jpCost: 200, type: 'physical', range: 4, chargeTime: 2, mpCost: 0,
    effect: { kind: 'physical-ranged-damage', weaponPower: 7 },
  },

  // ─── Monk ─────────────────────────────────────────────────────────────────
  wave_fist: {
    id: 'wave_fist', name: 'Wave Fist',
    jpCost: 150, type: 'physical', range: 2, chargeTime: 0, mpCost: 0,
    effect: { kind: 'physical-ranged-damage', weaponPower: 5 },
  },
  chakra: {
    id: 'chakra', name: 'Chakra',
    jpCost: 500, type: 'magical', range: 1, chargeTime: 0, mpCost: 0,
    effect: { kind: 'magic-heal', spellPower: 6 },
  },

  // ─── Geomancer ────────────────────────────────────────────────────────────
  pebble_blast: {
    id: 'pebble_blast', name: 'Pebble Blast',
    jpCost: 150, type: 'magical', range: 3, chargeTime: 0, mpCost: 0,
    effect: { kind: 'magic-damage', spellPower: 8, element: 'earth' },
    area: { radius: 1 },  // 5-tile cross around the target
  },

  // ─── Ninja ────────────────────────────────────────────────────────────────
  throw_shuriken: {
    id: 'throw_shuriken', name: 'Throw',
    jpCost: 200, type: 'physical', range: 4, chargeTime: 0, mpCost: 0,
    effect: { kind: 'physical-ranged-damage', weaponPower: 6 },
  },

  // ─── Reactions ────────────────────────────────────────────────────────────
  counter: {
    id: 'counter', name: 'Counter',
    jpCost: 500, type: 'reaction', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'reaction-counter' },
  },
  auto_potion: {
    id: 'auto_potion', name: 'Auto-Potion',
    jpCost: 350, type: 'reaction', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'reaction-auto-potion', amount: 30 },
  },

  // ─── Support ──────────────────────────────────────────────────────────────
  mp_recovery: {
    id: 'mp_recovery', name: 'MP Recovery',
    jpCost: 400, type: 'support', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'support-mp-recovery', amount: 5 },
  },

  // ─── Movement ─────────────────────────────────────────────────────────────
  move_plus_1: {
    id: 'move_plus_1', name: 'Move +1',
    jpCost: 200, type: 'movement', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'movement-move-plus', amount: 1 },
  },
  move_hp_up: {
    id: 'move_hp_up', name: 'Move HP Up',
    jpCost: 300, type: 'movement', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'movement-hp-up', amount: 5 },
  },
};

// Job → ability mapping moved to JOB_DEFS[jobId].learnableActives (src/data/jobs.ts).
