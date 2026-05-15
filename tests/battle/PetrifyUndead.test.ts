import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, Facing, Team,
} from '../../src/battle/Unit';
import { TurnSystem } from '../../src/battle/TurnSystem';
import { resolveHeal, resolveFlatHeal, resolveRevive } from '../../src/battle/ActionResolver';
import { ABILITIES } from '../../src/data/abilities';
import { JOB_DEFS } from '../../src/data/jobs';
import { STATUS_DEFS } from '../../src/data/statuses';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 30, pa: 8, ma: 8, speed: 10, move: 4, jump: 1,
  faith: 100, bravery: 50, evasion: 10,
  ...over,
});

function makeUnit(id: string, team: Team, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = { id, name: id, team, jobId: 'x', level: 1, stats: stats(over) };
  return new Unit(def, 0, 0, FACING_E as Facing);
}

/** Mirror of checkBattleEnd's team-standing predicate. */
function teamStanding(units: Unit[], team: Team): boolean {
  return units.some(u => u.team === team && u.isAlive && !u.hasStatus('petrify'));
}

describe('Petrify status', () => {
  it('is permanent and blocks the turn', () => {
    expect(STATUS_DEFS.petrify.expiry).toEqual({ kind: 'permanent' });
    expect(STATUS_DEFS.petrify.blocksTurn).toBe(true);
  });

  it('a petrified unit does not count toward its team standing', () => {
    const a = makeUnit('a', 'player');
    const b = makeUnit('b', 'player');
    const e = makeUnit('e', 'enemy');
    expect(teamStanding([a, b, e], 'player')).toBe(true);
    a.addStatus('petrify');
    expect(teamStanding([a, b, e], 'player')).toBe(true); // b still stands
    b.addStatus('petrify');
    expect(teamStanding([a, b, e], 'player')).toBe(false); // both petrified → down
  });

  it('a petrified unit is still alive (soft KO, not a real KO)', () => {
    const u = makeUnit('u', 'player');
    u.addStatus('petrify');
    expect(u.isAlive).toBe(true);
  });

  it('Oracle learns Petrify', () => {
    expect(JOB_DEFS.oracle.learnableActives).toContain('petrify');
  });

  it('Petrify inflicts the petrify status on enemies at a low baseAcc', () => {
    const ab = ABILITIES.petrify;
    if (ab.effect.kind !== 'inflict-status') throw new Error('bad fixture');
    expect(ab.effect.statusId).toBe('petrify');
    expect(ab.effect.targetTeam).toBe('enemy');
    expect(ab.effect.baseAccuracy).toBe(60);
  });

  it('Esuna / Remedy / Stigma Magic cure petrify', () => {
    for (const id of ['esuna', 'remedy', 'stigma_magic']) {
      const eff = ABILITIES[id].effect;
      if (eff.kind !== 'cure-status') throw new Error('bad fixture');
      expect(eff.statuses).toContain('petrify');
    }
  });
});

describe('Undead status', () => {
  it('resolveHeal damages an undead target instead of healing', () => {
    const caster = makeUnit('c', 'player', { ma: 10, faith: 100 });
    const target = makeUnit('t', 'enemy', { hp: 50, faith: 100 });
    target.hpMax = 100;
    target.hp = 50;
    target.addStatus('undead');
    const out = resolveHeal(caster, target, 14, () => 0.5);
    expect(out.undead).toBe(true);
    expect(out.amount).toBeGreaterThan(0);
    expect(target.hp).toBeLessThan(50);
  });

  it('resolveHeal heals a normal (non-undead) target', () => {
    const caster = makeUnit('c', 'player', { ma: 10, faith: 100 });
    const target = makeUnit('t', 'player', { hp: 50, faith: 100 });
    target.hpMax = 100;
    target.hp = 50;
    const out = resolveHeal(caster, target, 14, () => 0.5);
    expect(out.undead).toBeFalsy();
    expect(target.hp).toBeGreaterThan(50);
  });

  it('resolveFlatHeal flips the HP component on undead, leaves MP', () => {
    const u = makeUnit('u', 'enemy', { hp: 80, mp: 5 });
    u.hpMax = 100; u.hp = 80;
    u.mpMax = 30;  u.mp = 5;
    u.addStatus('undead');
    const out = resolveFlatHeal(u, u, 50, 20);
    expect(out.undead).toBe(true);
    expect(out.hpRestored).toBeLessThan(0);  // damage, reported negative
    expect(u.hp).toBeLessThan(80);
    expect(out.mpRestored).toBe(20);          // MP component unaffected
  });

  it('Regen ticks damage an undead unit', () => {
    const u = makeUnit('u', 'player', { hp: 60 });
    u.hpMax = 100; u.hp = 60;
    u.addStatus('regen');
    u.addStatus('undead');
    const fast = makeUnit('fast', 'player', { speed: 1000 });
    const ts = new TurnSystem([u, fast]);
    ts.advance();
    expect(u.hp).toBeLessThan(60); // Regen burned instead of healed
  });

  it('revive still restores HP on an undead unit (no flip)', () => {
    const caster = makeUnit('c', 'player');
    const target = makeUnit('t', 'player', { hp: 100 });
    target.hpMax = 100;
    target.hp = 0;
    target.addStatus('undead');
    const out = resolveRevive(caster, target, 50);
    expect(out.amount).toBeGreaterThan(0);
    expect(target.hp).toBeGreaterThan(0);
  });

  it('Oracle learns Zombie', () => {
    expect(JOB_DEFS.oracle.learnableActives).toContain('zombie');
  });

  it('Zombie inflicts the undead status on enemies', () => {
    const eff = ABILITIES.zombie.effect;
    if (eff.kind !== 'inflict-status') throw new Error('bad fixture');
    expect(eff.statusId).toBe('undead');
    expect(eff.targetTeam).toBe('enemy');
  });

  it('Esuna / Remedy / Stigma Magic cure undead', () => {
    for (const id of ['esuna', 'remedy', 'stigma_magic']) {
      const eff = ABILITIES[id].effect;
      if (eff.kind !== 'cure-status') throw new Error('bad fixture');
      expect(eff.statuses).toContain('undead');
    }
  });
});
