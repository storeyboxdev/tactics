import { Unit, Facing, FACING_E, FACING_W, FACING_N, FACING_S } from './Unit';
import { BattleMap } from './Map';
import { ABILITIES } from '../data/abilities';

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
}

export interface CounterOutcome {
  counterer: Unit;
  victim: Unit;
  damage: number;
  facing: RelativeFacing;
  heightDiff: number;
  crit: boolean;
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
      pa: attacker.pa,
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
    pa: attacker.pa,
    weaponPower: PLACEHOLDER_WEAPON_POWER,
    attackerH: aH, targetH: tH,
    facing, randomMul,
  });
  const damage = crit ? Math.max(1, Math.floor(baseDamage * CRIT_MULTIPLIER)) : baseDamage;
  target.applyDamage(damage);

  const out: AttackOutcome = { attacker, target, damage, heightDiff: aH - tH, facing, hit: true, crit };

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
      crit: counter.crit,
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
  return {
    damage: computeSpellDamage({
      ma: caster.ma,
      spellPower,
      casterFaith: caster.faith,
      targetFaith: target.faith,
      randomMul: 1.0,
    }),
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
  const damage = computeSpellDamage({
    ma: caster.ma,
    spellPower,
    casterFaith: caster.faith,
    targetFaith: target.faith,
    randomMul: 0.85 + rng() * 0.30,
  });
  target.applyDamage(damage);
  if (damage > 0 && target.hasStatus('sleep')) target.removeStatus('sleep');

  const out: SpellOutcome = { caster, target, damage, hit: true };
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
      pa: attacker.pa, weaponPower,
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
    pa: attacker.pa, weaponPower,
    attackerH: aH, targetH: tH,
    facing, randomMul,
  });
  const damage = crit ? Math.max(1, Math.floor(baseDamage * CRIT_MULTIPLIER)) : baseDamage;
  target.applyDamage(damage);
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

  return { attacker, target, damage, heightDiff: aH - tH, facing, hit: true, crit, drained };
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
      ma: caster.ma, spellPower,
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
    ma: caster.ma, spellPower,
    casterFaith: caster.faith, targetFaith: target.faith,
    randomMul: 0.85 + rng() * 0.30,
  });
  const before = target.hp;
  target.hp = Math.min(target.hpMax, target.hp + amount);
  return { caster, target, amount: target.hp - before };
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

export interface StatShiftOutcome {
  user: Unit;
  target: Unit;
  stat: 'faith' | 'bravery';
  before: number;
  after: number;
}

/**
 * Permanent faith/bravery shift. Mutates the live stat AND, for player units,
 * the UnitProgression so the change survives across battles. Clamps to
 * [1, 100] (FFT canon range — 0 and 100 are technically possible but the
 * floor of 1 keeps math safer).
 */
export function applyStatShift(
  user: Unit, target: Unit, stat: 'faith' | 'bravery', amount: number,
): StatShiftOutcome {
  const before = target[stat];
  const after = Math.max(1, Math.min(100, before + amount));
  target[stat] = after;
  if (target.progression) target.progression[stat] = after;
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
