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
  | { kind: 'magic-damage'; spellPower: number; element?: 'fire' | 'ice' | 'bolt' | 'earth' | 'holy' }
  | { kind: 'magic-heal'; spellPower: number }
  | { kind: 'physical-ranged-damage'; weaponPower: number;
      /** If set, the caster heals for floor(damage × drainPercent / 100) on a hit. Used by Thief's Mug. */
      drainPercent?: number }
  /**
   * Restore a KO'd ally to `hpPercent`% of their hpMax (floor, min 1). The
   * targeting layer surfaces only KO'd allies for this effect; resolution
   * also flips the renderer back to idle.
   */
  | { kind: 'revive'; hpPercent: number }
  /**
   * Shift one of the target's stats by `amount` (positive = up, negative =
   * down). Result clamps to [1, 100]. Same faith-scaled hit roll as
   * inflict-status.
   *
   * - `faith` / `bravery` are FFT "personality" stats — shifts default to
   *   persistent, syncing to UnitProgression so they survive across battles.
   * - `pa` / `ma` / `speed` are per-battle by default (FFT canon: Squire's
   *   Accumulate raises PA only until the battle ends). Set
   *   `persistent: true` to override.
   */
  | { kind: 'stat-shift';
      stat: 'faith' | 'bravery' | 'pa' | 'ma' | 'speed';
      amount: number;
      targetTeam: 'enemy' | 'ally' | 'any'; baseAccuracy: number;
      persistent?: boolean }
  /**
   * Mime: re-cast whatever the mime's own team did most recently. The caller
   * looks up the recorded (abilityId, target tile) and runs the standard
   * apply-instant-ability pipeline as the mime. No range / target picker —
   * the original action's target tile is reused.
   */
  | { kind: 'mimic' }
  /**
   * Calculator: simultaneously hit every alive unit on the field whose
   * `stat` is divisible by `divisor`, with a magic-damage burst at
   * `spellPower`. Ignores team and range — both your own units and enemies
   * matching the rule take the hit, so picking the right divisor is the
   * tactical play. No MP cost; the math itself is the cost.
   */
  | { kind: 'math-skill'; stat: 'hp' | 'mp' | 'ct' | 'level'; divisor: number;
      spellPower: number; element?: 'fire' | 'ice' | 'bolt' | 'earth' | 'holy' }
  | { kind: 'debuff'; stat: 'pa' | 'speed' | 'ma'; amount: number }
  /**
   * Cast a status. `baseAccuracy` is FFT's "Y" parameter — fed into the
   * faith-scaled hit formula `Y × casterFaith/100 × targetFaith/100` and
   * clamped to [0, 100].
   */
  | { kind: 'inflict-status'; statusId: StatusId; targetTeam: 'enemy' | 'ally' | 'any'; baseAccuracy: number }
  /**
   * Remove any of `statuses` currently active on the target. One faith-scaled
   * roll (`baseAccuracy × casterFaith/100 × targetFaith/100`) gates the whole
   * cast — on success every listed status the target has is removed. Cannot
   * revive a KO'd unit; targeting filters to alive allies who have ≥1 of the
   * listed statuses.
   */
  | { kind: 'cure-status'; statuses: StatusId[]; targetTeam: 'ally' | 'any'; baseAccuracy: number }
  // Passive: reactions trigger when the unit is hit.
  | { kind: 'reaction-counter' }
  | { kind: 'reaction-auto-potion'; amount: number }
  /** Heals `hpPercent`% of hpMax when the unit's HP drops to ≤ thresholdPercent. */
  | { kind: 'reaction-hp-restore'; thresholdPercent: number; hpPercent: number }
  /** Raises bravery by `amount` (clamped at 100) on every damage instance. */
  | { kind: 'reaction-brave-up'; amount: number }
  // Passive: supports modify the unit between events.
  | { kind: 'support-mp-recovery'; amount: number }
  /** Multiplies JP earned per action by `factor` (e.g. 1.5 = +50%). */
  | { kind: 'support-jp-up'; factor: number }
  /** Multiplies the caster's effective MA on magic-damage / magic-heal casts. */
  | { kind: 'support-magic-attack-up'; factor: number }
  /** Multiplies incoming physical damage by `factor` (0.75 = 25% reduction). */
  | { kind: 'support-defense-up'; factor: number }
  /** Multiplies incoming magic damage by `factor` (0.75 = 25% reduction). */
  | { kind: 'support-magic-defense-up'; factor: number }
  // Passive: movements modify movement / fire when moving.
  | { kind: 'movement-move-plus'; amount: number }
  | { kind: 'movement-hp-up'; amount: number }
  /** Treats water tiles as passable for movement / pathing. */
  | { kind: 'movement-float' }
  /** Adds `amount` to the unit's effective jump stat (taller climbs allowed). */
  | { kind: 'movement-jump-plus'; amount: number };

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
  magic_break: {
    // Third Knight Break — same mechanic as Power/Speed but on the magic
    // axis. Lands an enemy Black Mage in a much worse position: their Fire
    // and Ice spells visibly drop in damage on the next cast. Same melee
    // range and 300 JP cost slots it between Power Break (200) and Speed
    // Break (400) in learning order.
    id: 'magic_break',
    name: 'Magic Break',
    jpCost: 300,
    type: 'physical',
    range: 1,
    chargeTime: 0,
    mpCost: 0,
    effect: { kind: 'debuff', stat: 'ma', amount: 2 },
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
  flare: {
    // The Black Mage's ceiling — non-elemental, single-target, monster
    // damage. No AoE, no element to resist. The trade-off is the longest
    // charge (7) and steepest MP cost in the game; if a Black Mage casts
    // Flare, the rest of the party is buying them the window.
    id: 'flare', name: 'Flare',
    jpCost: 800, type: 'magical', range: 4, chargeTime: 7, mpCost: 32,
    effect: { kind: 'magic-damage', spellPower: 32 },
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
  silence_song: {
    // Locks an enemy out of all magical-type abilities for 32 ticks. The
    // most devastating cast against a Black Mage or Summoner; near-useless
    // on a Knight. AI scoring reflects the asymmetry.
    id: 'silence_song', name: 'Silence Song',
    jpCost: 300, type: 'magical', range: 4, chargeTime: 2, mpCost: 8,
    effect: { kind: 'inflict-status', statusId: 'silence', targetTeam: 'enemy', baseAccuracy: 130 },
  },
  paralyze: {
    // Pins an enemy in place — they can still attack adjacent foes but can't
    // chase or reposition. Pair with Poison or a Black Mage's charged spell
    // for a guaranteed hit. Shares the `restraint` group with Foxbird, so
    // a Don't Move replaces a Don't Act (and vice versa).
    id: 'paralyze', name: 'Paralyze',
    jpCost: 400, type: 'magical', range: 3, chargeTime: 2, mpCost: 8,
    effect: { kind: 'inflict-status', statusId: 'dont_move', targetTeam: 'enemy', baseAccuracy: 120 },
  },
  foxbird: {
    // The Oracle's hardest debuff: target can move but can't Attack, Skill,
    // or Item for 24 ticks. Steepest baseAcc penalty + biggest MP cost in
    // the Oracle kit reflects how brutal it is when it lands.
    id: 'foxbird', name: 'Foxbird',
    jpCost: 500, type: 'magical', range: 3, chargeTime: 2, mpCost: 10,
    effect: { kind: 'inflict-status', statusId: 'dont_act', targetTeam: 'enemy', baseAccuracy: 110 },
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
  curaja: {
    // Tier-3 heal — high spellpower plus a radius-1 cross to top up a
    // huddled party. Long charge (5) so the timing window matters; pricey
    // MP keeps it from being spammed.
    id: 'curaja', name: 'Curaja',
    jpCost: 600, type: 'magical', range: 4, chargeTime: 5, mpCost: 24,
    effect: { kind: 'magic-heal', spellPower: 26 },
    area: { radius: 1 },
  },
  holy: {
    // The White Mage's offensive ceiling — single-target Holy element. Long
    // charge, high MP, no AoE — but spellpower 28 lands harder than any
    // tier-2 Black Mage spell. Element 'holy' has no resists yet but the
    // tag is reserved for when Holy/Dark resistance lands.
    id: 'holy', name: 'Holy',
    jpCost: 800, type: 'magical', range: 4, chargeTime: 6, mpCost: 30,
    effect: { kind: 'magic-damage', spellPower: 28, element: 'holy' },
  },
  raise: {
    id: 'raise', name: 'Raise',
    jpCost: 350, type: 'magical', range: 4, chargeTime: 3, mpCost: 14,
    effect: { kind: 'revive', hpPercent: 50 },
  },
  regen: {
    // FFT-style Regen — ally inflict-status that ticks healing. Mirror the
    // shape of Haste (CT 2, MP 8, baseAcc 200) so the casting-economy
    // matches a positive-status spell. -4 hp/tick over 32 ticks = ~128 HP
    // total if it runs full duration; usually less because the unit gets hit.
    id: 'regen', name: 'Regen',
    jpCost: 300, type: 'magical', range: 4, chargeTime: 2, mpCost: 8,
    effect: { kind: 'inflict-status', statusId: 'regen', targetTeam: 'ally', baseAccuracy: 200 },
  },
  esuna: {
    // White Mage cleanup — one cast clears any of the listed statuses the
    // target has. Pricier MP than Cure to discourage abuse, and won't
    // remove buffs (haste, regen) or KO.
    id: 'esuna', name: 'Esuna',
    jpCost: 400, type: 'magical', range: 4, chargeTime: 2, mpCost: 10,
    effect: { kind: 'cure-status',
              statuses: ['poison', 'silence', 'sleep', 'slow', 'stop', 'dont_move', 'dont_act'],
              targetTeam: 'ally', baseAccuracy: 200 },
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
  remedy: {
    // Chemist's status-cleanup counterpart to Phoenix Down: melee range, no
    // MP, no charge, but lower hit-rate than Esuna (no faith multiplier
    // would still scale with baseAcc 200; we set lower baseAcc to mark it
    // as the "good enough in a pinch" version). Type 'physical' keeps it
    // usable through Silence — Chemist's bag of tools is canonically
    // mundane, not magical.
    id: 'remedy', name: 'Remedy',
    jpCost: 200, type: 'physical', range: 1, chargeTime: 0, mpCost: 0,
    effect: { kind: 'cure-status',
              statuses: ['poison', 'silence', 'sleep', 'slow', 'stop', 'dont_move', 'dont_act'],
              targetTeam: 'ally', baseAccuracy: 160 },
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
  accumulate: {
    // FFT-canonical Squire identity: spend a turn priming for +1 PA. The
    // gain expires at battle end (stat-shift persistent: false). baseAcc
    // 200 with self target means it always lands. Range 0 keeps it as a
    // pure self-buff.
    id: 'accumulate', name: 'Accumulate',
    jpCost: 100, type: 'physical', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'stat-shift', stat: 'pa', amount: 1,
              targetTeam: 'ally', baseAccuracy: 200, persistent: false },
  },
  yell: {
    // Range 1 ally-Speed buff — bark out orders to a frontline ally so they
    // get their next turn sooner. Same single-point bump as Accumulate.
    id: 'yell', name: 'Yell',
    jpCost: 150, type: 'physical', range: 1, chargeTime: 0, mpCost: 0,
    effect: { kind: 'stat-shift', stat: 'speed', amount: 1,
              targetTeam: 'ally', baseAccuracy: 200, persistent: false },
  },

  // ─── Archer ───────────────────────────────────────────────────────────────
  // Charge tiers trade charge time for damage. Aim+1 is a fast cheap shot
  // (between Throw Stone and Charge+2), Aim+3 is the big windup. Same
  // ranged-physical formula, no MP, no element — only the CT/WP curve
  // changes. AI picks among them based on its threat / opportunity model.
  aim_plus_1: {
    id: 'aim_plus_1', name: 'Aim+1',
    jpCost: 150, type: 'physical', range: 4, chargeTime: 1, mpCost: 0,
    effect: { kind: 'physical-ranged-damage', weaponPower: 5 },
  },
  charge_2: {
    id: 'charge_2', name: 'Charge+2',
    jpCost: 200, type: 'physical', range: 4, chargeTime: 2, mpCost: 0,
    effect: { kind: 'physical-ranged-damage', weaponPower: 7 },
  },
  aim_plus_3: {
    id: 'aim_plus_3', name: 'Aim+3',
    jpCost: 350, type: 'physical', range: 4, chargeTime: 3, mpCost: 0,
    effect: { kind: 'physical-ranged-damage', weaponPower: 9 },
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

  // ─── Thief ────────────────────────────────────────────────────────────────
  // FFT canon's Steal kit needs an equipment system we don't have yet. Mug
  // gives the Thief a distinctive identity move using only existing
  // mechanics: a melee-range physical that drains half the dealt damage as
  // HP onto the attacker. Doesn't trigger Counter (consistent with the
  // ranged-physical rule).
  mug: {
    id: 'mug', name: 'Mug',
    jpCost: 200, type: 'physical', range: 1, chargeTime: 0, mpCost: 0,
    effect: { kind: 'physical-ranged-damage', weaponPower: 4, drainPercent: 50 },
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

  // ─── Calculator (Math Skill) ──────────────────────────────────────────────
  // Global magic-damage filtered by a divisibility rule. No range, no MP,
  // no team filter — every alive unit matching the rule takes the hit. The
  // tactical play is observing the field and picking the rule that catches
  // the most enemies and fewest allies.
  math_lvl_3: {
    id: 'math_lvl_3', name: 'Lv %3 → Fire',
    jpCost: 400, type: 'magical', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'math-skill', stat: 'level', divisor: 3, spellPower: 12, element: 'fire' },
  },
  math_lvl_4: {
    id: 'math_lvl_4', name: 'Lv %4 → Bolt',
    jpCost: 500, type: 'magical', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'math-skill', stat: 'level', divisor: 4, spellPower: 14, element: 'bolt' },
  },
  math_ct_5: {
    id: 'math_ct_5', name: 'CT %5 → Ice',
    jpCost: 600, type: 'magical', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'math-skill', stat: 'ct', divisor: 5, spellPower: 14, element: 'ice' },
  },

  // ─── Mime ─────────────────────────────────────────────────────────────────
  mimic: {
    // Replays the mime's team's most recent ability at the same target. The
    // recorded ability's CT and AoE still apply (a mimicked Cura still
    // charges, a mimicked Pebble Blast still hits a 5-tile cross). MP cost
    // is FREE for the mime regardless of what's being copied — the copy
    // itself is the cost.
    id: 'mimic', name: 'Mimic',
    jpCost: 200, type: 'magical', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'mimic' },
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
  hp_restore: {
    // Lazarus-style — when the unit drops below 25% HP, snap them back up
    // by 25% hpMax. Triggers on any damage (poison ticks, magic, melee).
    id: 'hp_restore', name: 'HP Restore',
    jpCost: 600, type: 'reaction', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'reaction-hp-restore', thresholdPercent: 25, hpPercent: 25 },
  },
  brave_up: {
    // Slow-burn courage: every hit that lands on this unit raises their
    // permanent bravery by 1. Synergises with Counter (more brave = more
    // counter-procs) and survives between battles via UnitProgression.
    id: 'brave_up', name: 'Brave Up',
    jpCost: 400, type: 'reaction', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'reaction-brave-up', amount: 1 },
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
  move_plus_2: {
    id: 'move_plus_2', name: 'Move +2',
    jpCost: 500, type: 'movement', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'movement-move-plus', amount: 2 },
  },
  move_hp_up: {
    id: 'move_hp_up', name: 'Move HP Up',
    jpCost: 300, type: 'movement', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'movement-hp-up', amount: 5 },
  },
  float: {
    // Hovers the unit slightly above the ground — water tiles become passable
    // for both pathing and end-of-move standing. Pairs strongly with the
    // Water Pond map: floating mages can cross while everyone else flanks.
    id: 'float', name: 'Float',
    jpCost: 600, type: 'movement', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'movement-float' },
  },

  // ─── Support extensions ───────────────────────────────────────────────────
  jp_up: {
    id: 'jp_up', name: 'JP Up',
    jpCost: 500, type: 'support', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'support-jp-up', factor: 1.5 },
  },
  magic_attack_up: {
    id: 'magic_attack_up', name: 'Magic Attack Up',
    jpCost: 600, type: 'support', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'support-magic-attack-up', factor: 1.25 },
  },
  defense_up: {
    // 25% reduction on every incoming physical hit (melee + ranged + Break).
    // Magic damage is unaffected — Magic Defense Up is a separate slot when
    // it eventually lands.
    id: 'defense_up', name: 'Defense Up',
    jpCost: 500, type: 'support', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'support-defense-up', factor: 0.75 },
  },
  magic_defense_up: {
    // Mirror of Defense Up, but on the magic side: every magic-damage spell
    // (Fire/Bolt/Ice tiers, Pebble Blast, Math Skill, summons) lands for 25%
    // less. Heals and status spells aren't damage, so they're unaffected.
    id: 'magic_defense_up', name: 'Magic Defense Up',
    jpCost: 500, type: 'support', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'support-magic-defense-up', factor: 0.75 },
  },
  jump_plus_1: {
    id: 'jump_plus_1', name: 'Jump +1',
    jpCost: 250, type: 'movement', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'movement-jump-plus', amount: 1 },
  },
  jump_plus_2: {
    id: 'jump_plus_2', name: 'Jump +2',
    jpCost: 500, type: 'movement', range: 0, chargeTime: 0, mpCost: 0,
    effect: { kind: 'movement-jump-plus', amount: 2 },
  },
};

// Job → ability mapping moved to JOB_DEFS[jobId].learnableActives (src/data/jobs.ts).
