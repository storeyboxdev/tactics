import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import {
  applyStatShift, computeSpellDamage,
} from '../../src/battle/ActionResolver';
import { abilityTargets } from '../../src/battle/Targeting';
import { ABILITIES } from '../../src/data/abilities';
import { BattleMap, MapData } from '../../src/battle/Map';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 30, pa: 5, ma: 8, speed: 8, move: 4, jump: 1,
  faith: 50, bravery: 50, evasion: 10,
  ...over,
});

function makeUnit(id: string, team: Team, x: number, z: number, facing: Facing, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = { id, name: id, team, jobId: 'x', level: 1, stats: stats(over) };
  return new Unit(def, x, z, facing);
}

function flatMap(width: number, depth: number, h = 1): MapData {
  const heights: number[][] = [];
  for (let z = 0; z < depth; z++) heights.push(Array(width).fill(h));
  return { name: 'flat', width, height: depth, heights, spawns: { player: [], enemy: [] } };
}

describe('applyStatShift', () => {
  it('shifts the live stat by `amount` and clamps to [1, 100]', () => {
    const med = makeUnit('m', 'player', 0, 0, FACING_E, { faith: 95 });
    const tgt = makeUnit('t', 'player', 1, 0, FACING_W, { faith: 95 });
    const out = applyStatShift(med, tgt, 'faith', 10);
    expect(out.before).toBe(95);
    expect(out.after).toBe(100); // clamped
    expect(tgt.faith).toBe(100);
  });

  it('floors at 1 (never zero)', () => {
    const med = makeUnit('m', 'player', 0, 0, FACING_E);
    const tgt = makeUnit('t', 'enemy', 1, 0, FACING_W, { faith: 3 });
    const out = applyStatShift(med, tgt, 'faith', -10);
    expect(out.after).toBe(1);
    expect(tgt.faith).toBe(1);
  });

  it('faith shift on a victim immediately changes magic damage they take', () => {
    // Same caster + spell. Lower target faith → less damage.
    const caster = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const tgt    = makeUnit('t', 'enemy',  0, 0, FACING_W, { faith: 100 });
    const before = computeSpellDamage({
      ma: caster.ma, spellPower: 14,
      casterFaith: caster.faith, targetFaith: tgt.faith,
      randomMul: 1.0,
    });
    applyStatShift(caster, tgt, 'faith', -50);
    const after = computeSpellDamage({
      ma: caster.ma, spellPower: 14,
      casterFaith: caster.faith, targetFaith: tgt.faith,
      randomMul: 1.0,
    });
    expect(after).toBeLessThan(before);
  });

  it('player-unit shifts sync to UnitProgression so they survive between battles', () => {
    const fakeProgression = {
      exp: 0, totalLevel: 1,
      rawHp: 50, rawMp: 10, rawPa: 5, rawMa: 5, rawSp: 10,
      faith: 50, bravery: 50,
      jobs: {} as Record<string, never>,
    };
    const def: UnitDef = {
      id: 'p1', name: 'P1', team: 'player', jobId: 'squire', level: 1,
      stats: stats({ faith: 50, bravery: 50 }),
      progression: fakeProgression,
    };
    const u = new Unit(def, 0, 0, FACING_E);
    applyStatShift(u, u, 'bravery', 10);
    expect(u.bravery).toBe(60);
    expect(fakeProgression.bravery).toBe(60);
  });

  it('non-player target (no progression) only mutates the live stat', () => {
    const med = makeUnit('m', 'player', 0, 0, FACING_E);
    const enemy = makeUnit('e', 'enemy', 1, 0, FACING_W, { faith: 50 });
    expect(enemy.progression).toBeNull();
    applyStatShift(med, enemy, 'faith', -5);
    expect(enemy.faith).toBe(45);
    // No progression to assert against — test exists to confirm no crash.
  });
});

describe('Mediator targeting', () => {
  it('Praise (ally bravery+) sees the caster and adjacent allies; not enemies', () => {
    const map = new BattleMap(flatMap(7, 7));
    const med = makeUnit('m', 'player', 3, 3, FACING_E);
    const ally = makeUnit('al', 'player', 4, 3, FACING_W);
    const enemy = makeUnit('en', 'enemy', 2, 3, FACING_W);
    const tiles = abilityTargets(med, ABILITIES.praise, map, [med, ally, enemy]);
    const xs = tiles.map(t => `${t.x},${t.z}`);
    expect(xs).toContain('3,3');   // self
    expect(xs).toContain('4,3');   // ally
    expect(xs).not.toContain('2,3'); // enemy
  });

  it('Insult (enemy bravery-) sees only enemies', () => {
    const map = new BattleMap(flatMap(7, 7));
    const med = makeUnit('m', 'player', 3, 3, FACING_E);
    const ally = makeUnit('al', 'player', 4, 3, FACING_W);
    const enemy = makeUnit('en', 'enemy', 2, 3, FACING_W);
    const tiles = abilityTargets(med, ABILITIES.insult, map, [med, ally, enemy]);
    const xs = tiles.map(t => `${t.x},${t.z}`);
    expect(xs).toContain('2,3');
    expect(xs).not.toContain('4,3');
    expect(xs).not.toContain('3,3');
  });
});
