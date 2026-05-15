import { describe, it, expect } from 'vitest';
import { ABILITIES } from '../../src/data/abilities';
import { JOB_DEFS } from '../../src/data/jobs';
import { STATUS_DEFS } from '../../src/data/statuses';

describe('Charm status + ability', () => {
  it('Charm lasts 24 ticks', () => {
    expect(STATUS_DEFS.charm.expiry).toEqual({ kind: 'duration', ticks: 24 });
  });

  it('Mediator learns Charm', () => {
    expect(JOB_DEFS.mediator.learnableActives).toContain('charm');
  });

  it('Charm inflicts the charm status on enemies', () => {
    const ab = ABILITIES.charm;
    expect(ab.range).toBe(4);
    expect(ab.type).toBe('magical');
    if (ab.effect.kind !== 'inflict-status') throw new Error('bad fixture');
    expect(ab.effect.statusId).toBe('charm');
    expect(ab.effect.targetTeam).toBe('enemy');
  });

  it('Esuna / Remedy / Stigma Magic cure charm', () => {
    for (const id of ['esuna', 'remedy', 'stigma_magic']) {
      const eff = ABILITIES[id].effect;
      if (eff.kind !== 'cure-status') throw new Error('bad fixture');
      expect(eff.statuses).toContain('charm');
    }
  });
});
