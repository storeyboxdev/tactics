import { describe, it, expect } from 'vitest';
import { BattleMap, MapData } from '../../src/battle/Map';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import {
  effectiveMa, predictSpellDamage, resolveSpell, resolveAttack,
} from '../../src/battle/ActionResolver';
import { MovePlan } from '../../src/battle/Movement';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 30, pa: 5, ma: 8, speed: 8, move: 4, jump: 1,
  faith: 50, bravery: 50, evasion: 10,
  ...over,
});

function makeUnit(id: string, team: Team, x: number, z: number, facing: Facing, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = { id, name: id, team, jobId: 'x', level: 1, stats: stats(over) };
  return new Unit(def, x, z, facing);
}

function flatMap(width: number, depth: number, h = 1): MapData {
  const heights: number[][] = [];
  for (let z = 0; z < depth; z++) heights.push(Array(width).fill(h));
  return { name: 'flat', width, height: depth, heights, spawns: { player: [], enemy: [] } };
}

const rngHalf = () => 0.5;

describe('Float', () => {
  it('lets a unit walk onto and through water tiles', () => {
    // Map has a single water row across the middle (height 0); land at top
    // and bottom (height 1). Without Float, BFS can't cross. With it, can.
    const data: MapData = {
      name: 'pond', width: 5, height: 5,
      heights: [
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
        [0, 0, 0, 0, 0],   // water row
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
      ],
      spawns: { player: [], enemy: [] },
    };
    const map = new BattleMap(data);
    const u = makeUnit('u', 'player', 2, 0, FACING_E, { move: 5 });

    // Without Float: BFS stops at the north shore.
    const planA = new MovePlan(u, map, [u]);
    const reachableA = planA.endTiles().map(t => `${t.x},${t.z}`);
    expect(reachableA).not.toContain('2,3'); // south shore
    expect(reachableA).not.toContain('2,2'); // water tile

    // With Float: water becomes passable, BFS reaches the south shore.
    u.movement = 'float';
    const planB = new MovePlan(u, map, [u]);
    const reachableB = planB.endTiles().map(t => `${t.x},${t.z}`);
    expect(reachableB).toContain('2,2'); // water tile is now standable
    expect(reachableB).toContain('2,3'); // south shore reachable
  });

  it('non-float movements (Move +1) do NOT bypass water', () => {
    const data: MapData = {
      name: 'pond', width: 5, height: 5,
      heights: [
        [1, 1, 1, 1, 1],
        [0, 0, 0, 0, 0],
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
      ],
      spawns: { player: [], enemy: [] },
    };
    const map = new BattleMap(data);
    const u = makeUnit('u', 'player', 2, 0, FACING_E, { move: 5 });
    u.movement = 'move_plus_1';
    const plan = new MovePlan(u, map, [u]);
    const reachable = plan.endTiles().map(t => `${t.x},${t.z}`);
    expect(reachable).not.toContain('2,2');
  });
});

describe('Defense Up', () => {
  it('reduces incoming melee damage by the support factor', () => {
    const map = new BattleMap(flatMap(5, 5));
    const baseTarget = makeUnit('t1', 'enemy', 2, 2, FACING_W, { hp: 999 });
    const armoredTarget = makeUnit('t2', 'enemy', 2, 2, FACING_W, { hp: 999 });
    armoredTarget.support = 'defense_up';

    const a1 = makeUnit('a1', 'player', 1, 2, FACING_E, { pa: 5 });
    const a2 = makeUnit('a2', 'player', 1, 2, FACING_E, { pa: 5 });

    const baseOut    = resolveAttack(a1, baseTarget,    map, rngHalf);
    const armoredOut = resolveAttack(a2, armoredTarget, map, rngHalf);

    expect(armoredOut.damage).toBeLessThan(baseOut.damage);
    expect(armoredOut.damage).toBeGreaterThan(0);
  });
});

describe('Jump +N', () => {
  it('Jump +1 lets the unit climb a height-2 step that base Jump 1 cannot', () => {
    // 5x5 map: south half height 1, central rim height 3, north half height 1.
    const data: MapData = {
      name: 'cliff', width: 5, height: 5,
      heights: [
        [1, 1, 1, 1, 1],
        [3, 3, 3, 3, 3],   // wall row — height-2 step from below
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
      ],
      spawns: { player: [], enemy: [] },
    };
    const map = new BattleMap(data);
    const u = makeUnit('u', 'player', 2, 2, FACING_E, { move: 5, jump: 1 });

    const planA = new MovePlan(u, map, [u]);
    expect(planA.endTiles().map(t => `${t.x},${t.z}`)).not.toContain('2,1');

    u.movement = 'jump_plus_1';
    const planB = new MovePlan(u, map, [u]);
    expect(planB.endTiles().map(t => `${t.x},${t.z}`)).toContain('2,1');
  });

  it('Jump +2 reaches a height-3 step that Jump +1 cannot', () => {
    const data: MapData = {
      name: 'cliff', width: 5, height: 5,
      heights: [
        [1, 1, 1, 1, 1],
        [4, 4, 4, 4, 4],   // 3-step rise
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
      ],
      spawns: { player: [], enemy: [] },
    };
    const map = new BattleMap(data);
    const u = makeUnit('u', 'player', 2, 2, FACING_E, { move: 5, jump: 1 });
    u.movement = 'jump_plus_1';
    const planA = new MovePlan(u, map, [u]);
    expect(planA.endTiles().map(t => `${t.x},${t.z}`)).not.toContain('2,1');
    u.movement = 'jump_plus_2';
    const planB = new MovePlan(u, map, [u]);
    expect(planB.endTiles().map(t => `${t.x},${t.z}`)).toContain('2,1');
  });
});

