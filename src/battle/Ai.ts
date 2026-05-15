import { Unit } from './Unit';
import { BattleMap } from './Map';
import { MovePlan } from './Movement';
import { unitAt, abilityTargets, affectedUnits } from './Targeting';
import {
  predictAttackDamage, predictSpellDamage, predictHeal, predictRangedAttack,
  physicalHitChance, magicStatusHitChance, relativeFacing,
  effectiveWeaponPower,
} from './ActionResolver';
import { ABILITIES, Ability } from '../data/abilities';
import { JOB_DEFS } from '../data/jobs';
import { StatusId } from '../data/statuses';

export type EnemyAction =
  | { kind: 'attack'; targetId: string }
  | { kind: 'ability'; abilityId: string; targetId: string };

export interface EnemyDecision {
  movePath: { x: number; z: number }[];
  action: EnemyAction | null;
}

export interface EnemyController {
  decide(actor: Unit, map: BattleMap, units: readonly Unit[]): EnemyDecision;
}

const ADJACENT: [number, number][] = [
  [ 1, 0],
  [-1, 0],
  [ 0, 1],
  [ 0,-1],
];

/** Flat status-application bonuses, regardless of target HP / CT. Context-
 *  sensitive ones (silence, regen) override this in scoreSingleTarget. */
const STATUS_VALUE: Record<StatusId, number> = {
  stop:      30,
  sleep:     25,
  haste:     20,
  poison:    15,
  slow:      10,
  dont_act:  16,
  dont_move: 16,
  silence:   12,   // overridden: 2 if target has no magical learnables
  regen:     20,   // overridden: 8 if target near full HP
  reraise:   30,   // strong prophylactic on a frontline ally
  death_sentence: 50,  // 24-tick guaranteed KO when it lands
  berserk:   20,   // forces enemy to waste turns chasing; +50% PA is the bite
  confuse:   22,   // random target hits any team — meaningful chance of self-team damage
  charm:     35,   // flips an enemy to attack its own team — enormous swing
  frog:      22,   // shuts off the kit + halves PA, but the unit still chips
  petrify:   45,   // soft KO — just under Death Sentence's guaranteed 50
  undead:    12,   // conditional — only pays off once the target is "healed"
};

/** Whether a unit has any magical-type ability available — used to gate
 *  Silence's score (only worth casting on real casters). */
function hasMagicalKit(u: Unit): boolean {
  const ids = [...(JOB_DEFS[u.jobId]?.learnableActives ?? [])];
  if (u.secondaryJobId) ids.push(...(JOB_DEFS[u.secondaryJobId]?.learnableActives ?? []));
  return ids.some(id => ABILITIES[id]?.type === 'magical');
}

/**
 * Single-turn lookahead heuristic. For each tile the actor can end its move
 * on, we score:
 *   - basic attack damage / KO bonus
 *   - status ability value (if MP allows and target doesn't already have it)
 *   - threat penalty (adjacent enemies × their PA × 0.3)
 *   - closing-distance bonus when the actor has nothing better to do
 *
 * Intentionally simple — the EnemyController interface lets a smarter planner
 * drop in later.
 */
