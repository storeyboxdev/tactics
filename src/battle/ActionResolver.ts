import { Unit, Facing, FACING_E, FACING_W, FACING_N, FACING_S } from './Unit';
import { BattleMap } from './Map';
import { ABILITIES } from '../data/abilities';
import { StatusId } from '../data/statuses';

export type RelativeFacing = 'front' | 'side' | 'back';

export interface AttackOutcome {
  attacker: Unit;
  target: Unit;
  damage: number;
  heightDiff: number;
  facing: RelativeFacing;
  hit: boolean;
  crit: boolean;
  counter?: CounterOutcome;
  autoPotion?: AutoPotionOutcome;
  /** True if the target's Reraise fired to interrupt a would-KO. */
  reraised?: boolean;
}

export interface CounterOutcome {
  counterer: Unit;
  victim: Unit;
  damage: number;
  facing: RelativeFacing;
  heightDiff: number;
  crit: boolean;
  /** True if the victim's Reraise fired on the counter hit. */
  reraised?: boolean;
}

export interface AutoPotionOutcome {
  user: Unit;
  amount: number;
}

export interface SpellOutcome {
  caster: Unit;
  target: Unit;
  damage: number;
  hit: boolean;
  autoPotion?: AutoPotionOutcome;
  /** True if the target's Reraise fired to interrupt a would-KO. */
  reraised?: boolean;
}

export interface PotionOutcome {
  user: Unit;
  target: Unit;
  amount: number;
}

export type Rng = () => number;

const FACING_DX: Record<number, number> = { 0:  0, 1: 1, 2: 0, 3: -1 };
const FACING_DZ: Record<number, number> = { 0: -1, 1: 0, 2: 1, 3:  0 };

const FACING_DAMAGE_MOD: Record<RelativeFacing, number> = {
  front: 1.00,
  side:  1.10,
  back:  1.25,
};

/** Per-facing bonus (percentage points) to physical-hit chance. */
const FACING_HIT_BONUS: Record<RelativeFacing, number> = {
  front: 0,
  side:  10,
  back:  20,
};

export const PLACEHOLDER_WEAPON_POWER = 4;
/** Placeholder weapon-accuracy until the equip system lands. */
export const WEAPON_ACCURACY = 95;

/**
 * Per-facing crit chance for physical hits. Mirrors the FFT-style "back
 * attack is dangerous" pattern already in `FACING_DAMAGE_MOD`. Magic does
 * not crit (canon: spells only "land" or don't, no random burst above).
 */
export const CRIT_CHANCE_BY_FACING: Record<RelativeFacing, number> = {
  front:  5,
  side:  10,
  back:  15,
};
export const CRIT_MULTIPLIER = 1.5;

const POTION_HEAL = 30;

// ─── Hit-chance helpers ─────────────────────────────────────────────────────

/**
 * Physical hit % = WEAPON_ACCURACY - target.evasion + facingBonus, clamped to
 * [0, 100]. Used for melee Attack, ranged abilities, and Breaks.
 */
export function physicalHitChance(target: Unit, facing: RelativeFacing): number {
  const raw = WEAPON_ACCURACY - target.evasion + FACING_HIT_BONUS[facing];
  return Math.max(0, Math.min(100, raw));
}

/**
 * Magic-status hit % = baseAccuracy × casterFaith/100 × targetFaith/100,
 * clamped to [0, 100]. Mirrors FFT's faith-scaled formula for inflict-status.
 */
export function magicStatusHitChance(caster: Unit, target: Unit, baseAccuracy: number): number {
  const raw = baseAccuracy * (caster.faith / 100) * (target.faith / 100);
  return Math.max(0, Math.min(100, Math.floor(raw)));
}

/**
 * Attacker's PA after status modifiers. Berserk multiplies it by 1.5 (FFT
 * canon — pure physical rage, no magic boost). Used by every basic-attack
 * formula (melee + ranged) so the prediction and resolution stay in sync.
 */
export function effectivePa(attacker: Unit): number {
  let pa = attacker.pa;
  if (attacker.hasStatus('berserk')) pa = Math.floor(pa * 1.5);
  return pa;
}

