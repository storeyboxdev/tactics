import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, Facing, Team,
} from '../../src/battle/Unit';
import { pickObjective, evaluateObjective } from '../../src/battle/Objective';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 0, pa: 5, ma: 5, speed: 10, move: 4, jump: 1,
  faith: 50, bravery: 50, evasion: 0,
  ...over,
});

function makeUnit(id: string, team: Team, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = { id, name: id, team, jobId: 'x', level: 1, stats: stats(over) };
  return new Unit(def, 0, 0, FACING_E as Facing);
}

describe('pickObjective', () => {
  it('battle 0 is always Rout', () => {
    for (let i = 0; i < 20; i++) {
      expect(pickObjective(0, Math.random).kind).toBe('rout');
    }
  });

  it('later battles can roll Regicide and Survive', () => {
    expect(pickObjective(5, () => 0.0).kind).toBe('rout');
    expect(pickObjective(5, () => 0.7).kind).toBe('regicide');
    expect(pickObjective(5, () => 0.99).kind).toBe('survive');
  });
});

describe('evaluateObjective — Rout', () => {
  const rout = { kind: 'rout' as const };

  it('is unresolved while both teams stand', () => {
    const units = [makeUnit('p', 'player'), makeUnit('e', 'enemy')];
    expect(evaluateObjective(rout, units)).toBeNull();
  });

  it('player wins only when every enemy is down', () => {
    const p = makeUnit('p', 'player');
    const e1 = makeUnit('e1', 'enemy');
    const e2 = makeUnit('e2', 'enemy');
    e1.applyDamage(999);
    expect(evaluateObjective(rout, [p, e1, e2])).toBeNull(); // e2 still up
    e2.applyDamage(999);
    expect(evaluateObjective(rout, [p, e1, e2])).toBe('player');
  });

  it('player loses when the player team is wiped', () => {
    const p = makeUnit('p', 'player');
    const e = makeUnit('e', 'enemy');
    p.applyDamage(999);
    expect(evaluateObjective(rout, [p, e])).toBe('enemy');
  });
});

describe('evaluateObjective — Regicide', () => {
  const regicide = { kind: 'regicide' as const };

  it('player wins the moment the leader falls — other enemies irrelevant', () => {
    const p = makeUnit('p', 'player');
    const leader = makeUnit('boss', 'enemy');
    leader.isLeader = true;
    const grunt = makeUnit('grunt', 'enemy');
    expect(evaluateObjective(regicide, [p, leader, grunt])).toBeNull();
    leader.applyDamage(999);
    // Leader down, grunt still alive — player wins anyway.
    expect(grunt.isAlive).toBe(true);
    expect(evaluateObjective(regicide, [p, leader, grunt])).toBe('player');
  });

  it('player loss still triggers on a team wipe', () => {
    const p = makeUnit('p', 'player');
    const leader = makeUnit('boss', 'enemy');
    leader.isLeader = true;
    p.applyDamage(999);
    expect(evaluateObjective(regicide, [p, leader])).toBe('enemy');
  });
});

describe('evaluateObjective — Survive', () => {
  const survive = { kind: 'survive' as const, ticks: 60 };

  it('is unresolved before the tick threshold', () => {
    const units = [makeUnit('p', 'player'), makeUnit('e', 'enemy')];
    expect(evaluateObjective(survive, units, 0)).toBeNull();
    expect(evaluateObjective(survive, units, 59)).toBeNull();
  });

  it('player wins once the tick threshold is reached', () => {
    const units = [makeUnit('p', 'player'), makeUnit('e', 'enemy')];
    expect(evaluateObjective(survive, units, 60)).toBe('player');
    expect(evaluateObjective(survive, units, 120)).toBe('player');
  });

  it('routing the enemy wins a Survive battle early', () => {
    const p = makeUnit('p', 'player');
    const e = makeUnit('e', 'enemy');
    e.applyDamage(999);
    expect(evaluateObjective(survive, [p, e], 5)).toBe('player');
  });

  it('a team wipe still loses, even one tick from the threshold', () => {
    const p = makeUnit('p', 'player');
    const e = makeUnit('e', 'enemy');
    p.applyDamage(999);
    expect(evaluateObjective(survive, [p, e], 59)).toBe('enemy');
  });
});
