import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import { BattleMap, MapData } from '../../src/battle/Map';
import {
  effectiveWeaponPower, resolveAttack, predictAttackDamage, PLACEHOLDER_WEAPON_POWER,
} from '../../src/battle/ActionResolver';
import { JOB_DEFS } from '../../src/data/jobs';
import { WEAPONS, BONUS_WEAPON_IDS } from '../../src/data/weapons';

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

describe('Elemental weapons', () => {
  it('the elemental weapons are loot-tier — sold and lootable', () => {
    expect(BONUS_WEAPON_IDS).toEqual(
      expect.arrayContaining(['flame_sword', 'frost_dagger', 'thunder_spear']));
  });

  it("an ice weapon's Attack amplifies on an ice-weak target", () => {
    const map = new BattleMap(flatMap(6, 5));
    const atk = makeUnit('a', 'player', 'x', 0, 2, FACING_E, { pa: 8 });
    atk.weaponId = 'frost_dagger'; // ice
    // Bomb (ice-weak) and Goblin (neutral) both wear light_armor — only the
    // affinity differs.
    const bomb = makeUnit('bomb', 'enemy', 'bomb', 1, 2, FACING_E, { hp: 9999, evasion: 0 });
    const gob  = makeUnit('gob', 'enemy', 'goblin', 1, 2, FACING_E, { hp: 9999, evasion: 0 });
    const bombDmg = predictAttackDamage(atk, bomb, map).damage;
    const gobDmg  = predictAttackDamage(atk, gob, map).damage;
    expect(bombDmg).toBeGreaterThan(gobDmg);
    expect(bombDmg / gobDmg).toBeCloseTo(1.5, 1);
  });

  it("a fire weapon's Attack is halved against a fire-resistant target", () => {
    const map = new BattleMap(flatMap(6, 5));
    const atk = makeUnit('a', 'player', 'x', 0, 2, FACING_E, { pa: 8 });
    atk.weaponId = 'flame_sword'; // fire
    // Both targets wear a Mail (same physical factor); only the resisted
    // element differs.
    const fireRes = makeUnit('fr', 'enemy', 'x', 1, 2, FACING_E, { hp: 9999, evasion: 0 });
    fireRes.armorId = 'flame_mail';
    const iceRes = makeUnit('ir', 'enemy', 'x', 1, 2, FACING_E, { hp: 9999, evasion: 0 });
    iceRes.armorId = 'frost_mail';
    const frDmg = predictAttackDamage(atk, fireRes, map).damage;
    const irDmg = predictAttackDamage(atk, iceRes, map).damage;
    expect(frDmg).toBeLessThan(irDmg);
    expect(frDmg / irDmg).toBeCloseTo(0.5, 1);
  });

  it('a non-elemental weapon is unaffected by the target affinity', () => {
    const map = new BattleMap(flatMap(6, 5));
    const atk = makeUnit('a', 'player', 'x', 0, 2, FACING_E, { pa: 8 });
    atk.weaponId = 'mythril_sword'; // no element
    const bomb = makeUnit('bomb', 'enemy', 'bomb', 1, 2, FACING_E, { hp: 9999, evasion: 0 });
    const gob  = makeUnit('gob', 'enemy', 'goblin', 1, 2, FACING_E, { hp: 9999, evasion: 0 });
    expect(predictAttackDamage(atk, bomb, map).damage)
      .toBe(predictAttackDamage(atk, gob, map).damage);
  });

  it('resolveAttack applies the weapon element on the live path', () => {
    const map = new BattleMap(flatMap(6, 5));
    const atk = makeUnit('a', 'player', 'x', 0, 2, FACING_E, { pa: 8 });
    atk.weaponId = 'frost_dagger';
    const bomb = makeUnit('bomb', 'enemy', 'bomb', 1, 2, FACING_E, { hp: 9999, evasion: 0 });
    const gob  = makeUnit('gob', 'enemy', 'goblin', 1, 2, FACING_E, { hp: 9999, evasion: 0 });
    expect(resolveAttack(atk, bomb, map, () => 0.5).damage)
      .toBeGreaterThan(resolveAttack(atk, gob, map, () => 0.5).damage);
  });

  it('a fire weapon absorbed by the Bomb heals it instead of hurting', () => {
    const map = new BattleMap(flatMap(6, 5));
    const atk = makeUnit('a', 'player', 'x', 0, 2, FACING_E, { pa: 8 });
    atk.weaponId = 'flame_sword'; // fire — the Bomb absorbs it
    const bomb = makeUnit('bomb', 'enemy', 'bomb', 1, 2, FACING_E, { hp: 60, evasion: 0 });
    bomb.applyDamage(40); // hp 20 — room to heal
    const out = resolveAttack(atk, bomb, map, () => 0.5);
    expect(out.damage).toBe(0);
    expect(out.absorbed).toBeGreaterThan(0);
    expect(bomb.hp).toBeGreaterThan(20);
  });

  it('an absorbed attack provokes no Counter', () => {
    const map = new BattleMap(flatMap(6, 5));
    const atk = makeUnit('a', 'player', 'x', 0, 2, FACING_E, { pa: 8, hp: 100 });
    atk.weaponId = 'flame_sword';
    const bomb = makeUnit('bomb', 'enemy', 'bomb', 1, 2, FACING_E, { hp: 60, evasion: 0, bravery: 100 });
    bomb.applyDamage(40);
    bomb.reaction = 'counter';
    const out = resolveAttack(atk, bomb, map, () => 0.5);
    expect(out.absorbed).toBeGreaterThan(0);
    expect(out.counter).toBeUndefined();
    expect(atk.hp).toBe(100);
  });
});