export class HeuristicAi implements EnemyController {
  decide(actor: Unit, map: BattleMap, units: readonly Unit[]): EnemyDecision {
    const plan = new MovePlan(actor, map, units);
    const cantMove = actor.hasStatus('dont_move');
    const cantAct = actor.hasStatus('dont_act');
    const silenced = actor.hasStatus('silence');
    const frogged = actor.hasStatus('frog');
    const endTiles = cantMove
      ? [{ x: actor.x, z: actor.z, cost: 0 }]
      : plan.endTiles();
    const learnable = JOB_DEFS[actor.jobId]?.learnableActives ?? [];

    let bestScore = -Infinity;
    let best: EnemyDecision = { movePath: [], action: null };

    const consider = (tile: { x: number; z: number }, action: EnemyAction | null) => {
      const score = scoreOption(actor, tile, action, units, map);
      if (score <= bestScore) return;
      bestScore = score;
      const isStay = tile.x === actor.x && tile.z === actor.z;
      best = {
        movePath: isStay ? [] : plan.pathTo(tile.x, tile.z),
        action,
      };
    };

    for (const tile of endTiles) {
      consider(tile, null);
      if (cantAct) continue;

      // Basic-attack candidates (adjacent enemies).
      const adjacentEnemies: Unit[] = [];
      for (const [dx, dz] of ADJACENT) {
        const t = unitAt(units, tile.x + dx, tile.z + dz);
        if (t && t.team !== actor.team) adjacentEnemies.push(t);
      }
      for (const target of adjacentEnemies) {
        consider(tile, { kind: 'attack', targetId: target.id });
      }

      // Ability candidates — gated by MP and "doesn't already have status".
      const tileTerrain = map.getTile(tile.x, tile.z).terrain;
      for (const abId of learnable) {
        if (frogged) break;   // a frogged unit can only basic-attack
        const ab = ABILITIES[abId];
        if (actor.mp < ab.mpCost) continue;
        if (silenced && ab.type === 'magical') continue;
        if (ab.requiresTerrain && !ab.requiresTerrain.includes(tileTerrain)) continue;
        const targets = abilityTargets(actor, ab, map, units, tile);
        for (const ttile of targets) {
          const target = unitAt(units, ttile.x, ttile.z);
          if (!target) continue;
          if (ab.effect.kind === 'inflict-status' && target.hasStatus(ab.effect.statusId)) continue;
          // Heals are only worth casting when the ally is missing the resource.
          if (ab.effect.kind === 'magic-heal' && target.hp >= target.hpMax) continue;
          if (ab.effect.kind === 'flat-heal') {
            const hpFull = !ab.effect.hp || target.hp >= target.hpMax;
            const mpFull = !ab.effect.mp || target.mp >= target.mpMax;
            if (hpFull && mpFull) continue;
          }
          consider(tile, { kind: 'ability', abilityId: abId, targetId: target.id });
        }
      }
    }

    return best;
  }
}

function scoreOption(
  actor: Unit,
  endTile: { x: number; z: number },
  action: EnemyAction | null,
  units: readonly Unit[],
  map: BattleMap,
): number {
  let s = 0;

  if (action === null) {
    const nearest = nearestOpponent(actor, endTile, units);
    if (nearest) s -= manhattan(endTile, nearest) * 0.4;
  } else if (action.kind === 'attack') {
    const target = units.find(u => u.id === action.targetId);
    if (target) {
      const pred = predictAttackDamage(actor, target, map, endTile);
      const p = pred.hitChance / 100;
      s += pred.damage * p;
      if (target.hp - pred.damage <= 0) s += 100 * p;
    }
  } else {
    s += scoreAbility(action, units, actor, map);
  }

  // Threat from adjacent opponents at this end-tile.
  let threat = 0;
  for (const u of units) {
    if (u.team === actor.team || !u.isAlive) continue;
    if (manhattan(endTile, u) === 1) threat += u.pa * effectiveWeaponPower(u);
  }
  s -= threat * 0.3;

  return s;
}

function scoreAbility(
  action: { abilityId: string; targetId: string },
  units: readonly Unit[],
  actor: Unit,
  map: BattleMap,
): number {
  const ab = ABILITIES[action.abilityId];
  const center = units.find(u => u.id === action.targetId);
  if (!center) return 0;

  // For AoE, score the SUM across every affected unit. For single-target, the
  // list collapses to [center] (with the same per-unit logic).
  const targets = ab.area
    ? affectedUnits(actor, ab, center.x, center.z, map, units)
    : [center];
  if (targets.length === 0) return 0;

  let total = 0;
  for (const t of targets) total += scoreSingleTarget(ab, t, actor, map);
  return total;
}