/**
 * Caster's MA after equipped supports. Magic Attack Up multiplies it (1.25
 * by default). Used by every magic-damage / magic-heal predictor and
 * resolver so the effective damage matches what the planner saw.
 */
export function effectiveMa(caster: Unit): number {
  if (!caster.support) return caster.ma;
  const ab = ABILITIES[caster.support];
  if (ab?.effect.kind === 'support-magic-attack-up') {
    return Math.floor(caster.ma * ab.effect.factor);
  }
  return caster.ma;
}

/**
 * Multiplier on incoming physical damage from the target's equipped support
 * (Defense Up = 0.75). Returns 1.0 when no defensive support is equipped.
 */
export function effectiveDefenseFactor(target: Unit): number {
  if (!target.support) return 1;
  const ab = ABILITIES[target.support];
  if (ab?.effect.kind === 'support-defense-up') return ab.effect.factor;
  return 1;
}

/**
 * Multiplier on incoming magic damage from the target's equipped support
 * (Magic Defense Up = 0.75). Returns 1.0 otherwise. Heals never use this —
 * they aren't damage.
 */
export function effectiveMagicDefenseFactor(target: Unit): number {
  if (!target.support) return 1;
  const ab = ABILITIES[target.support];
  if (ab?.effect.kind === 'support-magic-defense-up') return ab.effect.factor;
  return 1;
}

/** rolls a hit at `chance` (0..100) — `chance=0` always misses, `chance=100` always lands. */
export function rollHit(chance: number, rng: Rng): boolean {
  if (chance >= 100) return true;
  if (chance <= 0)   return false;
  return rng() * 100 < chance;
}

/** Rolls a crit using the per-facing chance table. Same short-circuit shape as rollHit. */
export function rollCrit(facing: RelativeFacing, rng: Rng): boolean {
  const chance = CRIT_CHANCE_BY_FACING[facing];
  if (chance >= 100) return true;
  if (chance <= 0)   return false;
  return rng() * 100 < chance;
}

// ─── Facing helpers ─────────────────────────────────────────────────────────

export function relativeFacingFromPos(
  attackerPos: { x: number; z: number },
  target: Unit,
): RelativeFacing {
  const dx = attackerPos.x - target.x;
  const dz = attackerPos.z - target.z;
  const fx = FACING_DX[target.facing];
  const fz = FACING_DZ[target.facing];
  const dot = dx * fx + dz * fz;
  if (dot > 0) return 'front';
  if (dot < 0) return 'back';
  return 'side';
}

export function relativeFacing(attacker: Unit, target: Unit): RelativeFacing {
  return relativeFacingFromPos({ x: attacker.x, z: attacker.z }, target);
}

export function facingTowards(fx: number, fz: number, tx: number, tz: number): Facing {
  const dx = tx - fx;
  const dz = tz - fz;
  if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? FACING_E : FACING_W;
  return dz >= 0 ? FACING_S : FACING_N;
}

// ─── Physical attack ────────────────────────────────────────────────────────

interface PhysicalDamageInputs {
  pa: number;
  weaponPower: number;
  attackerH: number;
  targetH: number;
  facing: RelativeFacing;
  randomMul: number;
}

export function computeAttackDamage(p: PhysicalDamageInputs): number {
  const heightMod = Math.max(0.5, 1 + 0.1 * (p.attackerH - p.targetH));
  const facingMod = FACING_DAMAGE_MOD[p.facing];
  const raw = p.pa * p.weaponPower * facingMod * heightMod * p.randomMul;
  return Math.max(1, Math.floor(raw));
}

export interface AttackPrediction {
  damage: number;
  facing: RelativeFacing;
  heightDiff: number;
  hitChance: number;
  critChance: number;
}

export function predictAttackDamage(
  attacker: Unit,
  target: Unit,
  map: BattleMap,
  attackerPos: { x: number; z: number } = { x: attacker.x, z: attacker.z },
): AttackPrediction {
  const aH = map.getTile(attackerPos.x, attackerPos.z).h;
  const tH = map.getTile(target.x, target.z).h;
  const facing = relativeFacingFromPos(attackerPos, target);
  return {
    damage: computeAttackDamage({
      pa: effectivePa(attacker),
      weaponPower: PLACEHOLDER_WEAPON_POWER,
      attackerH: aH, targetH: tH,
      facing, randomMul: 1.0,
    }),
    facing,
    heightDiff: aH - tH,
    hitChance: physicalHitChance(target, facing),
    critChance: CRIT_CHANCE_BY_FACING[facing],
  };
}

