import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, Facing, Team,
} from '../../src/battle/Unit';
import { TurnSystem } from '../../src/battle/TurnSystem';
import { STATUS_DEFS } from '../../src/data/statuses';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 30, pa: 5, ma: 8, speed: 10, move: 4, jump: 1,
  faith: 100, bravery: 50, evasion: 10,
  ...over,
});

function makeUnit(id: string, team: Team, x = 0, z = 0, facing: Facing = FACING_E, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = { id, name: id, team, jobId: 'x', level: 1, stats: stats(over) };
  return new Unit(def, x, z, facing);
}

describe('Status arsenal: new statuses', () => {
  it('Regen heals -hpPerTick each tick (negative tick = heal)', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 50 });
    u.hpMax = 100;
    u.hp = 50;
    u.addStatus('regen');
    const partner = makeUnit('p', 'player', 1, 0);
    const ts = new TurnSystem([u, partner]);
    ts.advance(); // 10 ticks for partner to reach 100
    // STATUS_DEFS.regen.hpPerTick = -4 → heals 4/tick × 10 ticks = +40
    expect(u.hp).toBeGreaterThan(50);
    expect(u.hp).toBeLessThanOrEqual(100);
  });

  it('Regen does not overheal past hpMax', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 100 });
    u.addStatus('regen');
    const partner = makeUnit('p', 'player', 1, 0);
    const ts = new TurnSystem([u, partner]);
    ts.advance();
    expect(u.hp).toBe(u.hpMax);
  });

  it("Don't Move and Don't Act share the restraint group (mutually exclusive)", () => {
    const u = makeUnit('u', 'player');
    u.addStatus('dont_move');
    expect(u.hasStatus('dont_move')).toBe(true);
    u.addStatus('dont_act');
    expect(u.hasStatus('dont_act')).toBe(true);
    expect(u.hasStatus('dont_move')).toBe(false);
  });

  it('Silence carries the blocksMagic flag on its StatusDef', () => {
    expect(STATUS_DEFS.silence.blocksMagic).toBe(true);
    expect(STATUS_DEFS.poison.blocksMagic).toBeUndefined();
  });
});
