/**
 * Per-team record of the most recent ability cast. Mime's Mimic looks up
 * its own team's entry to replay the action; the orchestrator records into
 * the log every time a non-Mimic ability is committed (instant or charged
 * — recorded at cast-time, not at resolve-time, so a Mime can copy a
 * still-charging spell).
 */

import { Team } from './Unit';

export interface LastAction {
  abilityId: string;
  /** Target tile coordinates from the original cast. */
  x: number;
  z: number;
}

export class LastActionLog {
  private readonly log: Partial<Record<Team, LastAction>> = {};

  record(team: Team, abilityId: string, x: number, z: number): void {
    this.log[team] = { abilityId, x, z };
  }

  get(team: Team): LastAction | null {
    return this.log[team] ?? null;
  }
}