/**
 * Resolve a basic melee attack and apply damage. If `allowCounter` is true and
 * the target survives in melee range, roll Bravery%/100 for a Counter — a free
 * basic-attack back at the attacker. Counters never chain (the counter call
 * passes allowCounter=false).
 */
export function resolveAttack(
  attacker: Unit,
  target: Unit,
  map: BattleMap,
  rng: Rng = Math.random,
  allowCounter = true,
): AttackOutcome {
  const aH = map.getTile(attacker.x, attacker.z).h;
  const tH = map.getTile(target.x, target.z).h;
  const facing = relativeFacing(attacker, target);

  // Roll hit, crit, and damage-randomness. The deterministic test rngs
  // (`() => 0.5`) all return the same value, so all three rolls produce the
  // same outcome they did before crits were a thing — hit at 50<chance,
  // crit at 50<5..15 = false, randomMul = 1.0. Existing damage assertions
  // stay valid.
  const hit = rollHit(physicalHitChance(target, facing), rng);
  const crit = hit && rollCrit(facing, rng);
  const randomMul = 0.85 + rng() * 0.30;

  if (!hit) {
    return { attacker, target, damage: 0, heightDiff: aH - tH, facing, hit: false, crit: false };
  }

  const baseDamage = computeAttackDamage({
    pa: effectivePa(attacker),
    weaponPower: PLACEHOLDER_WEAPON_POWER,
    attackerH: aH, targetH: tH,
    facing, randomMul,
  });
  const critDamage = crit ? Math.max(1, Math.floor(baseDamage * CRIT_MULTIPLIER)) : baseDamage;
  const damage = Math.max(1, Math.floor(critDamage * effectiveDefenseFactor(target)));
  const dmgResult = target.applyDamage(damage);

  const out: AttackOutcome = {
    attacker, target, damage, heightDiff: aH - tH, facing, hit: true, crit,
    reraised: dmgResult.reraised,
  };

  // Damage breaks Sleep — same as FFT.
  if (damage > 0 && target.hasStatus('sleep')) target.removeStatus('sleep');

  if (allowCounter && target.isAlive && target.reaction) {
    triggerReaction(target, attacker, target.reaction, out, map, rng);
  }

  return out;
}

/** Dispatches a target's equipped reaction. Mutates `out` to record any reaction outcome. */
function triggerReaction(
  target: Unit, attacker: Unit, reactionId: string,
  out: AttackOutcome, map: BattleMap, rng: Rng,
): void {
  const ab = ABILITIES[reactionId];
  if (!ab) return;
  const eff = ab.effect;
  if (eff.kind === 'reaction-counter') {
    // Counter requires melee adjacency and a bravery roll, doesn't chain.
    if (!isMeleeAdjacent(attacker, target)) return;
    if (rng() >= target.bravery / 100) return;
    target.facing = facingTowards(target.x, target.z, attacker.x, attacker.z);
    const counter = resolveAttack(target, attacker, map, rng, false);
    out.counter = {
      counterer: target, victim: attacker,
      damage: counter.damage, facing: counter.facing, heightDiff: counter.heightDiff,
      crit: counter.crit, reraised: counter.reraised,
    };
  } else if (eff.kind === 'reaction-auto-potion') {
    // Auto-Potion fires reliably (no bravery roll); heals up to hpMax.
    const before = target.hp;
    target.hp = Math.min(target.hpMax, target.hp + eff.amount);
    out.autoPotion = { user: target, amount: target.hp - before };
  }
}

function isMeleeAdjacent(a: Unit, b: Unit): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z) === 1;
}

// ─── Spell (magical) ────────────────────────────────────────────────────────

interface SpellDamageInputs {
  ma: number;
  spellPower: number;
  casterFaith: number;
  targetFaith: number;
  randomMul: number;
}

export function computeSpellDamage(p: SpellDamageInputs): number {
  // FFT magic formula: MA × SpellPower × (Faith_caster/100) × (Faith_target/100) × randomness
  const raw = p.ma * p.spellPower * (p.casterFaith / 100) * (p.targetFaith / 100) * p.randomMul;
  return Math.max(1, Math.floor(raw));
}

