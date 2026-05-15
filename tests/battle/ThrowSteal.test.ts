import { describe, it, expect } from 'vitest';
import { ABILITIES } from '../../src/data/abilities';
import { JOB_DEFS } from '../../src/data/jobs';

describe('Ninja Throw tier', () => {
  it('Ninja learns the straight throws', () => {
    const ninja = JOB_DEFS.ninja.learnableActives;
    expect(ninja).toContain('throw_shuriken');
    expect(ninja).toContain('throw_knife');
    expect(ninja).toContain('throw_spear');
  });

  it('Throw Knife out-ranges the shuriken but hits lighter', () => {
    const knife = ABILITIES.throw_knife;
    const shuriken = ABILITIES.throw_shuriken;
    expect(knife.range).toBeGreaterThan(shuriken.range);
    const k = knife.effect, s = shuriken.effect;
    if (k.kind !== 'physical-ranged-damage' || s.kind !== 'physical-ranged-damage') {
      throw new Error('bad fixture');
    }
    expect(k.weaponPower).toBeLessThan(s.weaponPower);
  });

  it('Throw Spear is the heaviest throw', () => {
    const spear = ABILITIES.throw_spear.effect;
    if (spear.kind !== 'physical-ranged-damage') throw new Error('bad fixture');
    for (const id of ['throw_shuriken', 'throw_knife']) {
      const e = ABILITIES[id].effect;
      if (e.kind !== 'physical-ranged-damage') throw new Error('bad fixture');
      expect(spear.weaponPower).toBeGreaterThan(e.weaponPower);
    }
  });

  it('all throws are free, instant physical actions', () => {
    for (const id of ['throw_shuriken', 'throw_knife', 'throw_spear']) {
      const ab = ABILITIES[id];
      expect(ab.type).toBe('physical');
      expect(ab.mpCost).toBe(0);
      expect(ab.chargeTime).toBe(0);
    }
  });
});

describe('Ninja special throws', () => {
  it('Ninja learns Throw Bomb and Poison Shuriken', () => {
    const ninja = JOB_DEFS.ninja.learnableActives;
    expect(ninja).toContain('throw_bomb');
    expect(ninja).toContain('poison_shuriken');
  });

  it('Throw Bomb is a radius-1 AoE ranged-physical', () => {
    const ab = ABILITIES.throw_bomb;
    expect(ab.area?.radius).toBe(1);
    expect(ab.effect.kind).toBe('physical-ranged-damage');
  });

  it('Poison Shuriken chains poison via physical-damage-and-status', () => {
    const eff = ABILITIES.poison_shuriken.effect;
    if (eff.kind !== 'physical-damage-and-status') throw new Error('bad fixture');
    expect(eff.statusId).toBe('poison');
    expect(eff.weaponPower).toBe(5);
  });
});

describe("Thief's Steal Heart", () => {
  it('Thief learns Mug and Steal Heart', () => {
    expect(JOB_DEFS.thief.learnableActives).toEqual(['mug', 'steal_heart']);
  });

  it('Steal Heart is a melee, physical, no-damage Charm', () => {
    const ab = ABILITIES.steal_heart;
    expect(ab.range).toBe(1);
    expect(ab.type).toBe('physical');
    if (ab.effect.kind !== 'inflict-status') throw new Error('bad fixture');
    expect(ab.effect.statusId).toBe('charm');
    expect(ab.effect.targetTeam).toBe('enemy');
  });
});
