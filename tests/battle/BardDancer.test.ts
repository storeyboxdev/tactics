import { describe, it, expect } from 'vitest';
import { ABILITIES } from '../../src/data/abilities';
import { JOB_DEFS } from '../../src/data/jobs';

describe("Bard's party songs", () => {
  it('Bard learns four songs (Cheer / Angel / Battle / Magic)', () => {
    expect(JOB_DEFS.bard.learnableActives).toEqual([
      'cheer_song', 'angel_song', 'battle_song', 'magic_song',
    ]);
  });

  it('all songs share the self-centered radius-2 template', () => {
    for (const id of ['cheer_song', 'angel_song', 'battle_song', 'magic_song']) {
      const ab = ABILITIES[id];
      expect(ab.range).toBe(0);
      expect(ab.area?.radius).toBe(2);
      expect(ab.chargeTime).toBe(3);
      expect(ab.type).toBe('magical');
    }
  });

  it('Angel Song inflicts Regen on allies', () => {
    const eff = ABILITIES.angel_song.effect;
    if (eff.kind !== 'inflict-status') throw new Error('bad fixture');
    expect(eff.statusId).toBe('regen');
    expect(eff.targetTeam).toBe('ally');
  });

  it('Battle Song is a non-persistent +1 PA stat-shift on allies', () => {
    const eff = ABILITIES.battle_song.effect;
    if (eff.kind !== 'stat-shift') throw new Error('bad fixture');
    expect(eff.stat).toBe('pa');
    expect(eff.amount).toBe(1);
    expect(eff.targetTeam).toBe('ally');
    expect(eff.persistent).toBe(false);
  });

  it('Magic Song is a non-persistent +1 MA stat-shift on allies', () => {
    const eff = ABILITIES.magic_song.effect;
    if (eff.kind !== 'stat-shift') throw new Error('bad fixture');
    expect(eff.stat).toBe('ma');
    expect(eff.amount).toBe(1);
    expect(eff.persistent).toBe(false);
  });
});