export interface SpellPrediction { damage: number; hitChance: number; }

export function predictSpellDamage(caster: Unit, target: Unit, spellPower: number): SpellPrediction {
  const raw = computeSpellDamage({
    ma: effectiveMa(caster),
    spellPower,
    casterFaith: caster.faith,
    targetFaith: target.faith,
    randomMul: 1.0,
  });
  return {
    damage: Math.max(1, Math.floor(raw * effectiveMagicDefenseFactor(target))),
    // Damage spells are 100% — Faith already gates the damage value, a second
    // faith-roll on top would be doubly punitive on low-faith casters.
    hitChance: 100,
  };
}

export function resolveSpell(
  caster: Unit,
  target: Unit,
  spellPower: number,
  rng: Rng = Math.random,
): SpellOutcome {
  const raw = computeSpellDamage({
    ma: effectiveMa(caster),
    spellPower,
    casterFaith: caster.faith,
    targetFaith: target.faith,
    randomMul: 0.85 + rng() * 0.30,
  });
  const damage = Math.max(1, Math.floor(raw * effectiveMagicDefenseFactor(target)));
  const dmgResult = target.applyDamage(damage);
  if (damage > 0 && target.hasStatus('sleep')) target.removeStatus('sleep');

  const out: SpellOutcome = { caster, target, damage, hit: true, reraised: dmgResult.reraised };
  // Auto-Potion is the only reaction that fires on magic damage in our MVP set
  // (Counter is melee-only).
  if (target.isAlive && target.reaction) {
    const ab = ABILITIES[target.reaction];
    if (ab && ab.effect.kind === 'reaction-auto-potion') {
      const before = target.hp;
      target.hp = Math.min(target.hpMax, target.hp + ab.effect.amount);
      out.autoPotion = { user: target, amount: target.hp - before };
    }
  }
  return out;
}

// ─── Damage + status (Geomancy strikes) ─────────────────────────────────────

export interface DamageStatusOutcome {
  caster: Unit;
  target: Unit;
  damage: number;
  /** True if the status roll landed AND target survived the damage hit. */
  statusApplied: boolean;
  /** Auto-Potion reaction outcome (same as resolveSpell). */
  autoPotion?: { user: Unit; amount: number };
  /** True if the target's Reraise fired to interrupt a would-KO. */
  reraised?: boolean;
}

/**
 * Magic damage with a separate faith-scaled status roll on the same target.
 * Two independent RNG draws: damage uses the standard 0.85–1.15 multiplier;
 * status uses `magicStatusHitChance(caster, target, statusBaseAcc)`. If the
 * damage KOs the target, the status roll is skipped — you can't paralyze a
 * corpse. Auto-Potion fires on the damage component, identical to
 * `resolveSpell`.
 */
export function resolveDamageAndStatus(
  caster: Unit,
  target: Unit,
  spellPower: number,
  statusId: StatusId,
  statusBaseAcc: number,
  rng: Rng = Math.random,
): DamageStatusOutcome {
  // Damage path — identical to resolveSpell.
  const raw = computeSpellDamage({
    ma: effectiveMa(caster),
    spellPower,
    casterFaith: caster.faith,
    targetFaith: target.faith,
    randomMul: 0.85 + rng() * 0.30,
  });
  const damage = Math.max(1, Math.floor(raw * effectiveMagicDefenseFactor(target)));
  const dmgResult = target.applyDamage(damage);
  if (damage > 0 && target.hasStatus('sleep')) target.removeStatus('sleep');

  const out: DamageStatusOutcome = { caster, target, damage, statusApplied: false, reraised: dmgResult.reraised };

  // Auto-Potion reaction (mirrors resolveSpell).
  if (target.isAlive && target.reaction) {
    const ab = ABILITIES[target.reaction];
    if (ab && ab.effect.kind === 'reaction-auto-potion') {
      const before = target.hp;
      target.hp = Math.min(target.hpMax, target.hp + ab.effect.amount);
      out.autoPotion = { user: target, amount: target.hp - before };
    }
  }

  // Status path — skipped if damage KO'd the target.
  if (target.isAlive) {
    const chance = magicStatusHitChance(caster, target, statusBaseAcc);
    if (rollHit(chance, rng)) {
      target.addStatus(statusId);
      out.statusApplied = true;
    }
  }
  return out;
}

