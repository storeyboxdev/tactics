import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import { BattleMap, MapData } from '../../src/battle/Map';
import {
  physicalHitChance, physicalHitChanceFrom, resolveAttack,
} from '../../src/battle/ActionResolver';
import { JOB_DEFS } from '../../src/data/jobs';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 200, mp: 30, pa: 14, ma: 10, speed: 10, move: 4, jump: 1,
  faith: 50, bravery: 50, evasion: 0,
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

describe('Concentrate support', () => {
  it('physicalHitChanceFrom forces 100 for a Concentrate attacker', () => {
    const attacker = makeUnit('a', 'player');
    attacker.support = 'concentrate';
    const dodgy = makeUnit('t', 'enemy', 1, 0, FACING_W, { evasion: 60 });
    expect(physicalHitChanceFrom(attacker, dodgy, 'front')).toBe(100);
  });

  it('physicalHitChanceFrom uses the normal formula without the support', () => {
    const attacker = makeUnit('a', 'player');
    const dodgy = makeUnit('t', 'enemy', 1, 0, FACING_W, { evasion: 60 });
    expect(physicalHitChanceFrom(attacker, dodgy, 'front'))
      .toBe(physicalHitChance(dodgy, 'front'));
  });

  it('a Concentrate attacker never misses a high-evasion target', () => {
    const map = new BattleMap(flatMap(5, 5));
    const attacker = makeUnit('a', 'player', 1, 1, FACING_E, { pa: 14 });
    attacker.support = 'concentrate';
    const dodgy = makeUnit('t', 'enemy', 2, 1, FACING_W, { evasion: 90, hp: 999 });
    // rng 0.999 would normally miss a 90-evasion target; Concentrate forces hit.
    const out = resolveAttack(attacker, dodgy, map, () => 0.999, false);
    expect(out.hit).toBe(true);
  });

  it('Archer learns Concentrate', () => {
    expect(JOB_DEFS.archer.learnableSupports).toContain('concentrate');
  });
});

describe('Regenerator reaction', () => {
  it('a unit with Regenerator gains Regen after taking damage', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 100 });
    u.reaction = 'regenerator';
    const r = u.applyDamage(20);
    expect(r.regenApplied).toBe(true);
    expect(u.hasStatus('regen')).toBe(true);
  });

  it('does not apply Regen when the damage was lethal', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 10 });
    u.reaction = 'regenerator';
    const r = u.applyDamage(999);
    expect(r.regenApplied).toBe(false);
    expect(u.isAlive).toBe(false);
  });

  it('a unit without the reaction gains nothing', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 100 });
    const r = u.applyDamage(20);
    expect(r.regenApplied).toBe(false);
    expect(u.hasStatus('regen')).toBe(false);
  });

  it('Monk learns Regenerator', () => {
    expect(JOB_DEFS.monk.learnableReactions).toContain('regenerator');
  });
});