describe('Move +2', () => {
  it('expands the BFS reachable set further than Move +1', () => {
    const map = new BattleMap(flatMap(15, 15));
    const u1 = makeUnit('u1', 'player', 7, 7, FACING_E, { move: 4 });
    u1.movement = 'move_plus_1';
    const plan1 = new MovePlan(u1, map, [u1]);

    const u2 = makeUnit('u2', 'player', 7, 7, FACING_E, { move: 4 });
    u2.movement = 'move_plus_2';
    const plan2 = new MovePlan(u2, map, [u2]);

    expect(plan2.endTiles().length).toBeGreaterThan(plan1.endTiles().length);
  });
});

describe('HP Restore reaction', () => {
  it('fires when damage drops HP at or below the threshold percent', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 100 });
    u.reaction = 'hp_restore';
    // 100 → 20 hp via 80 damage. 20 ≤ 25% threshold → restore +25.
    const r = u.applyDamage(80);
    expect(r.dealt).toBe(80);
    expect(r.hpRestored).toBe(25);
    expect(u.hp).toBe(45);
  });

  it('does not fire if the unit is dropped to 0 in one shot', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 100 });
    u.reaction = 'hp_restore';
    const r = u.applyDamage(200);
    expect(u.hp).toBe(0);
    expect(r.hpRestored).toBe(0);
  });

  it('does not fire above the threshold', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 100 });
    u.reaction = 'hp_restore';
    // 100 → 50 hp via 50 damage. 50 > 25% threshold → no restore.
    const r = u.applyDamage(50);
    expect(r.hpRestored).toBe(0);
    expect(u.hp).toBe(50);
  });

  it('does not fire without the reaction equipped', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 100 });
    const r = u.applyDamage(80);
    expect(r.hpRestored).toBe(0);
    expect(u.hp).toBe(20);
  });
});

describe('Brave Up reaction', () => {
  it('raises bravery by the configured amount on every damage instance', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { bravery: 50 });
    u.reaction = 'brave_up';
    u.applyDamage(5);
    u.applyDamage(5);
    u.applyDamage(5);
    expect(u.bravery).toBe(53);
  });

  it('clamps at 100', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { bravery: 99 });
    u.reaction = 'brave_up';
    u.applyDamage(1);
    u.applyDamage(1);
    expect(u.bravery).toBe(100);
  });

  it('does not fire when the damage is zero / unit is dead', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { bravery: 50 });
    u.reaction = 'brave_up';
    u.applyDamage(0);
    expect(u.bravery).toBe(50);
    u.hp = 0;
    u.applyDamage(5);
    expect(u.bravery).toBe(50);
  });
});

describe('Magic Attack Up', () => {
  it('effectiveMa returns base MA for a unit with no support', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { ma: 8 });
    expect(effectiveMa(u)).toBe(8);
  });

  it('effectiveMa multiplies by the support factor when magic_attack_up is equipped', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { ma: 8 });
    u.support = 'magic_attack_up';
    // 8 × 1.25 = 10
    expect(effectiveMa(u)).toBe(10);
  });

  it('predictSpellDamage scales with the boosted MA', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const t = makeUnit('t', 'enemy',  1, 0, FACING_W, { faith: 100 });
    const baseline = predictSpellDamage(c, t, 14);
    c.support = 'magic_attack_up';
    const boosted  = predictSpellDamage(c, t, 14);
    expect(boosted.damage).toBeGreaterThan(baseline.damage);
  });

  it('resolveSpell deals more damage with magic_attack_up equipped', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const t = makeUnit('t', 'enemy',  1, 0, FACING_W, { hp: 999, faith: 100 });
    const baseline = resolveSpell(c, t, 14, rngHalf);
    t.hp = 999;
    c.support = 'magic_attack_up';
    const boosted = resolveSpell(c, t, 14, rngHalf);
    expect(boosted.damage).toBeGreaterThan(baseline.damage);
  });
});
