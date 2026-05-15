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
  | { kind: 'rout' }       // defeat the entire enemy team (the classic default)
  | { kind: 'regicide' };  // defeat the designated enemy leader — others irrelevant

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
  objective: BattleObjective, units: readonly Unit[],
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
  }
}

/** HUD banner text for the current objective. */
export function objectiveLabel(objective: BattleObjective, leaderName: string | null): string {
  switch (objective.kind) {
    case 'rout':
      return 'Objective — Rout the enemy';
    case 'regicide':
      return `Objective — Defeat the leader${leaderName ? `: ${leaderName}` : ''}`;
  }
}

/**
 * Roll the win condition for the next battle. Battle 0 is always Rout —
 * the first fight a player ever sees stays a clean, legible deathmatch.
 */
export function pickObjective(battleCount: number, rng: () => number = Math.random): BattleObjective {
  if (battleCount <= 0) return { kind: 'rout' };
  return rng() < 0.70 ? { kind: 'rout' } : { kind: 'regicide' };
}
