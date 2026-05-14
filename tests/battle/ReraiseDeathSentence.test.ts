import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import { BattleMap, MapData } from '../../src/battle/Map';
import { resolveAttack, resolveSpell } from '../../src/battle/ActionResolver';
import { TurnSystem } from '../../src/battle/TurnSystem';
import { ABILITIES } from '../../src/data/abilities';
import { JOB_DEFS } from '../../src/data/jobs';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 30, pa: 5, ma: 8, speed: 10, move: 4, jump: 1,
  faith: 100, bravery: 50, evasion: 0,
  ...over,
});

function makeUnit(id: string, team: Team, x = 0, z = 0, facing: Facing = FACING_E, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = { id, name: id, team, jobId: 'x', level: 1, stats: stats(over) };
  return new Unit(def, x, z, facing);
}

function flatMap(width: number, depth: number, h = 1): MapData {
  const heights: number[][] = [];
  for (let z = 0; z < depth; z++) heights.push(Array(width).fill(h));
  return { name: 'flat', width, height: depth, heights, spawns: { player: [], enemy: [] } };
}

describe('Reraise: applyDamage hook', () => {
  it('interrupts a would-KO and restores HP to ~10% hpMax', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 5 });
    u.hpMax = 100;
    u.hp = 5;
    u.addStatus('reraise');
    const result = u.applyDamage(999); // lethal
    expect(result.reraised).toBe(true);
    expect(u.isAlive).toBe(true);
    expect(u.hp).toBe(10); // ceil(100 * 0.10)
    expect(u.hasStatus('reraise')).toBe(false);
  });

  it('does not trigger on non-lethal damage', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 100 });
    u.addStatus('reraise');
    const result = u.applyDamage(20);
    expect(result.reraised).toBe(false);
    expect(u.hp).toBe(80);
    expect(u.hasStatus('reraise')).toBe(true);
  });

  it('damage event flows reraised through resolveAttack', () => {
    const map = new BattleMap(flatMap(5, 5));
    const attacker = makeUnit('a', 'player', 1, 1, FACING_E, { pa: 30 });
    const target   = makeUnit('t', 'enemy',  2, 1, FACING_W, { hp: 5 });
    target.hpMax = 100;
    target.hp = 5;
    target.addStatus('reraise');
    const out = resolveAttack(attacker, target, map, () => 0.5, false);
    expect(out.reraised).toBe(true);
    expect(target.isAlive).toBe(true);
  });

  it('damage event flows reraised through resolveSpell', () => {
    const caster = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 30, faith: 100 });
    const target = makeUnit('t', 'enemy',  1, 0, FACING_W, { hp: 5, faith: 100 });
    target.hpMax = 100;
    target.hp = 5;
    target.addStatus('reraise');
    const out = resolveSpell(caster, target, 20, () => 0.5);
    expect(out.reraised).toBe(true);
    expect(target.isAlive).toBe(true);
  });

  it('poison-tick KO triggers Reraise', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 1 });
    u.hpMax = 100;
    u.hp = 1;
    u.addStatus('poison');
    u.addStatus('reraise');
    // Fast partner ends ts.advance() after a single tick — that one
    // poison tick is the lethal one we want to test Reraise against.
    const partner = makeUnit('p', 'player', 1, 0, FACING_E, { speed: 1000 });
    const ts = new TurnSystem([u, partner]);
    ts.advance();
    expect(u.isAlive).toBe(true);
    expect(u.hp).toBeGreaterThan(0);
    expect(u.hasStatus('reraise')).toBe(false);
  });
});

describe('White Mage learns Reraise', () => {
  it('Reraise sits in White Mage learnableActives', () => {
    expect(JOB_DEFS.white_mage.learnableActives).toContain('reraise');
  });

  it('Reraise targets allies and inflicts reraise status', () => {
    const ab = ABILITIES.reraise;
    expect(ab.range).toBe(4);
    expect(ab.mpCost).toBe(20);
    expect(ab.chargeTime).toBe(3);
    if (ab.effect.kind !== 'inflict-status') throw new Error('bad fixture');
    expect(ab.effect.statusId).toBe('reraise');
    expect(ab.effect.targetTeam).toBe('ally');
  });
});
