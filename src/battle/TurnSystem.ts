import { Unit } from './Unit';

/**
 * FFT-style Charge Time turn system.
 *
 * Every tick, each living unit's CT increases by its Speed. The first unit to
 * reach CT >= 100 acts. After acting, CT is decremented based on what happened
 * during the turn:
 *
 *   - moved AND acted  →  -100  (full turn cost)
 *   - moved XOR acted  →  -80
 *   - waited (neither) →  -60
 *
 * Charged abilities (queued via {@link schedule}) live in a separate queue and
 * resolve when their `resolveTick` <= the current tick. They take priority
 * over a unit's normal turn when both are due simultaneously.
 */

export interface PendingSpell {
  caster: Unit;
  abilityId: string;
  target: { x: number; z: number };
  resolveTick: number;
}

export type AdvanceResult =
  | { kind: 'turn'; unit: Unit }
  | { kind: 'spell'; spell: PendingSpell };

export class TurnSystem {
  private currentTick = 0;
  private readonly pending: PendingSpell[] = [];

  constructor(private readonly units: readonly Unit[]) {}

  get tick(): number { return this.currentTick; }
  get pendingSpells(): readonly PendingSpell[] { return this.pending; }

  /** Advance ticks until either a charged spell resolves or a unit's CT hits 100. */
  advance(): AdvanceResult {
    while (true) {
      const due = this.popDueSpell();
      if (due) return { kind: 'spell', spell: due };
      const ready = this.peekReady();
      if (ready) return { kind: 'turn', unit: ready };
      this.currentTick++;
      for (const u of this.units) {
        if (u.isAlive) u.ct += u.speed;
      }
    }
  }

  peekReady(): Unit | null {
    let best: Unit | null = null;
    for (const u of this.units) {
      if (!u.isAlive || u.ct < 100) continue;
      if (best === null || compareReady(u, best) < 0) best = u;
    }
    return best;
  }

  endTurn(unit: Unit, opts: { moved: boolean; acted: boolean }): void {
    const cost = opts.moved && opts.acted ? 100 : (opts.moved || opts.acted) ? 80 : 60;
    unit.ct = Math.max(0, unit.ct - cost);
  }

  schedule(spell: PendingSpell): void {
    this.pending.push(spell);
  }

  /** Remove pending spells matching the predicate (e.g., caster died). */
  cancelPending(pred: (s: PendingSpell) => boolean): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (pred(this.pending[i])) this.pending.splice(i, 1);
    }
  }

  predictUpcoming(n: number): Unit[] {
    type Snap = { unit: Unit; ct: number };
    const snaps: Snap[] = this.units
      .filter(u => u.isAlive)
      .map(u => ({ unit: u, ct: u.ct }));

    const out: Unit[] = [];
    let safety = 0;
    while (out.length < n && safety < 10_000) {
      let winner: Snap | null = null;
      for (const s of snaps) {
        if (s.ct < 100) continue;
        if (winner === null || compareReadySnap(s, winner) < 0) winner = s;
      }
      if (winner) {
        out.push(winner.unit);
        winner.ct -= 100;
      } else {
        for (const s of snaps) s.ct += s.unit.speed;
        safety++;
      }
    }
    return out;
  }

  private popDueSpell(): PendingSpell | null {
    let bestIdx = -1;
    for (let i = 0; i < this.pending.length; i++) {
      const p = this.pending[i];
      if (p.resolveTick > this.currentTick) continue;
      if (bestIdx === -1 || p.resolveTick < this.pending[bestIdx].resolveTick) bestIdx = i;
    }
    if (bestIdx === -1) return null;
    return this.pending.splice(bestIdx, 1)[0];
  }
}

function compareReady(a: Unit, b: Unit): number {
  if (a.ct !== b.ct) return b.ct - a.ct;
  if (a.speed !== b.speed) return b.speed - a.speed;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareReadySnap(a: { unit: Unit; ct: number }, b: { unit: Unit; ct: number }): number {
  if (a.ct !== b.ct) return b.ct - a.ct;
  if (a.unit.speed !== b.unit.speed) return b.unit.speed - a.unit.speed;
  return a.unit.id < b.unit.id ? -1 : a.unit.id > b.unit.id ? 1 : 0;
}