function scoreSingleTarget(ab: Ability, target: Unit, actor: Unit, map: BattleMap): number {
  switch (ab.effect.kind) {
    case 'inflict-status': {
      let base = STATUS_VALUE[ab.effect.statusId] ?? 0;
      if (ab.effect.statusId === 'silence' && !hasMagicalKit(target)) base = 2;
      if (ab.effect.statusId === 'regen' && target.hp > target.hpMax * 0.5) base = 8;
      const p = magicStatusHitChance(actor, target, ab.effect.baseAccuracy) / 100;
      return base * p;
    }
    case 'cure-status': {
      const curable = ab.effect.statuses.filter(s => target.hasStatus(s)).length;
      if (curable === 0) return 0;
      const p = magicStatusHitChance(actor, target, ab.effect.baseAccuracy) / 100;
      return 8 * curable * p;
    }
    case 'magic-damage': {
      const pred = predictSpellDamage(actor, target, ab.effect.spellPower);
      return pred.damage + (target.hp - pred.damage <= 0 ? 100 : 0);
    }
    case 'damage-and-status': {
      const pred = predictSpellDamage(actor, target, ab.effect.spellPower);
      const damageScore = pred.damage + (target.hp - pred.damage <= 0 ? 100 : 0);
      const statusValue = STATUS_VALUE[ab.effect.statusId] ?? 0;
      const statusChance = magicStatusHitChance(actor, target, ab.effect.statusBaseAcc) / 100;
      return damageScore + statusValue * statusChance;
    }
    case 'physical-damage-and-status': {
      const pred = predictRangedAttack(actor, target, ab.effect.weaponPower, map);
      const p = pred.hitChance / 100;
      const damageScore = pred.damage * p + (target.hp - pred.damage <= 0 ? 100 * p : 0);
      const statusValue = STATUS_VALUE[ab.effect.statusId] ?? 0;
      const statusChance = magicStatusHitChance(actor, target, ab.effect.statusBaseAcc) / 100;
      // Status only lands if the physical hit lands — compound the chances.
      return damageScore + statusValue * statusChance * p;
    }
    case 'physical-ranged-damage': {
      const pred = predictRangedAttack(actor, target, ab.effect.weaponPower, map);
      const p = pred.hitChance / 100;
      return pred.damage * p + (target.hp - pred.damage <= 0 ? 100 * p : 0);
    }
    case 'magic-heal': {
      const pred = predictHeal(actor, target, ab.effect.spellPower);
      return Math.min(pred.amount, target.hpMax - target.hp);
    }
    case 'flat-heal': {
      let score = 0;
      if (ab.effect.hp) score += Math.min(ab.effect.hp, target.hpMax - target.hp);
      if (ab.effect.mp) score += Math.min(ab.effect.mp, target.mpMax - target.mp);
      return score;
    }
    case 'debuff': {
      const facing = relativeFacing(actor, target);
      const p = physicalHitChance(target, facing) / 100;
      return 6 * p;
    }
    case 'stat-shift': {
      const p = magicStatusHitChance(actor, target, ab.effect.baseAccuracy) / 100;
      // Per-point weights: PA shifts swing damage most, MA next, then speed,
      // then personality stats (faith/bravery move slowly). Self-buffs score
      // a bit lower than enemy-debuffs of the same magnitude — attacking is
      // usually still better than priming.
      const PER_POINT: Record<typeof ab.effect.stat, number> = {
        pa: 6, ma: 5, speed: 4, faith: 3, bravery: 3,
      };
      const isSelfBuff = target === actor && ab.effect.amount > 0;
      const weight = PER_POINT[ab.effect.stat] * (isSelfBuff ? 0.5 : 1);
      return weight * Math.abs(ab.effect.amount) * p;
    }
    default:
      return 0;
  }
}

function manhattan(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

function nearestOpponent(actor: Unit, fromTile: { x: number; z: number }, units: readonly Unit[]): Unit | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const u of units) {
    if (u.team === actor.team || !u.isAlive) continue;
    const d = manhattan(fromTile, u);
    if (d < bestD) { bestD = d; best = u; }
  }
  return best;
}
