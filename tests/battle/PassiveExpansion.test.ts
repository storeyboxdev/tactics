import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import { BattleMap, MapData } from '../../src/battle/Map';
import { resolveAttack, resolveSpell } from '../../src/battle/ActionResolver';
import { ABILITIES } from '../../src/data/abilities';
import { JOB_DEFS } from '../../src/data/jobs';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 200, mp: 30, pa: 20, ma: 12, speed: 10, move: 4, jump: 1,
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

describe('Blade Grasp reaction', () => {
  it('a Brave-100 unit with Blade Grasp negates a resolved attack', () => {
    const map = new BattleMap(flatMap(5, 5));
    const attacker = makeUnit('a', 'player', 1, 1, FACING_E, { pa: 20 });
    const target   = makeUnit('t', 'enemy',  2, 1, FACING_W, { bravery: 100 });
    target.reaction = 'blade_grasp';
    // rng 0.5: hit (50<acc), no crit, randomMul mid; blade-grasp roll 0.5*100=50 < 100 → catch.
    const out = resolveAttack(attacker, target, map, () => 0.5, false);
    expect(out.bladeGrasp).toBe(true);
    expect(out.damage).toBe(0);
    expect(target.hp).toBe(target.hpMax);
  });

  it('a Brave-0 unit never catches', () => {
    const map = new BattleMap(flatMap(5, 5));
    const attacker = makeUnit('a', 'player', 1, 1, FACING_E, { pa: 20 });
    const target   = makeUnit('t', 'enemy',  2, 1, FACING_W, { bravery: 0 });
    target.reaction = 'blade_grasp';
    const out = resolveAttack(attacker, target, map, () => 0.5, false);
    expect(out.bladeGrasp).toBeFalsy();
    expect(out.damage).toBeGreaterThan(0);
  });

  it('a unit without the reaction is unaffected', () => {
    const map = new BattleMap(flatMap(5, 5));
    const attacker = makeUnit('a', 'player', 1, 1, FACING_E, { pa: 20 });
    const target   = makeUnit('t', 'enemy',  2, 1, FACING_W, { bravery: 100 });
    // no reaction equipped
    const out = resolveAttack(attacker, target, map, () => 0.5, false);
    expect(out.bladeGrasp).toBeFalsy();
    expect(out.damage).toBeGreaterThan(0);
  });

  it('does not catch magic damage', () => {
    const caster = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 12, faith: 100 });
    const target = makeUnit('t', 'enemy',  1, 0, FACING_W, { bravery: 100, faith: 100 });
    target.reaction = 'blade_grasp';
    const out = resolveSpell(caster, target, 14, () => 0.5);
    expect(out.damage).toBeGreaterThan(0); // magic ignores Blade Grasp
  });

  it('Samurai learns Blade Grasp', () => {
    expect(JOB_DEFS.samurai.learnableReactions).toContain('blade_grasp');
  });

  it('Blade Grasp is a passive reaction', () => {
    const ab = ABILITIES.blade_grasp;
    expect(ab.type).toBe('reaction');
    expect(ab.range).toBe(0);
    expect(ab.effect.kind).toBe('reaction-blade-grasp');
  });
});
