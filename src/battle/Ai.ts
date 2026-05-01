import { Unit } from './Unit';
import { BattleMap } from './Map';
import { MovePlan } from './Movement';
import { unitAt, abilityTargets } from './Targeting';
import { predictAttackDamage, PLACEHOLDER_WEAPON_POWER } from './ActionResolver';
import { ABILITIES } from '../data/abilities';
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

/** Flat status-application bonuses, regardless of target HP / CT. */
const STATUS_VALUE: Record<StatusId, number> = {
  stop:   30,
  sleep:  25,
  haste:  20,
  poison: 15,
  slow:   10,
};

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
    const endTiles = plan.endTiles();
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
      // Basic-attack candidates (adjacent enemies).
      const adjacentEnemies: Unit[] = [];
      for (const [dx, dz] of ADJACENT) {
        const t = unitAt(units, tile.x + dx, tile.z + dz);
        if (t && t.team !== actor.team) adjacentEnemies.push(t);
      }

      consider(tile, null);
      for (const target of adjacentEnemies) {
        consider(tile, { kind: 'attack', targetId: target.id });
      }

      // Ability candidates — gated by MP and "doesn't already have status".
      for (const abId of learnable) {
        const ab = ABILITIES[abId];
        if (actor.mp < ab.mpCost) continue;
        const targets = abilityTargets(actor, ab, map, units, tile);
        for (const ttile of targets) {
          const target = unitAt(units, ttile.x, ttile.z);
          if (!target) continue;
          if (ab.effect.kind === 'inflict-status' && target.hasStatus(ab.effect.statusId)) continue;
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
      s += pred.damage;
      if (target.hp - pred.damage <= 0) s += 100;
    }
  } else {
    s += scoreAbility(action, units);
  }

  // Threat from adjacent opponents at this end-tile.
  let threat = 0;
  for (const u of units) {
    if (u.team === actor.team || !u.isAlive) continue;
    if (manhattan(endTile, u) === 1) threat += u.pa * PLACEHOLDER_WEAPON_POWER;
  }
  s -= threat * 0.3;

  return s;
}

function scoreAbility(action: { abilityId: string; targetId: string }, units: readonly Unit[]): number {
  const ab = ABILITIES[action.abilityId];
  const target = units.find(u => u.id === action.targetId);
  if (!target) return 0;
  if (ab.effect.kind === 'inflict-status') {
    return STATUS_VALUE[ab.effect.statusId] ?? 0;
  }
  // Other ability kinds (debuff / magic-damage) — not used by status-AI yet.
  return 0;
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
