import { describe, it, expect } from 'vitest';
import { learnedActivesInJob, learn, awardJp } from '../../src/battle/Progression';
import { bootstrapUnit } from '../../src/core/Bootstrap';

/**
 * Secondary Command's contract is small: in battle, a unit's available
 * actives are the union of `learnedActivesInJob(progression, primary)` and
 * `learnedActivesInJob(progression, secondary)`. The composition is done in
 * main.ts so this test verifies the building block.
 */
describe('Secondary Command — learned-actives composition', () => {
  it('a Knight with Black Mage secondary surfaces both kits once both are learned', () => {
    const u = bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'knight' });
    // Bootstrap pre-learns the starting (primary) job's actives.
    expect(learnedActivesInJob(u.progression, 'knight')).toEqual(['power_break', 'speed_break', 'magic_break', 'stasis_sword']);
    // Black Mage isn't unlocked yet — even with JP, can't learn its skills.
    awardJp(u.progression, 'black_mage', 200);
    expect(learn(u.progression, 'black_mage', 'fire')).toBe(false);
    // Unlock and learn the path the player would take in real play.
    u.progression.jobs.black_mage = { jp: 200, unlocked: true, learnedAbilities: [] };
    expect(learn(u.progression, 'black_mage', 'fire')).toBe(true);
    // With Black Mage as secondary, the player sees Fire alongside the
    // Knight's Breaks.
    u.secondaryJobId = 'black_mage';
    const primary   = learnedActivesInJob(u.progression, u.jobId);
    const secondary = u.secondaryJobId
      ? learnedActivesInJob(u.progression, u.secondaryJobId)
      : [];
    expect(primary).toEqual(['power_break', 'speed_break', 'magic_break', 'stasis_sword']);
    expect(secondary).toEqual(['fire']);
  });

  it('secondary contributes only LEARNED actives, not the whole learnable list', () => {
    const u = bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'squire' });
    // Unlock Black Mage with full learnableActives but learn nothing.
    u.progression.jobs.black_mage = { jp: 0, unlocked: true, learnedAbilities: [] };
    u.secondaryJobId = 'black_mage';
    expect(learnedActivesInJob(u.progression, 'black_mage')).toEqual([]);
  });

  it('a unit can have no secondary (secondaryJobId === null) — caller adds no group', () => {
    const u = bootstrapUnit({ id: 'p1', name: 'P1', jobId: 'knight' });
    expect(u.secondaryJobId).toBeNull();
  });
});
