import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import { TurnSystem } from '../../src/battle/TurnSystem';
import { resolveCureStatus } from '../../src/battle/ActionResolver';
import { ABILITIES } from '../../src/data/abilities';
import { JOB_DEFS } from '../../src/data/jobs';
import { STATUS_DEFS } from '../../src/data/statuses';

const rngHit = () => 0;          // always passes hit roll
const rngMiss = () => 0.999;     // always fails when chance < 100

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

describe('Status arsenal: resolveCureStatus', () => {
  it('removes only the listed statuses from a target', () => {
    const caster = makeUnit('c', 'player', 0, 0, FACING_E, { faith: 100 });
    const target = makeUnit('t', 'player', 1, 0, FACING_W, { faith: 100 });
    target.addStatus('poison');
    target.addStatus('slow');
    target.addStatus('silence'); // not in the cure list — must persist
    const out = resolveCureStatus(caster, target, ['poison', 'slow'], 200, rngHit);
    expect(out.hit).toBe(true);
    expect(out.removed.sort()).toEqual(['poison', 'slow']);
    expect(target.hasStatus('poison')).toBe(false);
    expect(target.hasStatus('slow')).toBe(false);
    expect(target.hasStatus('silence')).toBe(true);
  });

  it('returns hit=true / removed=[] when target has none of the listed statuses', () => {
    const caster = makeUnit('c', 'player', 0, 0, FACING_E, { faith: 100 });
    const target = makeUnit('t', 'player', 1, 0, FACING_W, { faith: 100 });
    const out = resolveCureStatus(caster, target, ['poison'], 200, rngHit);
    expect(out.hit).toBe(true);
    expect(out.removed).toEqual([]);
  });

  it('faith-scaled miss leaves all statuses in place', () => {
    const caster = makeUnit('c', 'player', 0, 0, FACING_E, { faith: 10 });
    const target = makeUnit('t', 'player', 1, 0, FACING_W, { faith: 10 });
    target.addStatus('poison');
    const out = resolveCureStatus(caster, target, ['poison'], 50, rngMiss);
    expect(out.hit).toBe(false);
    expect(out.removed).toEqual([]);
    expect(target.hasStatus('poison')).toBe(true);
  });
});

describe('Status arsenal: ability catalog wiring', () => {
  it('White Mage learns Regen and Esuna', () => {
    expect(JOB_DEFS.white_mage.learnableActives).toContain('regen');
    expect(JOB_DEFS.white_mage.learnableActives).toContain('esuna');
  });

  it('Chemist learns Remedy', () => {
    expect(JOB_DEFS.chemist.learnableActives).toContain('remedy');
  });

  it('Remedy is physical-type so it works under Silence', () => {
    expect(ABILITIES.remedy.type).toBe('physical');
  });

  it('Esuna is magical-type (Silence blocks it)', () => {
    expect(ABILITIES.esuna.type).toBe('magical');
  });

  it('Esuna cures the same status set as Remedy', () => {
    const esuna = ABILITIES.esuna.effect;
    const remedy = ABILITIES.remedy.effect;
    if (esuna.kind !== 'cure-status' || remedy.kind !== 'cure-status') throw new Error('bad fixture');
    expect([...esuna.statuses].sort()).toEqual([...remedy.statuses].sort());
  });
});
