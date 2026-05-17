import { describe, it, expect } from 'vitest';
import { Unit, UnitDef, UnitStats, FACING_E, Facing, Team } from '../../src/battle/Unit';
import { attackTargets } from '../../src/battle/Targeting';
import { WEAPONS } from '../../src/data/weapons';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 0, pa: 5, ma: 5, speed: 10, move: 4, jump: 1,
  faith: 50, bravery: 50, evasion: 0, ...over,
});

function makeUnit(id: string, team: Team, x: number, z: number, jobId = 'x'): Unit {
  const def: UnitDef = { id, name: id, team, jobId, level: 1, stats: stats() };
  return new Unit(def, x, z, FACING_E as Facing);
}

describe('attackTargets', () => {
  it('a melee weapon reaches only adjacent enemies', () => {
    const actor = makeUnit('a', 'player', 5, 5); // synthetic job → melee range 1
    const adj = makeUnit('adj', 'enemy', 6, 5);
    const far = makeUnit('far', 'enemy', 8, 5);
    const tiles = attackTargets(actor, [actor, adj, far]);
    expect(tiles).toContainEqual({ x: 6, z: 5 });
    expect(tiles).not.toContainEqual({ x: 8, z: 5 });
  });

  it('a Bow reaches enemies several tiles away', () => {
    const actor = makeUnit('a', 'player', 5, 5);
    actor.weaponId = 'bow'; // range 4
    const far = makeUnit('far', 'enemy', 8, 5); // 3 tiles away
    const tiles = attackTargets(actor, [actor, far]);
    expect(tiles).toContainEqual({ x: 8, z: 5 });
  });

  it('excludes allies, dead enemies, and enemies out of range', () => {
    const actor = makeUnit('a', 'player', 5, 5);
    actor.weaponId = 'bow'; // range 4
    const ally = makeUnit('ally', 'player', 6, 5);
    const dead = makeUnit('dead', 'enemy', 4, 5); dead.applyDamage(9999);
    const tooFar = makeUnit('tf', 'enemy', 5, 11); // 6 tiles away
    const valid = makeUnit('v', 'enemy', 7, 5); // 2 tiles away
    const tiles = attackTargets(actor, [actor, ally, dead, tooFar, valid]);
    expect(tiles).toContainEqual({ x: 7, z: 5 });
    expect(tiles).not.toContainEqual({ x: 6, z: 5 });  // ally
    expect(tiles).not.toContainEqual({ x: 4, z: 5 });  // dead
    expect(tiles).not.toContainEqual({ x: 5, z: 11 }); // out of range
  });
});

describe('weapon range data', () => {
  it('Bow and Gun reach beyond melee; a sword does not', () => {
    expect(WEAPONS.bow.range).toBeGreaterThan(1);
    expect(WEAPONS.gun.range).toBeGreaterThan(1);
    expect(WEAPONS.sword.range).toBeUndefined();
  });
});
