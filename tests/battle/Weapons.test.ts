import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import { BattleMap, MapData } from '../../src/battle/Map';
import {
  effectiveWeaponPower, resolveAttack, PLACEHOLDER_WEAPON_POWER,
} from '../../src/battle/ActionResolver';
import { JOB_DEFS } from '../../src/data/jobs';
import { WEAPONS } from '../../src/data/weapons';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 30, pa: 8, ma: 8, speed: 10, move: 4, jump: 1,
  faith: 50, bravery: 50, evasion: 0,
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

describe('Weapon catalog', () => {
  it('every job declares a weapon that exists in WEAPONS', () => {
    for (const job of Object.values(JOB_DEFS)) {
      expect(job.weapon, `${job.id} weapon`).toBeTruthy();
      expect(WEAPONS[job.weapon], `${job.id} → ${job.weapon}`).toBeDefined();
    }
  });

  it('heavy weapons out-power caster weapons', () => {
    const heavy = ['sword', 'katana', 'spear', 'knuckle'];
    const caster = ['rod', 'staff', 'instrument', 'cloth'];
    const minHeavy = Math.min(...heavy.map(w => WEAPONS[w].weaponPower));
    const maxCaster = Math.max(...caster.map(w => WEAPONS[w].weaponPower));
    expect(minHeavy).toBeGreaterThan(maxCaster);
  });
});

describe('effectiveWeaponPower', () => {
  it('resolves a real job to its weapon WP', () => {
    const knight = makeUnit('k', 'player', 'knight');
    expect(effectiveWeaponPower(knight)).toBe(WEAPONS.sword.weaponPower);
    const bm = makeUnit('m', 'player', 'black_mage');
    expect(effectiveWeaponPower(bm)).toBe(WEAPONS.rod.weaponPower);
  });

  it('falls back to PLACEHOLDER_WEAPON_POWER for an unknown job', () => {
    const u = makeUnit('u', 'player', 'x'); // synthetic test job
    expect(effectiveWeaponPower(u)).toBe(PLACEHOLDER_WEAPON_POWER);
  });

  it('an equipped weapon overrides the job signature', () => {
    const bm = makeUnit('m', 'player', 'black_mage'); // job weapon: rod
    bm.weaponId = 'sword';
    expect(effectiveWeaponPower(bm)).toBe(WEAPONS.sword.weaponPower);
  });

  it('an unknown equipped weapon id falls back to the job signature', () => {
    const knight = makeUnit('k', 'player', 'knight');
    knight.weaponId = 'no_such_weapon';
    expect(effectiveWeaponPower(knight)).toBe(WEAPONS.sword.weaponPower);
  });
});

describe('Basic Attack varies by job weapon', () => {
  it('a Knight out-damages a Black Mage at equal PA', () => {
    const map = new BattleMap(flatMap(6, 5));
    const knight = makeUnit('k', 'player', 'knight', 1, 2, FACING_E, { pa: 8 });
    const bm     = makeUnit('m', 'player', 'black_mage', 1, 2, FACING_E, { pa: 8 });
    const t1 = makeUnit('t1', 'enemy', 'x', 2, 2, FACING_W, { hp: 9999, evasion: 0 });
    const t2 = makeUnit('t2', 'enemy', 'x', 2, 2, FACING_W, { hp: 9999, evasion: 0 });
    const knightHit = resolveAttack(knight, t1, map, () => 0.5);
    const bmHit     = resolveAttack(bm, t2, map, () => 0.5);
    expect(knightHit.damage).toBeGreaterThan(bmHit.damage);
  });

  it('an equipped heavier weapon raises basic-attack damage', () => {
    const map = new BattleMap(flatMap(6, 5));
    const bare  = makeUnit('a', 'player', 'black_mage', 1, 2, FACING_E, { pa: 8 });
    const armed = makeUnit('b', 'player', 'black_mage', 1, 2, FACING_E, { pa: 8 });
    armed.weaponId = 'sword';
    const t1 = makeUnit('t1', 'enemy', 'x', 2, 2, FACING_W, { hp: 9999, evasion: 0 });
    const t2 = makeUnit('t2', 'enemy', 'x', 2, 2, FACING_W, { hp: 9999, evasion: 0 });
    const bareHit  = resolveAttack(bare, t1, map, () => 0.5);
    const armedHit = resolveAttack(armed, t2, map, () => 0.5);
    expect(armedHit.damage).toBeGreaterThan(bareHit.damage);
  });
});
