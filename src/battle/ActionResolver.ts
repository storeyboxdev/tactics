import { Unit, Facing, FACING_E, FACING_W, FACING_N, FACING_S } from './Unit';
import { BattleMap } from './Map';
import { ABILITIES, Ability, Element } from '../data/abilities';
import { StatusId } from '../data/statuses';
import { JOB_DEFS, Affinity } from '../data/jobs';
import { WEAPONS, WeaponDef } from '../data/weapons';
import { ARMOR, ArmorDef } from '../data/armor';

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
  /** True if the target's Blade Grasp caught the attack (damage negated to 0). */
  bladeGrasp?: boolean;
  /** HP gained when the target absorbs the weapon's element (damage is 0). */
  absorbed?: number;
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
  /** HP gained when the target absorbs the spell's element (damage is 0). */
  absorbed?: number;
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

/** Fallback weapon-power for units whose job has no weapon (e.g. test
 *  fixtures with a synthetic jobId). Real jobs resolve via WEAPONS. */
export const PLACEHOLDER_WEAPON_POWER = 4;
/** Placeholder weapon-accuracy until the equip system lands. */
export const WEAPON_ACCURACY = 95;

/**
 * Weapon-power for a unit's basic Attack — the equipped weapon when one
 * is set, otherwise the job's signature weapon. Falls back to
 * PLACEHOLDER_WEAPON_POWER when the job is unknown or weaponless
 * (synthetic test jobs), keeping legacy basic-attack damage assertions
 * stable. An unknown equipped id falls back rather than throwing.
 */
/** The weapon in effect — the equipped override when one is set and
 *  valid, otherwise the job's signature weapon. `undefined` for an
 *  unknown/weaponless job. */
export function effectiveWeapon(unit: Unit): WeaponDef | undefined {
  if (unit.weaponId && WEAPONS[unit.weaponId]) return WEAPONS[unit.weaponId];
  const sigId = JOB_DEFS[unit.jobId]?.weapon;
  return sigId ? WEAPONS[sigId] : undefined;
}

export function effectiveWeaponPower(unit: Unit): number {
  return effectiveWeapon(unit)?.weaponPower ?? PLACEHOLDER_WEAPON_POWER;
}

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
 * Physical hit % for a specific attacker against a target. Identical to
 * `physicalHitChance` except that an attacker with the Concentrate support
 * always hits (evasion ignored — chance forced to 100).
 */
export function physicalHitChanceFrom(attacker: Unit, target: Unit, facing: RelativeFacing): number {
  if (attacker.support) {
    const ab = ABILITIES[attacker.support];
    if (ab?.effect.kind === 'support-concentrate') return 100;
  }
  return physicalHitChance(target, facing);
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
  if (attacker.hasStatus('frog'))    pa = Math.floor(pa * 0.5);
  return pa;
}

/**
 * An ability's MP cost after the caster's equipped support. Half of MP
 * multiplies it by 0.5 (floored). Used at every cost site — the skill
 * menu's affordability check, the AI's, and the actual deduction on cast.
 */
