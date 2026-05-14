import { describe, it, expect } from 'vitest';
import { ABILITIES } from '../../src/data/abilities';

describe('Geomancer terrain-strike kit: schema gate', () => {
  it('requiresTerrain is optional and not set on existing abilities', () => {
    // Sample a handful — the gate must default to undefined / no restriction.
    expect(ABILITIES.pebble_blast.requiresTerrain).toBeUndefined();
    expect(ABILITIES.fire.requiresTerrain).toBeUndefined();
    expect(ABILITIES.cure.requiresTerrain).toBeUndefined();
    expect(ABILITIES.power_break.requiresTerrain).toBeUndefined();
  });
});
