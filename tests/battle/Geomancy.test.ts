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

describe('Hell Ivy (grass)', () => {
  it('Geomancer learns Hell Ivy alongside Pebble Blast', () => {
    const geo = JOB_DEFS.geomancer.learnableActives;
    expect(geo).toContain('pebble_blast');
    expect(geo).toContain('hell_ivy');
  });

  it('Hell Ivy is a grass-gated earth strike', () => {
    const ab = ABILITIES.hell_ivy;
    expect(ab.requiresTerrain).toEqual(['grass']);
    expect(ab.range).toBe(4);
    expect(ab.mpCost).toBe(0);
    expect(ab.chargeTime).toBe(0);
    if (ab.effect.kind !== 'magic-damage') throw new Error('bad fixture');
    expect(ab.effect.element).toBe('earth');
  });
});
