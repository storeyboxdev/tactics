import { describe, it, expect } from 'vitest';
import { BattleMap, MapData } from '../../src/battle/Map';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import { resolveRevive } from '../../src/battle/ActionResolver';
import { abilityTargets, unitAtAny } from '../../src/battle/Targeting';
import { ABILITIES } from '../../src/data/abilities';

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

describe('resolveRevive', () => {
  it('restores a KO\'d ally to floor(hpMax * hpPercent / 100)', () => {
    const wm = makeUnit('wm', 'player', 0, 0, FACING_E);
    const ko = makeUnit('p2', 'player', 1, 0, FACING_W, { hp: 100 });
    ko.hp = 0;
    expect(ko.isAlive).toBe(false);
    const out = resolveRevive(wm, ko, 50);
    expect(out.amount).toBe(50);
    expect(ko.hp).toBe(50);
    expect(ko.isAlive).toBe(true);
  });

  it('clears any leftover statuses on revive', () => {
    const wm = makeUnit('wm', 'player', 0, 0, FACING_E);
    const ko = makeUnit('p2', 'player', 1, 0, FACING_W);
    ko.addStatus('poison');
    ko.hp = 0;
    resolveRevive(wm, ko, 50);
    expect(ko.statuses).toEqual([]);
  });

  it('a revive on a still-alive unit is a no-op', () => {
    const wm = makeUnit('wm', 'player', 0, 0, FACING_E);
    const ally = makeUnit('p2', 'player', 1, 0, FACING_W, { hp: 100 });
    ally.hp = 80;
    const before = ally.hp;
    const out = resolveRevive(wm, ally, 50);
    expect(out.amount).toBe(0);
    expect(ally.hp).toBe(before);
  });

  it('floors at minimum 1 HP for low-hpMax units', () => {
    const wm = makeUnit('wm', 'player', 0, 0, FACING_E);
    const tiny = makeUnit('p2', 'player', 1, 0, FACING_W, { hp: 1 });
    tiny.hp = 0;
    const out = resolveRevive(wm, tiny, 50);
    expect(out.amount).toBeGreaterThanOrEqual(1);
    expect(tiny.hp).toBe(1);
  });
});

describe('abilityTargets — Raise sees KO\'d allies only', () => {
  it('targets a KO\'d ally within range', () => {
    const map = new BattleMap(flatMap(7, 7));
    const wm = makeUnit('wm', 'player', 1, 1, FACING_E);
    const ally = makeUnit('al', 'player', 3, 1, FACING_W);
    ally.hp = 0;
    const tiles = abilityTargets(wm, ABILITIES.raise, map, [wm, ally]);
    const xs = tiles.map(t => `${t.x},${t.z}`);
    expect(xs).toContain('3,1');
  });

  it('does not target a still-alive ally', () => {
    const map = new BattleMap(flatMap(7, 7));
    const wm = makeUnit('wm', 'player', 1, 1, FACING_E);
    const ally = makeUnit('al', 'player', 3, 1, FACING_W);
    const tiles = abilityTargets(wm, ABILITIES.raise, map, [wm, ally]);
    const xs = tiles.map(t => `${t.x},${t.z}`);
    expect(xs).not.toContain('3,1');
  });

  it('does not target a KO\'d enemy', () => {
    const map = new BattleMap(flatMap(7, 7));
    const wm = makeUnit('wm', 'player', 1, 1, FACING_E);
    const enemy = makeUnit('en', 'enemy', 3, 1, FACING_W);
    enemy.hp = 0;
    const tiles = abilityTargets(wm, ABILITIES.raise, map, [wm, enemy]);
    const xs = tiles.map(t => `${t.x},${t.z}`);
    expect(xs).not.toContain('3,1');
  });

  it('cannot self-raise (caster is alive)', () => {
    const map = new BattleMap(flatMap(7, 7));
    const wm = makeUnit('wm', 'player', 1, 1, FACING_E);
    const tiles = abilityTargets(wm, ABILITIES.raise, map, [wm]);
    expect(tiles.map(t => `${t.x},${t.z}`)).not.toContain('1,1');
  });
});

describe('unitAtAny', () => {
  it('returns KO\'d units that unitAt skips', () => {
    const wm = makeUnit('wm', 'player', 0, 0, FACING_E);
    const ko = makeUnit('p2', 'player', 1, 0, FACING_W);
    ko.hp = 0;
    expect(unitAtAny([wm, ko], 1, 0)).toBe(ko);
  });
});
