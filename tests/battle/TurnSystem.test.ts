import { describe, it, expect } from 'vitest';
import { Unit, UnitDef, UnitStats, FACING_E, Team } from '../../src/battle/Unit';
import { TurnSystem } from '../../src/battle/TurnSystem';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 50, mp: 0, pa: 5, ma: 5, speed: 10, move: 4, jump: 1, faith: 50, bravery: 50,
  ...over,
});

function makeUnit(id: string, team: Team, speed: number): Unit {
  const def: UnitDef = {
    id, name: id, team, jobId: 'x', level: 1, stats: stats({ speed }),
  };
  return new Unit(def, 0, 0, FACING_E);
}

describe('TurnSystem', () => {
  it('predicts upcoming actors using the same ordering as advance()', () => {
    // 2 players at speed 10, 2 enemies at speed 8, all at CT 0.
    // Tick 10: all 4 reach >= 100 — players first (CT 100, higher speed than 80 from enemies).
    // After all 4 players (er, 2 players) acted, enemies catch up.
    const p1 = makeUnit('p1', 'player', 10);
    const p2 = makeUnit('p2', 'player', 10);
    const e1 = makeUnit('e1', 'enemy', 8);
    const e2 = makeUnit('e2', 'enemy', 8);
    const ts = new TurnSystem([p1, p2, e1, e2]);
    const order = ts.predictUpcoming(8).map(u => u.id);
    // Tick-by-tick trace:
    //   t=10: p1,p2 hit 100 (e=80) → p1,p2 act (CT→0 each)
    //   +3:   e1,e2 hit 104        → e1,e2 act (CT→4 each)
    //   +7:   p1,p2 hit 100        → p1,p2 act
    //   +5:   e1,e2 hit 100        → e1,e2 act
    expect(order).toEqual(['p1', 'p2', 'e1', 'e2', 'p1', 'p2', 'e1', 'e2']);
  });

  it('does not mutate real CT values during prediction', () => {
    const u = makeUnit('u', 'player', 10);
    const ts = new TurnSystem([u]);
    const before = u.ct;
    ts.predictUpcoming(5);
    expect(u.ct).toBe(before);
  });

  it('advance() returns the highest-CT ready unit and updates real state', () => {
    const fast = makeUnit('fast', 'player', 20);
    const slow = makeUnit('slow', 'player', 5);
    const ts = new TurnSystem([fast, slow]);
    const first = ts.advance();
    expect(first.kind).toBe('turn');
    if (first.kind === 'turn') expect(first.unit).toBe(fast);
    expect(fast.ct).toBeGreaterThanOrEqual(100);
  });

  it('endTurn applies correct CT cost for moved/acted/wait', () => {
    const u = makeUnit('u', 'player', 10);
    const ts = new TurnSystem([u]);

    u.ct = 110;
    ts.endTurn(u, { moved: true, acted: true });
    expect(u.ct).toBe(10); // -100

    u.ct = 110;
    ts.endTurn(u, { moved: true, acted: false });
    expect(u.ct).toBe(30); // -80

    u.ct = 110;
    ts.endTurn(u, { moved: false, acted: true });
    expect(u.ct).toBe(30); // -80

    u.ct = 110;
    ts.endTurn(u, { moved: false, acted: false });
    expect(u.ct).toBe(50); // -60 (waiting acts again sooner)
  });

  it('skips dead units in turn order', () => {
    const a = makeUnit('a', 'player', 10);
    const b = makeUnit('b', 'player', 10);
    const ts = new TurnSystem([a, b]);
    a.hp = 0;
    const next = ts.advance();
    expect(next.kind).toBe('turn');
    if (next.kind === 'turn') expect(next.unit).toBe(b);
  });
});
