import { Unit, Facing, FACING_E, FACING_W, FACING_N, FACING_S } from './Unit';
import { BattleMap } from './Map';

export type RelativeFacing = 'front' | 'side' | 'back';

export interface AttackOutcome {
  attacker: Unit;
  target: Unit;
  damage: number;
  heightDiff: number;
  facing: RelativeFacing;
  hit: boolean;
  counter?: CounterOutcome;
}

export interface CounterOutcome {
  counterer: Unit;
  victim: Unit;
  damage: number;
  facing: RelativeFacing;
  heightDiff: number;
}

export interface SpellOutcome {
  caster: Unit;
  target: Unit;
  damage: number;
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

export const PLACEHOLDER_WEAPON_POWER = 4;
const POTION_HEAL = 30;

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
  const damage = computeAttackDamage({
    pa: attacker.pa,
    weaponPower: PLACEHOLDER_WEAPON_POWER,
    attackerH: aH, targetH: tH,
    facing, randomMul: 0.85 + rng() * 0.30,
  });
  target.hp = Math.max(0, target.hp - damage);

  const out: AttackOutcome = { attacker, target, damage, heightDiff: aH - tH, facing, hit: true };

  if (allowCounter && target.isAlive && isMeleeAdjacent(attacker, target) && rng() < target.bravery / 100) {
    target.facing = facingTowards(target.x, target.z, attacker.x, attacker.z);
    const counter = resolveAttack(target, attacker, map, rng, false);
    out.counter = {
      counterer: target,
      victim: attacker,
      damage: counter.damage,
      facing: counter.facing,
      heightDiff: counter.heightDiff,
    };
  }

  return out;
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

export interface SpellPrediction { damage: number; }

export function predictSpellDamage(caster: Unit, target: Unit, spellPower: number): SpellPrediction {
  return {
    damage: computeSpellDamage({
      ma: caster.ma,
      spellPower,
      casterFaith: caster.faith,
      targetFaith: target.faith,
      randomMul: 1.0,
    }),
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
  target.hp = Math.max(0, target.hp - damage);
  return { caster, target, damage };
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
  amount: number;       // actual reduction applied (clamped above 1)
}

/** Permanent (battle-duration) reduction of a single combat stat. */
export function applyBreak(user: Unit, target: Unit, stat: 'pa' | 'speed' | 'ma', amount: number): BreakOutcome {
  const before = target[stat];
  target[stat] = Math.max(1, target[stat] - amount);
  return { user, target, stat, amount: before - target[stat] };
}
