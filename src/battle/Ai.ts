import { Unit } from './Unit';
import { BattleMap } from './Map';
import { MovePlan } from './Movement';
import { unitAt } from './Targeting';
import { predictAttackDamage, PLACEHOLDER_WEAPON_POWER } from './ActionResolver';

/**
 * What the AI decided to do this turn.
 *   movePath: full path including origin, or [] for "stay put"
 *   attack:   target unit id, or null for "no attack"
 */
export interface EnemyDecision {
  movePath: { x: number; z: number }[];
  attack: { targetId: string } | null;
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

/**
 * Single-turn lookahead heuristic. For each tile the actor can end its move
 * on, we score:
 *   + predicted damage to a chosen adjacent enemy (or 0 for "no attack")
 *   + 100 if the attack would KO
 *   - 0.30 × sum of adjacent enemies' raw threat (rough retaliation cost)
 *   - 0.40 × Manhattan distance to nearest enemy when no attack is possible
 *           (incentive to close distance)
 *
 * This is intentionally simple — the EnemyController interface lets a smarter
 * planner drop in later (M-something).
 */
export class HeuristicAi implements EnemyController {
  decide(actor: Unit, map: BattleMap, units: readonly Unit[]): EnemyDecision {
    const plan = new MovePlan(actor, map, units);
    const endTiles = plan.endTiles();

    let bestScore = -Infinity;
    let best: EnemyDecision = { movePath: [], attack: null };

    for (const tile of endTiles) {
      const adjacentEnemies: Unit[] = [];
      for (const [dx, dz] of ADJACENT) {
        const t = unitAt(units, tile.x + dx, tile.z + dz);
        if (t && t.team !== actor.team) adjacentEnemies.push(t);
      }

      // Option: end at tile, do not attack
      consider(tile, null);
      // Option: end at tile, attack each candidate
      for (const target of adjacentEnemies) consider(tile, target);
    }

    function consider(tile: { x: number; z: number }, target: Unit | null) {
      const score = scoreOption(actor, tile, target, units, map);
      if (score <= bestScore) return;
      bestScore = score;
      const isStay = tile.x === actor.x && tile.z === actor.z;
      best = {
        movePath: isStay ? [] : plan.pathTo(tile.x, tile.z),
        attack: target ? { targetId: target.id } : null,
      };
    }

    return best;
  }
}

function scoreOption(
  actor: Unit,
  endTile: { x: number; z: number },
  target: Unit | null,
  units: readonly Unit[],
  map: BattleMap,
): number {
  let s = 0;

  if (target) {
    const pred = predictAttackDamage(actor, target, map, endTile);
    s += pred.damage;
    if (target.hp - pred.damage <= 0) s += 100;
  } else {
    const nearest = nearestOpponent(actor, endTile, units);
    if (nearest) s -= manhattan(endTile, nearest) * 0.4;
  }

  let threat = 0;
  for (const u of units) {
    if (u.team === actor.team || !u.isAlive) continue;
    if (manhattan(endTile, u) === 1) threat += u.pa * PLACEHOLDER_WEAPON_POWER;
  }
  s -= threat * 0.3;

  return s;
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
