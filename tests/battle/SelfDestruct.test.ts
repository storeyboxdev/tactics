import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, Facing, Team,
} from '../../src/battle/Unit';
import { resolveDeathTrigger } from '../../src/battle/ActionResolver';
import { JOB_DEFS } from '../../src/data/jobs';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 0, pa: 5, ma: 5, speed: 10, move: 4, jump: 1,
  faith: 50, bravery: 50, evasion: 0,
  ...over,
});

function makeUnit(id: string, team: Team, x: number, z: number, jobId = 'x', over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = { id, name: id, team, jobId, level: 1, stats: stats(over) };
  return new Unit(def, x, z, FACING_E as Facing);
}

describe('Bomb catalog', () => {
  it('Bomb is a monster with a radius-1 / 35-damage death trigger', () => {
    const bomb = JOB_DEFS.bomb;
    expect(bomb.isMonster).toBe(true);
    expect(bomb.prereqs).toEqual([]);
    expect(bomb.learnableActives).toEqual([]);
    expect(bomb.deathTrigger).toEqual({ radius: 1, damage: 35 });
  });

  it('a fresh unit has deathTriggerFired = false', () => {
    expect(makeUnit('u', 'enemy', 0, 0).deathTriggerFired).toBe(false);
  });
});

describe('resolveDeathTrigger', () => {
  it('damages every alive unit within radius, both teams', () => {
    const bomb  = makeUnit('bomb', 'enemy',  2, 2, 'bomb');
    bomb.hp = 0; // KO'd — about to self-destruct
    const ally  = makeUnit('ally',  'enemy',  2, 3, 'x'); // adjacent — in blast
    const foe   = makeUnit('foe',   'player', 3, 2, 'x'); // adjacent — in blast
    const out = resolveDeathTrigger(bomb, 1, 35, [bomb, ally, foe]);
    expect(out.victims.map(v => v.unit.id).sort()).toEqual(['ally', 'foe']);
    expect(ally.hp).toBe(65);
    expect(foe.hp).toBe(65);
  });

  it('spares units outside the radius and the bomb itself', () => {
    const bomb = makeUnit('bomb', 'enemy', 2, 2, 'bomb');
    bomb.hp = 0;
    const far  = makeUnit('far', 'player', 5, 5, 'x'); // well outside radius 1
    const out = resolveDeathTrigger(bomb, 1, 35, [bomb, far]);
    expect(out.victims).toHaveLength(0);
    expect(far.hp).toBe(far.hpMax);
  });

  it('sets the deathTriggerFired guard so it fires only once', () => {
    const bomb = makeUnit('bomb', 'enemy', 2, 2, 'bomb');
    bomb.hp = 0;
    const foe  = makeUnit('foe', 'player', 2, 3, 'x');
    resolveDeathTrigger(bomb, 1, 35, [bomb, foe]);
    expect(bomb.deathTriggerFired).toBe(true);
  });

  it('a Reraise victim survives the blast (composes with applyDamage)', () => {
    const bomb = makeUnit('bomb', 'enemy', 2, 2, 'bomb');
    bomb.hp = 0;
    const frail = makeUnit('frail', 'player', 2, 3, 'x', { hp: 10 });
    frail.hpMax = 100;
    frail.hp = 10;
    frail.addStatus('reraise');
    const out = resolveDeathTrigger(bomb, 1, 35, [bomb, frail]);
    expect(out.victims[0].reraised).toBe(true);
    expect(frail.isAlive).toBe(true);
  });

  it('a chained Bomb caught in the blast is itself a valid trigger source', () => {
    const bomb1 = makeUnit('bomb1', 'enemy', 2, 2, 'bomb');
    bomb1.hp = 0;
    const bomb2 = makeUnit('bomb2', 'enemy', 2, 3, 'bomb', { hp: 20 });
    bomb2.hp = 20;
    resolveDeathTrigger(bomb1, 1, 35, [bomb1, bomb2]);
    // bomb2 took 35 → KO'd, and still carries its own (unfired) death trigger.
    expect(bomb2.isAlive).toBe(false);
    expect(bomb2.deathTriggerFired).toBe(false);
    expect(JOB_DEFS[bomb2.jobId].deathTrigger).toBeDefined();
  });
});
