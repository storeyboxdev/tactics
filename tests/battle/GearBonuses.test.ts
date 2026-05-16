import { describe, it, expect } from 'vitest';
import { Unit, UnitDef, UnitStats } from '../../src/battle/Unit';
import { JOB_DEFS } from '../../src/data/jobs';
import { WEAPONS, BONUS_WEAPON_IDS } from '../../src/data/weapons';
import { ARMOR, BONUS_ARMOR_IDS } from '../../src/data/armor';
import { bootstrapUnit } from '../../src/core/Bootstrap';

function plainUnit(jobId: string, gear: { weaponId?: string; armorId?: string } = {}): Unit {
  const job = JOB_DEFS[jobId];
  const def: UnitDef = {
    id: 'u', name: 'u', team: 'player', jobId, level: 1,
    stats: { ...job.baseStats } as UnitStats,
    weaponId: gear.weaponId ?? null,
    armorId: gear.armorId ?? null,
  };
  return new Unit(def, 0, 0, 1);
}

function progressionUnit(jobId: string, weaponId?: string): Unit {
  const saved = bootstrapUnit({ id: 'p', name: 'P', jobId });
  const job = JOB_DEFS[jobId];
  const def: UnitDef = {
    id: saved.id, name: saved.name, team: 'player', jobId,
    level: saved.progression.totalLevel,
    stats: { ...job.baseStats } as UnitStats,
    progression: saved.progression,
    weaponId: weaponId ?? null,
    armorId: null,
  };
  return new Unit(def, 0, 0, 1);
}

describe('Gear stat bonuses', () => {
  it('a bonus weapon raises the wearer stat over signature gear', () => {
    const bare = plainUnit('black_mage');
    const armed = plainUnit('black_mage', { weaponId: 'flame_rod' });
    expect(armed.ma).toBe(bare.ma + 2);
  });

  it('bonus armor raises hpMax and current hp together', () => {
    const bare = plainUnit('knight');
    const armored = plainUnit('knight', { armorId: 'chain_mail' });
    expect(armored.hpMax).toBe(bare.hpMax + 12);
    expect(armored.hp).toBe(bare.hp + 12);
  });

  it('weapon and armor bonuses stack', () => {
    const u = plainUnit('knight', { weaponId: 'mythril_sword', armorId: 'chain_mail' });
    const bare = plainUnit('knight');
    expect(u.pa).toBe(bare.pa + 1);
    expect(u.hpMax).toBe(bare.hpMax + 12);
  });

  it('signature gear carries no bonus — base stats are untouched', () => {
    const u = plainUnit('knight'); // Sword + Heavy Armor, both bonus-free
    const base = JOB_DEFS.knight.baseStats;
    expect(u.pa).toBe(base.pa);
    expect(u.ma).toBe(base.ma);
    expect(u.hpMax).toBe(base.hp);
  });

  it('a progression-backed unit also receives gear bonuses', () => {
    const bare = progressionUnit('black_mage');
    const armed = progressionUnit('black_mage', 'flame_rod');
    expect(armed.ma).toBe(bare.ma + 2);
  });
});

describe('Loot-tier gear catalog', () => {
  it('the loot weapons carry the stated bonuses', () => {
    expect(WEAPONS.mythril_sword.bonuses).toEqual({ pa: 1 });
    expect(WEAPONS.flame_rod.bonuses).toEqual({ ma: 2 });
    expect(WEAPONS.hunting_bow.bonuses).toEqual({ speed: 1 });
  });

  it('the loot armor carry the stated bonuses', () => {
    expect(ARMOR.chain_mail.bonuses).toEqual({ hp: 12 });
    expect(ARMOR.silk_robe.bonuses).toEqual({ mp: 12 });
  });

  it('BONUS_WEAPON_IDS / BONUS_ARMOR_IDS list exactly the bonus-bearing gear', () => {
    expect([...BONUS_WEAPON_IDS].sort()).toEqual(
      ['flame_rod', 'flame_sword', 'frost_dagger', 'hunting_bow', 'mythril_sword', 'thunder_spear']);
    expect([...BONUS_ARMOR_IDS].sort()).toEqual(
      ['chain_mail', 'flame_mail', 'frost_mail', 'silk_robe', 'storm_mail']);
  });

  it('signature gear stays bonus-free', () => {
    expect(WEAPONS.sword.bonuses).toBeUndefined();
    expect(WEAPONS.claw.bonuses).toBeUndefined();
    expect(ARMOR.heavy_armor.bonuses).toBeUndefined();
    expect(ARMOR.robe.bonuses).toBeUndefined();
  });
});
