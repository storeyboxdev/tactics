/**
 * Battle objectives — the per-fight win condition.
 *
 * The *loss* side is constant across all objectives: a team is defeated
 * when it has no unit that is alive and not petrified (the same standing
 * rule the elimination check has always used). Objectives only vary how
 * the *player* wins.
 */

import { Unit, Team } from './Unit';

export type BattleObjective =
  | { kind: 'rout' }                       // defeat the entire enemy team (classic default)
  | { kind: 'regicide' }                   // defeat the designated enemy leader
  | { kind: 'survive'; ticks: number }     // outlast a CT-tick threshold
  | { kind: 'protect' }                    // rout the enemy, but losing the VIP loses
  | { kind: 'escort'; goalX: number; goalZ: number }; // get the escortee to the goal tile

/** True if `team` still has a unit that's alive and not petrified. */
function teamStanding(units: readonly Unit[], team: Team): boolean {
  return units.some(u => u.team === team && u.isAlive && !u.hasStatus('petrify'));
}

/**
 * Resolve a battle to a winner, or `null` if it's still going. Pure — the
 * orchestrator's `checkBattleEnd` calls this so the shipped logic and the
 * tested logic are the same function.
 */
export function evaluateObjective(
  objective: BattleObjective, units: readonly Unit[], tick = 0,
): 'player' | 'enemy' | null {
  // Loss is universal: a wiped player team always loses, whatever the goal.
  if (!teamStanding(units, 'player')) return 'enemy';

  switch (objective.kind) {
    case 'rout':
      return teamStanding(units, 'enemy') ? null : 'player';
    case 'regicide': {
      const leader = units.find(u => u.isLeader);
      return leader && leader.isAlive ? null : 'player';
    }
    case 'survive':
      // Routing the enemy is always a valid way to "survive"; otherwise
      // hold out until the tick threshold.
      if (!teamStanding(units, 'enemy')) return 'player';
      return tick >= objective.ticks ? 'player' : null;
    case 'protect': {
      // Win like a Rout, but losing the VIP loses the battle outright.
      const vip = units.find(u => u.isProtected);
      if (!vip || !vip.isAlive) return 'enemy';
      return teamStanding(units, 'enemy') ? null : 'player';
    }
    case 'escort': {
      // Lose if the escortee falls; win on reaching the goal tile, or by
      // routing the enemy (the path is clear either way).
      const e = units.find(u => u.isEscortee);
      if (!e || !e.isAlive) return 'enemy';
      if (e.x === objective.goalX && e.z === objective.goalZ) return 'player';
      if (!teamStanding(units, 'enemy')) return 'player';
      return null;
    }
  }
}

/**
 * HUD banner text for the current objective. For Survive, `tick` is the
 * current CT tick so the banner can count down the ticks remaining.
 */
export function objectiveLabel(
  objective: BattleObjective, leaderName: string | null, tick = 0,
): string {
  switch (objective.kind) {
    case 'rout':
      return 'Objective — Rout the enemy';
    case 'regicide':
      return `Objective — Defeat the leader${leaderName ? `: ${leaderName}` : ''}`;
    case 'survive':
      return `Objective — Survive (${Math.max(0, objective.ticks - tick)} ticks left)`;
    case 'protect':
      return `Objective — Rout the enemy; protect${leaderName ? ` ${leaderName}` : ' the VIP'}`;
    case 'escort':
      return `Objective — Escort${leaderName ? ` ${leaderName}` : ' the unit'} to the goal`;
  }
}

/**
 * Index of the enemy best suited to be the Regicide leader — the one
 * farthest (summed manhattan) from the player line, so the boss starts
 * behind its escorts rather than in the front rank. Ties break to the
 * lowest index. Returns 0 for an empty enemy list.
 */
export function pickLeaderIndex(
  enemies: readonly { x: number; z: number }[],
  players: readonly { x: number; z: number }[],
): number {
  let bestIdx = 0;
  let bestSum = -1;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    let sum = 0;
    for (const p of players) sum += Math.abs(e.x - p.x) + Math.abs(e.z - p.z);
    if (sum > bestSum) { bestSum = sum; bestIdx = i; }
  }
  return bestIdx;
}

/**
 * Roll the win condition for the next battle. Battle 0 is always Rout —
 * the first fight a player ever sees stays a clean, legible deathmatch.
 */
export function pickObjective(battleCount: number, rng: () => number = Math.random): BattleObjective {
  if (battleCount <= 0) return { kind: 'rout' };
  const r = rng();
  if (r < 0.45) return { kind: 'rout' };
  if (r < 0.63) return { kind: 'regicide' };
  if (r < 0.78) return { kind: 'survive', ticks: 60 };
  if (r < 0.90) return { kind: 'protect' };
  // Escort's goal tile is map-dependent — battle setup fills it in.
  return { kind: 'escort', goalX: 0, goalZ: 0 };
}
