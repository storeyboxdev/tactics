import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import { BattleMap, MapData } from '../../src/battle/Map';
import {
  armorPhysicalFactor, armorMagicalFactor,
  effectiveDefenseFactor, resolveAttack, resolveSpell,
} from '../../src/battle/ActionResolver';
import { JOB_DEFS } from '../../src/data/jobs';
import { ARMOR } from '../../src/data/armor';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 9999, mp: 30, pa: 10, ma: 10, speed: 10, move: 4, jump: 1,
  faith: 100, bravery: 50, evasion: 0,
  ...over,
});

function makeUnit(id: string, team: Team, jobId: string, x = 0, z = 0, facing: Facing = FACING_E, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = { id, name: id, team, jobId, level: 1, stats: stats(over) };
  return new Unit(def, x, z, facing);
}

function flatMap(width: number, depth: number, h = 1): MapData {
  const heights: number[][] = [];
  for (let z = 0; z < depth; z++) heights.push(Array(width).fill(h));
  return { name: 'flat', width, height: depth, heights, spawns: { player: [], enemy: [] } };
}

describe('Armor catalog', () => {
  it('every job declares an armor that exists in ARMOR', () => {
    for (const job of Object.values(JOB_DEFS)) {
      expect(job.armor, `${job.id} armor`).toBeTruthy();
      expect(ARMOR[job.armor], `${job.id} → ${job.armor}`).toBeDefined();
    }
  });

  it('heavy armor blocks physical best; robe blocks magic best', () => {
    expect(ARMOR.heavy_armor.physicalFactor).toBeLessThan(ARMOR.robe.physicalFactor);
    expect(ARMOR.robe.magicalFactor).toBeLessThan(ARMOR.heavy_armor.magicalFactor);
  });
});

describe('armor factor helpers', () => {
  it('resolve a real job to its armor factors', () => {
    const knight = makeUnit('k', 'player', 'knight');
    expect(armorPhysicalFactor(knight)).toBe(ARMOR.heavy_armor.physicalFactor);
    expect(armorMagicalFactor(knight)).toBe(ARMOR.heavy_armor.magicalFactor);
  });

  it('fall back to 1.0 for an unknown job', () => {
    const u = makeUnit('u', 'player', 'x');
    expect(armorPhysicalFactor(u)).toBe(1);
    expect(armorMagicalFactor(u)).toBe(1);
  });

  it('equipped armor overrides the job signature', () => {
    const bm = makeUnit('m', 'player', 'black_mage'); // job armor: robe
    bm.armorId = 'heavy_armor';
    expect(armorPhysicalFactor(bm)).toBe(ARMOR.heavy_armor.physicalFactor);
    expect(armorMagicalFactor(bm)).toBe(ARMOR.heavy_armor.magicalFactor);
  });

  it('an unknown equipped armor id falls back to the job signature', () => {
    const knight = makeUnit('k', 'player', 'knight');
    knight.armorId = 'no_such_armor';
    expect(armorPhysicalFactor(knight)).toBe(ARMOR.heavy_armor.physicalFactor);
    expect(armorMagicalFactor(knight)).toBe(ARMOR.heavy_armor.magicalFactor);
  });

  it('effectiveDefenseFactor stacks armor x Defense Up multiplicatively', () => {
    const knight = makeUnit('k', 'player', 'knight');
    knight.support = 'defense_up'; // 0.75
    // heavy armor 0.78 * Defense Up 0.75
    expect(effectiveDefenseFactor(knight)).toBeCloseTo(0.78 * 0.75, 5);
  });
});

describe('Damage varies by job armor', () => {
  it('a Knight takes less physical than a Black Mage from the same hit', () => {
    const map = new BattleMap(flatMap(6, 5));
    const attacker = makeUnit('a', 'enemy', 'x', 1, 2, FACING_E, { pa: 20 });
    const knight = makeUnit('k', 'player', 'knight', 2, 2, FACING_W);
    const a2 = makeUnit('a2', 'enemy', 'x', 1, 2, FACING_E, { pa: 20 });
    const bm = makeUnit('m', 'player', 'black_mage', 2, 2, FACING_W);
    const knightHit = resolveAttack(attacker, knight, map, () => 0.5);
    const bmHit     = resolveAttack(a2, bm, map, () => 0.5);
    expect(knightHit.damage).toBeLessThan(bmHit.damage);
  });

  it('a Black Mage takes less magic than a Knight from the same spell', () => {
    const caster = makeUnit('c', 'enemy', 'x', 0, 0, FACING_E, { ma: 10, faith: 100 });
    const knight = makeUnit('k', 'player', 'knight', 1, 0, FACING_W, { faith: 100 });
    const bm     = makeUnit('m', 'player', 'black_mage', 1, 0, FACING_W, { faith: 100 });
    const knightHit = resolveSpell(caster, knight, 16, () => 0.5);
    const bmHit     = resolveSpell(caster, bm, 16, () => 0.5);
    expect(bmHit.damage).toBeLessThan(knightHit.damage);
  });
});
