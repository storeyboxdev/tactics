import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import { resolveDamageAndStatus } from '../../src/battle/ActionResolver';
import { ABILITIES } from '../../src/data/abilities';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 30, pa: 5, ma: 8, speed: 8, move: 4, jump: 1,
  faith: 100, bravery: 50, evasion: 10,
  ...over,
});

function makeUnit(id: string, team: Team, x = 0, z = 0, facing: Facing = FACING_E, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = { id, name: id, team, jobId: 'x', level: 1, stats: stats(over) };
  return new Unit(def, x, z, facing);
}

// Damage roll uses 0.85 + rng()*0.30. Status roll uses rng() * 100 < chance.
// rng()=0 → minimum damage multiplier (0.85), status always lands (0 < chance).
// rng()=0.999 → maximum damage multiplier (~1.15), status always misses.
const rngHit = () => 0;
const rngMiss = () => 0.999;

describe('resolveDamageAndStatus', () => {
  it('deals damage and applies the listed status when both rolls land', () => {
    const caster = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const target = makeUnit('t', 'enemy',  1, 0, FACING_W, { faith: 100 });
    const out = resolveDamageAndStatus(caster, target, 10, 'dont_move', 80, rngHit);
    expect(out.damage).toBeGreaterThan(0);
    expect(out.statusApplied).toBe(true);
    expect(target.hasStatus('dont_move')).toBe(true);
  });

  it('rolls damage and status independently — status can miss', () => {
    const caster = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const target = makeUnit('t', 'enemy',  1, 0, FACING_W, { faith: 100 });
    const out = resolveDamageAndStatus(caster, target, 10, 'dont_move', 0, rngMiss);
    expect(out.damage).toBeGreaterThan(0);
    expect(out.statusApplied).toBe(false);
    expect(target.hasStatus('dont_move')).toBe(false);
  });

  it('KO short-circuits — status not applied to a corpse', () => {
    const caster = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 16, faith: 100 });
    const target = makeUnit('t', 'enemy',  1, 0, FACING_W, { hp: 1, faith: 100 });
    const out = resolveDamageAndStatus(caster, target, 30, 'dont_move', 200, rngHit);
    expect(out.damage).toBeGreaterThan(0);
    expect(target.isAlive).toBe(false);
    expect(out.statusApplied).toBe(false);
    expect(target.hasStatus('dont_move')).toBe(false);
  });

  it('Auto-Potion fires on the damage component (alive after damage)', () => {
    const caster = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 4, faith: 50 });
    const target = makeUnit('t', 'enemy',  1, 0, FACING_W, { hp: 80, faith: 50 });
    target.hpMax = 100;
    target.reaction = 'auto_potion';
    const out = resolveDamageAndStatus(caster, target, 6, 'dont_move', 0, rngHit);
    expect(out.autoPotion).toBeDefined();
    expect(out.autoPotion!.amount).toBeGreaterThan(0);
  });
});

describe('Hell Ivy uses the damage-and-status kind', () => {
  it('Hell Ivy chains Don\'t Move on earth damage', () => {
    const eff = ABILITIES.hell_ivy.effect;
    if (eff.kind !== 'damage-and-status') throw new Error('bad fixture');
    expect(eff.element).toBe('earth');
    expect(eff.statusId).toBe('dont_move');
    expect(eff.spellPower).toBe(10);
  });
});
