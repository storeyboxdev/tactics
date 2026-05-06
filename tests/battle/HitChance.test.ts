import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import {
  physicalHitChance, magicStatusHitChance, rollHit, WEAPON_ACCURACY,
} from '../../src/battle/ActionResolver';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 0, pa: 5, ma: 8, speed: 8, move: 4, jump: 1,
  faith: 50, bravery: 50, evasion: 10,
  ...over,
});

function makeUnit(id: string, team: Team, x: number, z: number, facing: Facing, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = { id, name: id, team, jobId: 'x', level: 1, stats: stats(over) };
  return new Unit(def, x, z, facing);
}

describe('physicalHitChance', () => {
  it('= weaponAcc - evasion + facingBonus, clamped to [0, 100]', () => {
    const target = makeUnit('t', 'enemy', 0, 0, FACING_E, { evasion: 5 });
    expect(physicalHitChance(target, 'front')).toBe(WEAPON_ACCURACY - 5);       // 90
    expect(physicalHitChance(target, 'side')).toBe(WEAPON_ACCURACY - 5 + 10);   // 100
    expect(physicalHitChance(target, 'back')).toBe(100);                        // clamped from 110
  });

  it('high evasion (Thief) drops front-hit to 70, back still 90', () => {
    const thief = makeUnit('t', 'enemy', 0, 0, FACING_E, { evasion: 25 });
    expect(physicalHitChance(thief, 'front')).toBe(70);
    expect(physicalHitChance(thief, 'side')).toBe(80);
    expect(physicalHitChance(thief, 'back')).toBe(90);
  });

  it('clamps absurd evasion to 0%', () => {
    const phantom = makeUnit('p', 'enemy', 0, 0, FACING_E, { evasion: 200 });
    expect(physicalHitChance(phantom, 'front')).toBe(0);
    expect(physicalHitChance(phantom, 'back')).toBe(0);
  });
});

describe('magicStatusHitChance', () => {
  it('= baseAcc × cFaith/100 × tFaith/100, clamped to [0,100]', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { faith: 70 });
    const t = makeUnit('t', 'enemy',  0, 0, FACING_W, { faith: 70 });
    expect(magicStatusHitChance(c, t, 140)).toBe(Math.floor(140 * 0.7 * 0.7)); // 68
  });

  it('clamps high product to 100', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { faith: 100 });
    const t = makeUnit('t', 'enemy',  0, 0, FACING_W, { faith: 100 });
    expect(magicStatusHitChance(c, t, 200)).toBe(100);
  });

  it('faith 50/50 at baseAcc 100 yields 25', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { faith: 50 });
    const t = makeUnit('t', 'enemy',  0, 0, FACING_W, { faith: 50 });
    expect(magicStatusHitChance(c, t, 100)).toBe(25);
  });
});

describe('rollHit', () => {
  it('chance=70: rng 0.69 lands, 0.71 misses', () => {
    expect(rollHit(70, () => 0.69)).toBe(true);
    expect(rollHit(70, () => 0.71)).toBe(false);
  });

  it('chance >= 100 always lands without consuming the rng', () => {
    let consumed = false;
    expect(rollHit(100, () => { consumed = true; return 0; })).toBe(true);
    expect(consumed).toBe(false);
    expect(rollHit(150, () => { consumed = true; return 0; })).toBe(true);
    expect(consumed).toBe(false);
  });

  it('chance <= 0 always misses without consuming the rng', () => {
    let consumed = false;
    expect(rollHit(0, () => { consumed = true; return 0; })).toBe(false);
    expect(consumed).toBe(false);
    expect(rollHit(-50, () => { consumed = true; return 0; })).toBe(false);
    expect(consumed).toBe(false);
  });
});