// ─── Cure-status (Esuna, Remedy) ────────────────────────────────────────────

export interface CureStatusOutcome {
  caster: Unit;
  target: Unit;
  hit: boolean;
  /** Statuses actually removed (intersection of requested set and target's active statuses). */
  removed: StatusId[];
}

export function resolveCureStatus(
  caster: Unit,
  target: Unit,
  statuses: readonly StatusId[],
  baseAccuracy: number,
  rng: Rng = Math.random,
): CureStatusOutcome {
  const chance = magicStatusHitChance(caster, target, baseAccuracy);
  const hit = rollHit(chance, rng);
  if (!hit) return { caster, target, hit: false, removed: [] };
  const removed: StatusId[] = [];
  for (const id of statuses) {
    if (target.removeStatus(id)) removed.push(id);
  }
  return { caster, target, hit: true, removed };
}

// ─── Ranged physical (Charge, Wave Fist, Throw) ─────────────────────────────

export interface RangedAttackOutcome {
  attacker: Unit;
  target: Unit;
  damage: number;
  heightDiff: number;
  facing: RelativeFacing;
  hit: boolean;
  crit: boolean;
  /** HP healed onto the attacker (Mug-style drain). 0 when no drain. */
  drained: number;
  /** True if the target's Reraise fired to interrupt a would-KO. */
  reraised?: boolean;
}

export interface RangedAttackPrediction {
  damage: number;
  facing: RelativeFacing;
  heightDiff: number;
  hitChance: number;
  critChance: number;
}

export function predictRangedAttack(
  attacker: Unit, target: Unit, weaponPower: number, map: BattleMap,
): RangedAttackPrediction {
  const aH = map.getTile(attacker.x, attacker.z).h;
  const tH = map.getTile(target.x, target.z).h;
  const facing = relativeFacing(attacker, target);
  return {
    damage: computeAttackDamage({
      pa: effectivePa(attacker), weaponPower,
      attackerH: aH, targetH: tH,
      facing, randomMul: 1.0,
    }),
    facing,
    heightDiff: aH - tH,
    hitChance: physicalHitChance(target, facing),
    critChance: CRIT_CHANCE_BY_FACING[facing],
  };
}

/**
 * A ranged physical attack — same `pa × weaponPower × facing × height`
 * formula as melee, but: (a) no melee-adjacency check, (b) does not trigger
 * Counter (FFT canon: only basic melee Fight provokes Counter). Auto-Potion
 * still fires on hit.
 */
export function resolveRangedAttack(
  attacker: Unit, target: Unit, weaponPower: number, map: BattleMap,
  rng: Rng = Math.random,
  drainPercent: number = 0,
): RangedAttackOutcome {
  const aH = map.getTile(attacker.x, attacker.z).h;
  const tH = map.getTile(target.x, target.z).h;
  const facing = relativeFacing(attacker, target);

  const hit = rollHit(physicalHitChance(target, facing), rng);
  const crit = hit && rollCrit(facing, rng);
  const randomMul = 0.85 + rng() * 0.30;

  if (!hit) {
    return {
      attacker, target, damage: 0, heightDiff: aH - tH,
      facing, hit: false, crit: false, drained: 0,
    };
  }

  const baseDamage = computeAttackDamage({
    pa: effectivePa(attacker), weaponPower,
    attackerH: aH, targetH: tH,
    facing, randomMul,
  });
  const critDamage = crit ? Math.max(1, Math.floor(baseDamage * CRIT_MULTIPLIER)) : baseDamage;
  const damage = Math.max(1, Math.floor(critDamage * effectiveDefenseFactor(target)));
  const dmgResult = target.applyDamage(damage);
  if (damage > 0 && target.hasStatus('sleep')) target.removeStatus('sleep');

  // Drain: convert a percentage of the damage dealt into healing on the
  // attacker, capped at their hpMax. Misses drain nothing.
  let drained = 0;
  if (drainPercent > 0) {
    const desired = Math.max(1, Math.floor(damage * drainPercent / 100));
    const before = attacker.hp;
    attacker.hp = Math.min(attacker.hpMax, attacker.hp + desired);
    drained = attacker.hp - before;
  }

  return {
    attacker, target, damage, heightDiff: aH - tH, facing,
    hit: true, crit, drained, reraised: dmgResult.reraised,
  };
}

