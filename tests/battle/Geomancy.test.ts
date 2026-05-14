import { describe, it, expect } from 'vitest';
import { ABILITIES } from '../../src/data/abilities';
import { JOB_DEFS } from '../../src/data/jobs';

describe('Geomancer terrain-strike kit: schema gate', () => {
  it('requiresTerrain is optional and not set on existing abilities', () => {
    // Sample a handful — the gate must default to undefined / no restriction.
    expect(ABILITIES.pebble_blast.requiresTerrain).toBeUndefined();
    expect(ABILITIES.fire.requiresTerrain).toBeUndefined();
    expect(ABILITIES.cure.requiresTerrain).toBeUndefined();
    expect(ABILITIES.power_break.requiresTerrain).toBeUndefined();
  });
});

describe('Water Ball (water) + Will-O-Wisp (sand)', () => {
  it('Geomancer learns Water Ball and Will-O-Wisp', () => {
    const geo = JOB_DEFS.geomancer.learnableActives;
    expect(geo).toContain('water_ball');
    expect(geo).toContain('will_o_wisp');
  });

  it('Water Ball is water-gated, water-elemental', () => {
    const ab = ABILITIES.water_ball;
    expect(ab.requiresTerrain).toEqual(['water']);
    if (ab.effect.kind !== 'magic-damage') throw new Error('bad fixture');
    expect(ab.effect.element).toBe('water');
  });

  it('Will-O-Wisp is sand-gated, fire-elemental', () => {
    const ab = ABILITIES.will_o_wisp;
    expect(ab.requiresTerrain).toEqual(['sand']);
    if (ab.effect.kind !== 'magic-damage') throw new Error('bad fixture');
    expect(ab.effect.element).toBe('fire');
  });

  it('Geomancer has a strike for every terrain plus the catch-all', () => {
    const geo = JOB_DEFS.geomancer.learnableActives;
    expect(geo).toEqual([
      'pebble_blast', 'hell_ivy', 'local_quake', 'wind_slash', 'water_ball', 'will_o_wisp',
    ]);
  });
});

describe('Wind Slash (stone)', () => {
  it('Geomancer learns Wind Slash', () => {
    expect(JOB_DEFS.geomancer.learnableActives).toContain('wind_slash');
  });

  it('Wind Slash is a stone-gated non-elemental strike', () => {
    const ab = ABILITIES.wind_slash;
    expect(ab.requiresTerrain).toEqual(['stone']);
    expect(ab.range).toBe(4);
    if (ab.effect.kind !== 'magic-damage') throw new Error('bad fixture');
    expect(ab.effect.element).toBeUndefined();
  });
});

describe('Local Quake (dirt)', () => {
  it('Geomancer learns Local Quake', () => {
    expect(JOB_DEFS.geomancer.learnableActives).toContain('local_quake');
  });

  it('Local Quake is a self-centered dirt-gated AoE earth strike', () => {
    const ab = ABILITIES.local_quake;
    expect(ab.requiresTerrain).toEqual(['dirt']);
    expect(ab.range).toBe(0);
    expect(ab.area?.radius).toBe(1);
    if (ab.effect.kind !== 'magic-damage') throw new Error('bad fixture');
    expect(ab.effect.element).toBe('earth');
  });
});

describe('Hell Ivy (grass)', () => {
  it('Geomancer learns Hell Ivy alongside Pebble Blast', () => {
    const geo = JOB_DEFS.geomancer.learnableActives;
    expect(geo).toContain('pebble_blast');
    expect(geo).toContain('hell_ivy');
  });

  it('Hell Ivy is a grass-gated earth strike with chained Don\'t Move', () => {
    const ab = ABILITIES.hell_ivy;
    expect(ab.requiresTerrain).toEqual(['grass']);
    expect(ab.range).toBe(4);
    expect(ab.mpCost).toBe(0);
    expect(ab.chargeTime).toBe(0);
    if (ab.effect.kind !== 'damage-and-status') throw new Error('bad fixture');
    expect(ab.effect.element).toBe('earth');
    expect(ab.effect.statusId).toBe('dont_move');
  });
});
