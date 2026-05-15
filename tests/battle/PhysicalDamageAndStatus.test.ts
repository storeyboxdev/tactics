import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import { BattleMap, MapData } from '../../src/battle/Map';
import { resolvePhysicalDamageAndStatus } from '../../src/battle/ActionResolver';
import { ABILITIES } from '../../src/data/abilities';
import { JOB_DEFS } from '../../src/data/jobs';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 30, pa: 12, ma: 8, speed: 10, move: 4, jump: 1,
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

// resolveRangedAttack rolls: hit (rng < hitChance/100), crit, randomMul.
// rng=0 → hit lands, crit per facing table, randomMul = 0.85; status rng=0 lands.
const rngHit = () => 0;
// rng=0.999 → physical hit misses when chance < 100.
const rngMiss = () => 0.999;

describe('resolvePhysicalDamageAndStatus', () => {
  it('deals damage and applies status when both rolls land', () => {
    const map = new BattleMap(flatMap(6, 5));
    const knight = makeUnit('k', 'player', 1, 2, FACING_E, { pa: 12, faith: 100 });
    const target = makeUnit('t', 'enemy',  3, 2, FACING_W, { hp: 9999, faith: 100, evasion: 0 });
    const out = resolvePhysicalDamageAndStatus(knight, target, 6, 'stop', 70, map, rngHit);
    expect(out.hit).toBe(true);
    expect(out.damage).toBeGreaterThan(0);
    expect(out.statusApplied).toBe(true);
    expect(target.hasStatus('stop')).toBe(true);
  });

  it('does not apply status on a missed physical hit', () => {
    const map = new BattleMap(flatMap(6, 5));
    const knight = makeUnit('k', 'player', 1, 2, FACING_E, { pa: 12 });
    // High evasion + miss-rng forces the physical hit to fail.
    const target = makeUnit('t', 'enemy', 3, 2, FACING_W, { hp: 9999, evasion: 50 });
    const out = resolvePhysicalDamageAndStatus(knight, target, 6, 'stop', 200, map, rngMiss);
    expect(out.hit).toBe(false);
    expect(out.statusApplied).toBe(false);
    expect(target.hasStatus('stop')).toBe(false);
  });

  it('KO short-circuits — status not applied to a corpse', () => {
    const map = new BattleMap(flatMap(6, 5));
    const knight = makeUnit('k', 'player', 1, 2, FACING_E, { pa: 99 });
    const target = makeUnit('t', 'enemy', 3, 2, FACING_W, { hp: 1, evasion: 0 });
    const out = resolvePhysicalDamageAndStatus(knight, target, 20, 'stop', 200, map, rngHit);
    expect(out.hit).toBe(true);
    expect(target.isAlive).toBe(false);
    expect(out.statusApplied).toBe(false);
  });

  it('Reraise propagates through the new resolver', () => {
    const map = new BattleMap(flatMap(6, 5));
    const knight = makeUnit('k', 'player', 1, 2, FACING_E, { pa: 99 });
    const target = makeUnit('t', 'enemy', 3, 2, FACING_W, { hp: 5, evasion: 0 });
    target.hpMax = 100;
    target.hp = 5;
    target.addStatus('reraise');
    const out = resolvePhysicalDamageAndStatus(knight, target, 20, 'stop', 0, map, rngHit);
    expect(out.reraised).toBe(true);
    expect(target.isAlive).toBe(true);
  });
});

describe('Knight Sword Skill catalog', () => {
  it('Knight learns Stasis Sword', () => {
    expect(JOB_DEFS.knight.learnableActives).toContain('stasis_sword');
  });

  it('Stasis Sword is a ranged physical-damage-and-status with Stop', () => {
    const ab = ABILITIES.stasis_sword;
    expect(ab.range).toBe(3);
    expect(ab.type).toBe('physical');
    if (ab.effect.kind !== 'physical-damage-and-status') throw new Error('bad fixture');
    expect(ab.effect.statusId).toBe('stop');
    expect(ab.effect.weaponPower).toBe(6);
  });
});
