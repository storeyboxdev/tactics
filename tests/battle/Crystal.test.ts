import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team, KO_COUNTDOWN_TURNS,
} from '../../src/battle/Unit';
import { TurnSystem, TickEvent } from '../../src/battle/TurnSystem';
import { abilityTargets, unitAtAny } from '../../src/battle/Targeting';
import { resolveRevive } from '../../src/battle/ActionResolver';
import { ABILITIES } from '../../src/data/abilities';
import { BattleMap, MapData } from '../../src/battle/Map';
import { MovePlan } from '../../src/battle/Movement';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 0, pa: 5, ma: 8, speed: 10, move: 4, jump: 1,
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

describe('Unit.applyDamage + KO transition', () => {
  it('arms the koTimer at 3 the moment hp drops to 0', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 5 });
    expect(u.koTimer).toBe(-1);
    u.applyDamage(5);
    expect(u.hp).toBe(0);
    expect(u.koTimer).toBe(KO_COUNTDOWN_TURNS);
    expect(u.crystallized).toBe(false);
  });

  it('does not re-arm the timer if hit again at 0', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 5 });
    u.applyDamage(5);
    u.koTimer = 1; // simulate countdown progress
    u.applyDamage(99);
    expect(u.koTimer).toBe(1); // unchanged — no double-arm
  });

  it('returns the actual amount dealt and clamps at 0', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 10 });
    expect(u.applyDamage(15)).toBe(10);
    expect(u.hp).toBe(0);
  });
});

describe('TurnSystem — KO countdown', () => {
  it('crystallizes the KO\'d unit after KO_COUNTDOWN_TURNS of its own CT-100 events', () => {
    const ko = makeUnit('ko', 'player', 0, 0, FACING_E, { hp: 1, speed: 10 });
    const live = makeUnit('live', 'enemy', 1, 0, FACING_W, { speed: 10 });
    ko.applyDamage(1);
    expect(ko.isAlive).toBe(false);
    expect(ko.koTimer).toBe(KO_COUNTDOWN_TURNS);

    const turns = new TurnSystem([ko, live]);
    // Drive the simulation until the KO'd unit has crystallized. Both units
    // gain CT in lockstep (same speed); live's CT is the only one that ever
    // dispatches a turn event, but ko's is decremented in parallel each
    // time it crosses 100.
    let safety = 0;
    while (!ko.crystallized && safety < 200) {
      const ev = turns.advance();
      if (ev.kind === 'turn') turns.endTurn(ev.unit, { moved: false, acted: false });
      safety++;
    }
    expect(ko.crystallized).toBe(true);
    expect(ko.koTimer).toBeLessThanOrEqual(0);
  });

  it('emits a "crystal" tick event when a unit crystallizes', () => {
    const ko = makeUnit('ko', 'player', 0, 0, FACING_E, { hp: 1, speed: 10 });
    const live = makeUnit('live', 'enemy', 1, 0, FACING_W, { speed: 10 });
    ko.applyDamage(1);
    const events: TickEvent[] = [];
    const turns = new TurnSystem([ko, live]);
    turns.setTickListener((ev) => events.push(ev));
    let safety = 0;
    while (!ko.crystallized && safety < 200) {
      const ev = turns.advance();
      if (ev.kind === 'turn') turns.endTurn(ev.unit, { moved: false, acted: false });
      safety++;
    }
    expect(events.some(e => e.kind === 'crystal' && e.unit === ko)).toBe(true);
  });
});

describe('Targeting / revive — crystallized blocks recovery', () => {
  it('Raise can target a KO\'d ally', () => {
    const map = new BattleMap(flatMap(7, 7));
    const wm = makeUnit('wm', 'player', 1, 1, FACING_E);
    const ko = makeUnit('ko', 'player', 3, 1, FACING_W);
    ko.applyDamage(ko.hp);
    const tiles = abilityTargets(wm, ABILITIES.raise, map, [wm, ko]);
    expect(tiles.map(t => `${t.x},${t.z}`)).toContain('3,1');
  });

  it('Raise cannot target a crystallized ally', () => {
    const map = new BattleMap(flatMap(7, 7));
    const wm = makeUnit('wm', 'player', 1, 1, FACING_E);
    const ko = makeUnit('ko', 'player', 3, 1, FACING_W);
    ko.applyDamage(ko.hp);
    ko.crystallized = true;
    const tiles = abilityTargets(wm, ABILITIES.raise, map, [wm, ko]);
    expect(tiles.map(t => `${t.x},${t.z}`)).not.toContain('3,1');
  });

  it('resolveRevive on a crystallized unit is a no-op', () => {
    const wm = makeUnit('wm', 'player', 0, 0, FACING_E);
    const ko = makeUnit('ko', 'player', 1, 0, FACING_W);
    ko.applyDamage(ko.hp);
    ko.crystallized = true;
    const out = resolveRevive(wm, ko, 50);
    expect(out.amount).toBe(0);
    expect(ko.hp).toBe(0);
  });

  it('resolveRevive resets koTimer back to -1 on success', () => {
    const wm = makeUnit('wm', 'player', 0, 0, FACING_E);
    const ko = makeUnit('ko', 'player', 1, 0, FACING_W);
    ko.applyDamage(ko.hp);
    expect(ko.koTimer).toBe(KO_COUNTDOWN_TURNS);
    resolveRevive(wm, ko, 50);
    expect(ko.koTimer).toBe(-1);
    expect(ko.isAlive).toBe(true);
  });
});

describe('Movement — KO\'d corpse blocks the tile, crystal does not', () => {
  it('a KO\'d ally\'s tile is occupied (not walkable through)', () => {
    const map = new BattleMap(flatMap(5, 5));
    const mover = makeUnit('m', 'player', 0, 0, FACING_E, { move: 5 });
    const corpse = makeUnit('c', 'player', 1, 0, FACING_W);
    corpse.applyDamage(corpse.hp);
    const plan = new MovePlan(mover, map, [mover, corpse]);
    const tiles = plan.endTiles();
    expect(tiles.find(t => t.x === 1 && t.z === 0)).toBeUndefined();
  });

  it('a crystallized unit\'s tile is walkable', () => {
    const map = new BattleMap(flatMap(5, 5));
    const mover = makeUnit('m', 'player', 0, 0, FACING_E, { move: 5 });
    const corpse = makeUnit('c', 'player', 1, 0, FACING_W);
    corpse.applyDamage(corpse.hp);
    corpse.crystallized = true;
    const plan = new MovePlan(mover, map, [mover, corpse]);
    const tiles = plan.endTiles();
    expect(tiles.find(t => t.x === 1 && t.z === 0)).toBeDefined();
  });
});

describe('unitAtAny finds a KO\'d unit', () => {
  it('skipped by unitAt; returned by unitAtAny', () => {
    const u = makeUnit('u', 'player', 2, 2, FACING_E);
    u.applyDamage(u.hp);
    expect(unitAtAny([u], 2, 2)).toBe(u);
  });
});
