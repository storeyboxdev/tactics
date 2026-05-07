import { describe, it, expect } from 'vitest';
import { LastActionLog } from '../../src/battle/LastAction';

describe('LastActionLog', () => {
  it('starts empty for both teams', () => {
    const log = new LastActionLog();
    expect(log.get('player')).toBeNull();
    expect(log.get('enemy')).toBeNull();
  });

  it('records and retrieves the most recent action per team independently', () => {
    const log = new LastActionLog();
    log.record('player', 'fire', 3, 4);
    log.record('enemy', 'sleep', 1, 1);
    expect(log.get('player')).toEqual({ abilityId: 'fire', x: 3, z: 4 });
    expect(log.get('enemy')).toEqual({ abilityId: 'sleep', x: 1, z: 1 });
  });

  it('overwrites the previous entry for the same team', () => {
    const log = new LastActionLog();
    log.record('player', 'fire', 3, 4);
    log.record('player', 'cure', 5, 5);
    expect(log.get('player')).toEqual({ abilityId: 'cure', x: 5, z: 5 });
  });

  it('one team\'s action does not overwrite the other team\'s', () => {
    const log = new LastActionLog();
    log.record('player', 'fire', 3, 4);
    log.record('enemy', 'sleep', 1, 1);
    log.record('player', 'cure', 5, 5);
    expect(log.get('enemy')).toEqual({ abilityId: 'sleep', x: 1, z: 1 });
  });
});
