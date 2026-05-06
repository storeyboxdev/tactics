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
  /**
   * Restore a KO'd ally to `hpPercent`% of their hpMax (floor, min 1). The
   * targeting layer surfaces only KO'd allies for this effect; resolution
   * also flips the renderer back to idle.
   */
  | { kind: 'revive'; hpPercent: number }
  /**
   * Mediator's Talk Skill: shift the target's `faith` or `bravery` by
   * `amount` (positive = up, negative = down). Result clamps to [1, 100].
   * Player-unit shifts also sync to UnitProgression so they survive between
   * battles. Same faith-scaled hit roll as inflict-status.
   */
  | { kind: 'stat-shift'; stat: 'faith' | 'bravery'; amount: number;
      targetTeam: 'enemy' | 'ally' | 'any'; baseAccuracy: number }
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
  /**
   * For charged abilities (Lancer's Jump): the caster is removed from the
   * field while the spell is queued. Untargetable, doesn't appear in turn
   * order, sprite hidden. Flips back when the scheduled action resolves.
   * No-op on instant abilities.
   */
  castAirborne?: boolean;
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
  raise: {
    id: 'raise', name: 'Raise',
    jpCost: 350, type: 'magical', range: 4, chargeTime: 3, mpCost: 14,
    effect: { kind: 'revive', hpPercent: 50 },
  },

  // ─── Chemist ──────────────────────────────────────────────────────────────
  phoenix_down: {
    // FFT-canonical Chemist identity: an instant, free, melee-range revive
    // at a lower percentage than the White Mage's Raise. The hospital
    // counterpart of Cure — short-range, no charge, no MP, but the unit
    // comes back at 25% instead of 50%.
    id: 'phoenix_down', name: 'Phoenix Down',
    jpCost: 100, type: 'physical', range: 1, chargeTime: 0, mpCost: 0,
    effect: { kind: 'revive', hpPercent: 25 },
  },

  // ─── Squire ───────────────────────────────────────────────────────────────
  throw_stone: {
    // The Squire's signature low-power ranged option — cheap to learn, free
    // to cast, and the only actual skill a default-roster Squire ships with.
    // Range 3 keeps it noticeably shorter than Archer's Charge / Ninja's
    // Throw, and weaponPower 3 puts a typical hit at ~15-20 dmg.
    id: 'throw_stone', name: 'Throw Stone',
    jpCost: 100, type: 'physical', range: 3, chargeTime: 0, mpCost: 0,
    effect: { kind: 'physical-ranged-damage', weaponPower: 3 },
  },

  // ─── Archer ───────────────────────────────────────────────────────────────
  charge_2: {
    id: 'charge_2', name: 'Charge+2',
    jpCost: 200, type: 'physical', range: 4, chargeTime: 2, mpCost: 0,
    effect: { kind: 'physical-ranged-damage', weaponPower: 7 },
  },

  // ─── Samurai (Draw Out) ───────────────────────────────────────────────────
  // FFT canon: drawing a katana releases its spirit in a sweeping AoE around
  // the samurai. We don't have an item-break system, so the cost shows up
  // in JP (these are pricey to learn) rather than consumed katanas. All are
  // range 0 (self-centered) — the AoE catches everyone in radius regardless
  // of effect type.
  asura: {
    id: 'asura', name: 'Asura',
    jpCost: 200, type: 'magical', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'magic-damage', spellPower: 14, element: 'fire' },
    area: { radius: 1 },
  },
  koutetsu: {
    id: 'koutetsu', name: 'Koutetsu',
    jpCost: 350, type: 'magical', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'magic-damage', spellPower: 16 },
    area: { radius: 2 },
  },
  murasame: {
    id: 'murasame', name: 'Murasame',
    jpCost: 300, type: 'magical', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'magic-heal', spellPower: 14 },
    area: { radius: 1 },
  },
  kiyomori: {
    id: 'kiyomori', name: 'Kiyomori',
    jpCost: 400, type: 'magical', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'inflict-status', statusId: 'haste', targetTeam: 'ally', baseAccuracy: 200 },
    area: { radius: 2 },
  },
  chirijiraden: {
    // The big finisher — long charge, wide AoE, strong magic-damage. Saved
    // for end-of-battle "screw it, end this" moments.
    id: 'chirijiraden', name: 'Chirijiraden',
    jpCost: 700, type: 'magical', range: 0, chargeTime: 2, mpCost: 0,
    effect: { kind: 'magic-damage', spellPower: 22 },
    area: { radius: 2 },
  },

  // ─── Lancer ───────────────────────────────────────────────────────────────
  jump: {
    // FFT canon: the Lancer leaps off the field, becomes untargetable, and
    // crashes down on a target tile some ticks later for double damage.
    // Range 4 covers most realistic battlefield distances; CT 5 gives the
    // enemy a window to reposition or focus down the lancer's allies before
    // the strike lands. The big weaponPower (9) is the "double damage" half.
    id: 'jump', name: 'Jump',
    jpCost: 350, type: 'physical', range: 4, chargeTime: 5, mpCost: 0,
    effect: { kind: 'physical-ranged-damage', weaponPower: 9 },
    castAirborne: true,
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

  // ─── Summoner ─────────────────────────────────────────────────────────────
  // Espers identical in power and shape, differing only by element. The big
  // radius-2 cross + 24 MP cost is the FFT identity: pricey, slow to charge,
  // but devastating to a clustered enemy. Friendly fire is a real risk.
  summon_ifrit: {
    id: 'summon_ifrit', name: 'Ifrit',
    jpCost: 500, type: 'magical', range: 4, chargeTime: 4, mpCost: 24,
    effect: { kind: 'magic-damage', spellPower: 22, element: 'fire' },
    area: { radius: 2 },
  },
  summon_shiva: {
    id: 'summon_shiva', name: 'Shiva',
    jpCost: 500, type: 'magical', range: 4, chargeTime: 4, mpCost: 24,
    effect: { kind: 'magic-damage', spellPower: 22, element: 'ice' },
    area: { radius: 2 },
  },
  summon_ramuh: {
    id: 'summon_ramuh', name: 'Ramuh',
    jpCost: 500, type: 'magical', range: 4, chargeTime: 4, mpCost: 24,
    effect: { kind: 'magic-damage', spellPower: 22, element: 'bolt' },
    area: { radius: 2 },
  },

  // ─── Bard ─────────────────────────────────────────────────────────────────
  cheer_song: {
    // Self-centered party haste. The Bard clicks themselves (the only valid
    // target at range 0 for an ally-status), and the AoE catches every ally
    // within Manhattan 2 — including the Bard themselves.
    id: 'cheer_song', name: 'Cheer Song',
    jpCost: 300, type: 'magical', range: 0, chargeTime: 3, mpCost: 12,
    effect: { kind: 'inflict-status', statusId: 'haste', targetTeam: 'ally', baseAccuracy: 200 },
    area: { radius: 2 },
  },

  // ─── Dancer ───────────────────────────────────────────────────────────────
  slow_dance: {
    id: 'slow_dance', name: 'Slow Dance',
    jpCost: 300, type: 'magical', range: 4, chargeTime: 3, mpCost: 12,
    effect: { kind: 'inflict-status', statusId: 'slow', targetTeam: 'enemy', baseAccuracy: 120 },
    area: { radius: 2 },
  },
  polka_polka: {
    id: 'polka_polka', name: 'Polka Polka',
    jpCost: 250, type: 'magical', range: 4, chargeTime: 3, mpCost: 10,
    effect: { kind: 'inflict-status', statusId: 'poison', targetTeam: 'enemy', baseAccuracy: 140 },
    area: { radius: 2 },
  },

  // ─── Mediator (Talk Skill) ────────────────────────────────────────────────
  // Permanent faith/bravery shifts. Buffs (Praise/Solution) target allies
  // with a high baseAccuracy; debuffs (Insult/Preach) target enemies with
  // a lower one — same faith-scaled hit-chance shape as status spells.
  praise: {
    id: 'praise', name: 'Praise',
    jpCost: 200, type: 'magical', range: 4, chargeTime: 0, mpCost: 4,
    effect: { kind: 'stat-shift', stat: 'bravery', amount: 5,
              targetTeam: 'ally', baseAccuracy: 200 },
  },
  insult: {
    id: 'insult', name: 'Insult',
    jpCost: 250, type: 'magical', range: 4, chargeTime: 0, mpCost: 4,
    effect: { kind: 'stat-shift', stat: 'bravery', amount: -5,
              targetTeam: 'enemy', baseAccuracy: 130 },
  },
  solution: {
    id: 'solution', name: 'Solution',
    jpCost: 200, type: 'magical', range: 4, chargeTime: 0, mpCost: 4,
    effect: { kind: 'stat-shift', stat: 'faith', amount: 5,
              targetTeam: 'ally', baseAccuracy: 200 },
  },
  preach: {
    id: 'preach', name: 'Preach',
    jpCost: 250, type: 'magical', range: 4, chargeTime: 0, mpCost: 4,
    effect: { kind: 'stat-shift', stat: 'faith', amount: -5,
              targetTeam: 'enemy', baseAccuracy: 130 },
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