export function effectiveMpCost(unit: Unit, ability: Ability): number {
  if (unit.support) {
    const ab = ABILITIES[unit.support];
    if (ab?.effect.kind === 'support-half-mp') {
      return Math.floor(ability.mpCost * ab.effect.factor);
    }
  }
  return ability.mpCost;
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

/** The armor in effect — the equipped armor when one is set, otherwise
 *  the job signature. `undefined` for unknown/armorless jobs. */
function effectiveArmor(unit: Unit): ArmorDef | undefined {
  if (unit.armorId && ARMOR[unit.armorId]) return ARMOR[unit.armorId];
  const sigId = JOB_DEFS[unit.jobId]?.armor;
  return sigId ? ARMOR[sigId] : undefined;
}

/** Incoming-physical-damage multiplier from the target's armor.
 *  1.0 for unknown/armorless jobs (synthetic test fixtures). */
export function armorPhysicalFactor(unit: Unit): number {
  return effectiveArmor(unit)?.physicalFactor ?? 1;
}

/** Incoming-magic-damage multiplier from the target's armor. */
export function armorMagicalFactor(unit: Unit): number {
  return effectiveArmor(unit)?.magicalFactor ?? 1;
}

/**
 * Multiplier on incoming physical damage — the target's job armor and the
 * Defense Up support stack multiplicatively. Returns 1.0 when neither
 * applies (e.g. an armorless synthetic-job test unit with no support).
 */
export function effectiveDefenseFactor(target: Unit): number {
  let factor = armorPhysicalFactor(target);
  if (target.support) {
    const ab = ABILITIES[target.support];
    if (ab?.effect.kind === 'support-defense-up') factor *= ab.effect.factor;
  }
  return factor;
}

/**
 * Multiplier on incoming magic damage — job armor and the Magic Defense Up
 * support stack multiplicatively. Heals never use this — they aren't damage.
 */
export function effectiveMagicDefenseFactor(target: Unit): number {
  let factor = armorMagicalFactor(target);
  if (target.support) {
    const ab = ABILITIES[target.support];
    if (ab?.effect.kind === 'support-magic-defense-up') factor *= ab.effect.factor;
  }
  return factor;
}

/**
 * Damage multiplier from the target's elemental affinity. 1.5 when the
 * target is weak to `element`, 1.0 otherwise (and 1.0 for element-less
 * spells). Only monster jobs declare affinities, so this is a no-op for
 * every player unit.
 */
export function elementalDamageMultiplier(target: Unit, element?: Element): number {
  const affinity = affinityOf(target, element);
  if (affinity === 'weak') return 1.5;
  if (affinity === 'half') return 0.5;
  if (affinity === 'absorb') return 0;
  return 1;
}

/** The target's affinity to `element` — an innate creature trait if the
 *  job declares one, otherwise a `half` from resist armor. `undefined`
 *  for an element-less spell or a unit with neither. */
export function affinityOf(target: Unit, element?: Element): Affinity | undefined {
  if (!element) return undefined;
  const innate = JOB_DEFS[target.jobId]?.elementAffinities?.[element];
  if (innate) return innate;
  return effectiveArmor(target)?.resists === element ? 'half' : undefined;
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
  const raw = computeAttackDamage({
    pa: effectivePa(attacker),
    weaponPower: effectiveWeaponPower(attacker),
    attackerH: aH, targetH: tH,
    facing, randomMul: 1.0,
  });
  return {
    damage: Math.max(1, Math.floor(
      raw * effectiveDefenseFactor(target)
      * elementalDamageMultiplier(target, effectiveWeapon(attacker)?.element))),
    facing,
    heightDiff: aH - tH,
    hitChance: physicalHitChanceFrom(attacker, target, facing),
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
  const hit = rollHit(physicalHitChanceFrom(attacker, target, facing), rng);
  const crit = hit && rollCrit(facing, rng);
  const randomMul = 0.85 + rng() * 0.30;

  if (!hit) {
    return { attacker, target, damage: 0, heightDiff: aH - tH, facing, hit: false, crit: false };
  }

  const baseDamage = computeAttackDamage({
    pa: effectivePa(attacker),
    weaponPower: effectiveWeaponPower(attacker),
    attackerH: aH, targetH: tH,
    facing, randomMul,
  });
  const critDamage = crit ? Math.max(1, Math.floor(baseDamage * CRIT_MULTIPLIER)) : baseDamage;
  // Blade Grasp: a Brave% roll fully negates the weapon attack.
  const bladeGrasp = rollBladeGrasp(target, rng);
  const weaponElement = effectiveWeapon(attacker)?.element;

  // Absorb: the weapon's element heals the target instead of hurting it —
  // no damage, no Sleep break, no Counter (it was never a "hit"). Blade
  // Grasp still takes precedence: a caught attack does nothing at all.
  if (!bladeGrasp && affinityOf(target, weaponElement) === 'absorb') {
    const heal = Math.max(1, Math.floor(critDamage * effectiveDefenseFactor(target)));
    const before = target.hp;
    target.hp = Math.min(target.hpMax, target.hp + heal);
    return {
      attacker, target, damage: 0, heightDiff: aH - tH, facing,
      hit: true, crit, absorbed: target.hp - before,
    };
  }

  const damage = bladeGrasp ? 0 : Math.max(1, Math.floor(
    critDamage * effectiveDefenseFactor(target)
    * elementalDamageMultiplier(target, weaponElement)));
  const dmgResult = target.applyDamage(damage);

  const out: AttackOutcome = {
    attacker, target, damage, heightDiff: aH - tH, facing, hit: true, crit,
    reraised: dmgResult.reraised, bladeGrasp,
  };

  // Damage breaks Sleep — same as FFT.
  if (damage > 0 && target.hasStatus('sleep')) target.removeStatus('sleep');

  // A caught attack provokes no Counter — the target wasn't hit.
  if (allowCounter && !bladeGrasp && target.isAlive && target.reaction) {
    triggerReaction(target, attacker, target.reaction, out, map, rng);
  }

  return out;
}

/**
 * Blade Grasp reaction roll — true if the target has the reaction equipped
 * and a Brave% roll lands. Only consumes an rng value when the reaction is
 * actually present, so it doesn't perturb the dice for everyone else.
 */
function rollBladeGrasp(target: Unit, rng: Rng): boolean {
  if (!target.reaction) return false;
  const ab = ABILITIES[target.reaction];
  if (ab?.effect.kind !== 'reaction-blade-grasp') return false;
  return rng() * 100 < target.bravery;
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

export function predictSpellDamage(
  caster: Unit, target: Unit, spellPower: number, element?: Element,
): SpellPrediction {
  const raw = computeSpellDamage({
    ma: effectiveMa(caster),
    spellPower,
    casterFaith: caster.faith,
    targetFaith: target.faith,
    randomMul: 1.0,
  });
  return {
    damage: Math.max(1, Math.floor(
      raw * effectiveMagicDefenseFactor(target) * elementalDamageMultiplier(target, element))),
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
  element?: Element,
): SpellOutcome {
  const raw = computeSpellDamage({
    ma: effectiveMa(caster),
    spellPower,
    casterFaith: caster.faith,
    targetFaith: target.faith,
    randomMul: 0.85 + rng() * 0.30,
  });
  // Absorb flips the spell into healing — the target is never "hit", so no
  // damage, no Sleep break, no Auto-Potion.
  if (affinityOf(target, element) === 'absorb') {
    const heal = Math.max(1, Math.floor(raw * effectiveMagicDefenseFactor(target)));
    const before = target.hp;
    target.hp = Math.min(target.hpMax, target.hp + heal);
    return { caster, target, damage: 0, hit: true, reraised: false, absorbed: target.hp - before };
  }
  const damage = Math.max(1, Math.floor(
    raw * effectiveMagicDefenseFactor(target) * elementalDamageMultiplier(target, element)));
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
  /** HP gained when the target absorbs the spell's element (damage is 0). */
  absorbed?: number;
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
  element?: Element,
): DamageStatusOutcome {
  // Damage path — identical to resolveSpell.
  const raw = computeSpellDamage({
    ma: effectiveMa(caster),
    spellPower,
    casterFaith: caster.faith,
    targetFaith: target.faith,
    randomMul: 0.85 + rng() * 0.30,
  });
  // Absorb flips the damage component into healing; the status still rolls.
  const absorbing = affinityOf(target, element) === 'absorb';
  let damage = 0;
  let absorbed = 0;
  let reraised = false;
  if (absorbing) {
    const heal = Math.max(1, Math.floor(raw * effectiveMagicDefenseFactor(target)));
    const before = target.hp;
    target.hp = Math.min(target.hpMax, target.hp + heal);
    absorbed = target.hp - before;
  } else {
    damage = Math.max(1, Math.floor(
      raw * effectiveMagicDefenseFactor(target) * elementalDamageMultiplier(target, element)));
    const dmgResult = target.applyDamage(damage);
    if (damage > 0 && target.hasStatus('sleep')) target.removeStatus('sleep');
    reraised = dmgResult.reraised;
  }

  const out: DamageStatusOutcome = { caster, target, damage, statusApplied: false, reraised, absorbed };

  // Auto-Potion reaction (mirrors resolveSpell) — only on an actual hit.
  if (damage > 0 && target.isAlive && target.reaction) {
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

// ─── Death triggers (Bomb's Self-Destruct) ──────────────────────────────────

export interface DeathTriggerOutcome {
  source: Unit;
  victims: { unit: Unit; dealt: number; reraised: boolean }[];
}

/**
 * Resolve one unit's death trigger: flat `damage` to every alive unit
 * (both teams, excluding the source) within Manhattan `radius` of the
 * source's tile. Sets the source's `deathTriggerFired` guard so it can't
 * fire twice. Damage routes through `applyDamage`, so Reraise and KO
 * sequencing compose normally.
 */
export function resolveDeathTrigger(
  source: Unit, radius: number, damage: number, units: readonly Unit[],
): DeathTriggerOutcome {
  source.deathTriggerFired = true;
  const victims: DeathTriggerOutcome['victims'] = [];
  for (const v of units) {
    if (!v.isAlive || v === source) continue;
    if (Math.abs(v.x - source.x) + Math.abs(v.z - source.z) > radius) continue;
    const res = v.applyDamage(damage);
    victims.push({ unit: v, dealt: res.dealt, reraised: res.reraised });
  }
  return { source, victims };
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
  /** True if the target's Blade Grasp caught the attack (damage negated to 0). */
  bladeGrasp?: boolean;
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
  const raw = computeAttackDamage({
    pa: effectivePa(attacker), weaponPower,
    attackerH: aH, targetH: tH,
    facing, randomMul: 1.0,
  });
  return {
    damage: Math.max(1, Math.floor(raw * effectiveDefenseFactor(target))),
    facing,
    heightDiff: aH - tH,
    hitChance: physicalHitChanceFrom(attacker, target, facing),
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

  const hit = rollHit(physicalHitChanceFrom(attacker, target, facing), rng);
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
  // Blade Grasp catches ranged weapon attacks (Throw, sword skills) too.
  const bladeGrasp = rollBladeGrasp(target, rng);
  const damage = bladeGrasp ? 0 : Math.max(1, Math.floor(critDamage * effectiveDefenseFactor(target)));
  const dmgResult = target.applyDamage(damage);
  if (damage > 0 && target.hasStatus('sleep')) target.removeStatus('sleep');

  // Drain: convert a percentage of the damage dealt into healing on the
  // attacker, capped at their hpMax. Misses (and caught attacks) drain nothing.
  let drained = 0;
  if (drainPercent > 0 && damage > 0) {
    const desired = Math.max(1, Math.floor(damage * drainPercent / 100));
    const before = attacker.hp;
    attacker.hp = Math.min(attacker.hpMax, attacker.hp + desired);
    drained = attacker.hp - before;
  }

  return {
    attacker, target, damage, heightDiff: aH - tH, facing,
    hit: true, crit, drained, reraised: dmgResult.reraised, bladeGrasp,
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
  bladeGrasp?: boolean;
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
  // A caught attack (Blade Grasp) lands no status — the hit never connected.
  if (r.hit && !r.bladeGrasp && target.isAlive) {
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
    bladeGrasp: r.bladeGrasp,
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
  /** True if the target was Undead — `amount` was dealt as damage, not healed. */
  undead?: boolean;
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
  // Undead: the light burns. Healing flips to damage.
  if (target.hasStatus('undead')) {
    const { dealt } = target.applyDamage(amount);
    return { caster, target, amount: dealt, undead: true };
  }
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
  /** True if the target was Undead — the HP component was dealt as damage. */
  undead?: boolean;
}

/**
 * Item-style restore: heals a fixed HP and/or MP amount, capped at the
 * target's max. Ignores caster stats — the item does the healing, not
 * the user. No RNG, no hit roll. Either field can be omitted; a
 * Hi-Potion is hp-only, an Ether is mp-only.
 *
 * Undead flips the HP component to damage (the MP component is unaffected —
 * the curse is on flesh, not mana).
 */
export function resolveFlatHeal(
  user: Unit, target: Unit, hp?: number, mp?: number,
): FlatHealOutcome {
  let hpRestored = 0;
  let mpRestored = 0;
  let undead = false;
  if (hp && hp > 0) {
    if (target.hasStatus('undead')) {
      const { dealt } = target.applyDamage(hp);
      hpRestored = -dealt;
      undead = true;
    } else if (target.hp < target.hpMax) {
      const before = target.hp;
      target.hp = Math.min(target.hpMax, target.hp + hp);
      hpRestored = target.hp - before;
    }
  }
  if (mp && mp > 0 && target.mp < target.mpMax) {
    const before = target.mp;
    target.mp = Math.min(target.mpMax, target.mp + mp);
    mpRestored = target.mp - before;
  }
  return { user, target, hpRestored, mpRestored, undead };
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
  if (!rollHit(physicalHitChanceFrom(user, target, facing), rng)) {
    return { user, target, stat, amount: 0, hit: false };
  }
  const before = target[stat];
  target[stat] = Math.max(1, target[stat] - amount);
  return { user, target, stat, amount: before - target[stat], hit: true };
}