// ─── Physical damage + status (Knight Sword Skills) ─────────────────────────

export interface PhysicalDamageStatusOutcome {
  attacker: Unit;
  target: Unit;
  damage: number;
  facing: RelativeFacing;
  heightDiff: number;
  hit: boolean;
  crit: boolean;
  statusApplied: boolean;
  reraised?: boolean;
}

export interface PhysicalDamageStatusPrediction {
  damage: number;
  facing: RelativeFacing;
  heightDiff: number;
  hitChance: number;
  critChance: number;
  statusHit: number;
}

/**
 * Holy-Knight sword skill: ranged physical damage plus an independent
 * faith-scaled status roll. Composes on top of `resolveRangedAttack` so
 * the damage math stays single-sourced. The status rolls only when the
 * physical hit lands and the target survives it.
 */
export function resolvePhysicalDamageAndStatus(
  attacker: Unit, target: Unit,
  weaponPower: number, statusId: StatusId, statusBaseAcc: number,
  map: BattleMap, rng: Rng = Math.random,
): PhysicalDamageStatusOutcome {
  const r = resolveRangedAttack(attacker, target, weaponPower, map, rng, 0);
  let statusApplied = false;
  if (r.hit && target.isAlive) {
    const chance = magicStatusHitChance(attacker, target, statusBaseAcc);
    if (rollHit(chance, rng)) {
      target.addStatus(statusId);
      statusApplied = true;
    }
  }
  return {
    attacker, target,
    damage: r.damage, facing: r.facing, heightDiff: r.heightDiff,
    hit: r.hit, crit: r.crit, statusApplied, reraised: r.reraised,
  };
}

export function predictPhysicalDamageAndStatus(
  attacker: Unit, target: Unit,
  weaponPower: number, statusBaseAcc: number, map: BattleMap,
): PhysicalDamageStatusPrediction {
  const pred = predictRangedAttack(attacker, target, weaponPower, map);
  const statusHit = magicStatusHitChance(attacker, target, statusBaseAcc);
  return { ...pred, statusHit };
}

// ─── Magic heal (Cure, Cura, Chakra) ────────────────────────────────────────

export interface HealOutcome {
  caster: Unit;
  target: Unit;
  amount: number;
}

/**
 * Faith-scaled healing. Uses the same FFT formula as `computeSpellDamage`
 * but applies the result as HP gained, capped at the target's hpMax. Sleep
 * is NOT broken by healing — only damage breaks Sleep.
 */
export function computeHealAmount(p: SpellDamageInputs): number {
  const raw = p.ma * p.spellPower * (p.casterFaith / 100) * (p.targetFaith / 100) * p.randomMul;
  return Math.max(1, Math.floor(raw));
}

export function predictHeal(caster: Unit, target: Unit, spellPower: number): { amount: number; hitChance: number } {
  return {
    amount: computeHealAmount({
      ma: effectiveMa(caster), spellPower,
      casterFaith: caster.faith, targetFaith: target.faith,
      randomMul: 1.0,
    }),
    hitChance: 100,
  };
}

export function resolveHeal(
  caster: Unit, target: Unit, spellPower: number, rng: Rng = Math.random,
): HealOutcome {
  const amount = computeHealAmount({
    ma: effectiveMa(caster), spellPower,
    casterFaith: caster.faith, targetFaith: target.faith,
    randomMul: 0.85 + rng() * 0.30,
  });
  const before = target.hp;
  target.hp = Math.min(target.hpMax, target.hp + amount);
  return { caster, target, amount: target.hp - before };
}

// ─── Flat heal (Hi-Potion, Ether) ───────────────────────────────────────────

export interface FlatHealOutcome {
  user: Unit;
  target: Unit;
  hpRestored: number;
  mpRestored: number;
}

/**
 * Item-style restore: heals a fixed HP and/or MP amount, capped at the
 * target's max. Ignores caster stats — the item does the healing, not
 * the user. No RNG, no hit roll. Either field can be omitted; a
 * Hi-Potion is hp-only, an Ether is mp-only.
 */
export function resolveFlatHeal(
  user: Unit, target: Unit, hp?: number, mp?: number,
): FlatHealOutcome {
  let hpRestored = 0;
  let mpRestored = 0;
  if (hp && hp > 0 && target.hp < target.hpMax) {
    const before = target.hp;
    target.hp = Math.min(target.hpMax, target.hp + hp);
    hpRestored = target.hp - before;
  }
  if (mp && mp > 0 && target.mp < target.mpMax) {
    const before = target.mp;
    target.mp = Math.min(target.mpMax, target.mp + mp);
    mpRestored = target.mp - before;
  }
  return { user, target, hpRestored, mpRestored };
}

// ─── Revive (Raise / Phoenix Down) ──────────────────────────────────────────

export interface ReviveOutcome {
  caster: Unit;
  target: Unit;
  amount: number;   // hp restored
}

/**
 * Bring a KO'd ally back at `hpPercent` of their hpMax. Calling this on a
 * unit that's still alive is treated as a no-op (caller should have filtered
 * targets via the revive-aware targeting path). All statuses cleared on
 * revive — FFT canon: a fresh unit, not a damaged one.
 */
export function resolveRevive(caster: Unit, target: Unit, hpPercent: number): ReviveOutcome {
  if (target.isAlive || target.crystallized) return { caster, target, amount: 0 };
  const heal = Math.max(1, Math.floor(target.hpMax * hpPercent / 100));
  target.hp = heal;
  target.statuses = [];   // clear any KO-time status leftovers
  target.koTimer = -1;    // back among the living, countdown reset
  target.ct = 0;          // FFT canon: revived units enter at 0 CT
  return { caster, target, amount: heal };
}

// ─── Stat shifts (Mediator's Talk Skill) ────────────────────────────────────

export type ShiftableStat = 'faith' | 'bravery' | 'pa' | 'ma' | 'speed';

export interface StatShiftOutcome {
  user: Unit;
  target: Unit;
  stat: ShiftableStat;
  before: number;
  after: number;
}

/**
 * Shift one of the target's stats by `amount`, clamped to [1, 100].
 *
 * Persistence: faith/bravery default to persistent (FFT personality stats sync
 * to UnitProgression so they survive across battles). pa/ma/speed default to
 * per-battle only (FFT canon: Squire's Accumulate raises PA until battle end).
 * Pass `persistent` explicitly to override.
 */
export function applyStatShift(
  user: Unit, target: Unit, stat: ShiftableStat, amount: number,
  persistent?: boolean,
): StatShiftOutcome {
  const before = target[stat];
  const after = Math.max(1, Math.min(100, before + amount));
  target[stat] = after;
  const shouldPersist = persistent ?? (stat === 'faith' || stat === 'bravery');
  if (shouldPersist && target.progression && (stat === 'faith' || stat === 'bravery')) {
    target.progression[stat] = after;
  }
  return { user, target, stat, before, after };
}

// ─── Other ──────────────────────────────────────────────────────────────────

export function resolvePotion(user: Unit, target: Unit): PotionOutcome {
  const before = target.hp;
  target.hp = Math.min(target.hpMax, target.hp + POTION_HEAL);
  return { user, target, amount: target.hp - before };
}

export interface BreakOutcome {
  user: Unit;
  target: Unit;
  stat: 'pa' | 'speed' | 'ma';
  amount: number;       // actual reduction applied (0 on miss)
  hit: boolean;
}

/**
 * Permanent (battle-duration) reduction of a single combat stat. Rolls a
 * physical-hit chance off the target's facing toward `user`; on miss, no
 * reduction is applied.
 */
export function applyBreak(
  user: Unit, target: Unit, stat: 'pa' | 'speed' | 'ma', amount: number,
  rng: Rng = Math.random,
): BreakOutcome {
  const facing = relativeFacing(user, target);
  if (!rollHit(physicalHitChance(target, facing), rng)) {
    return { user, target, stat, amount: 0, hit: false };
  }
  const before = target[stat];
  target[stat] = Math.max(1, target[stat] - amount);
  return { user, target, stat, amount: before - target[stat], hit: true };
}
