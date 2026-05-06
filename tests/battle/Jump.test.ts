import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import { TurnSystem } from '../../src/battle/TurnSystem';
import { unitAt, unitAtAny } from '../../src/battle/Targeting';
import { MovePlan } from '../../src/battle/Movement';
import { BattleMap, MapData } from '../../src/battle/Map';
import { ABILITIES } from '../../src/data/abilities';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 30, pa: 5, ma: 8, speed: 10, move: 4, jump: 1,
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

describe('Jump ability metadata', () => {
  it('is a charged physical-ranged-damage with castAirborne flag', () => {
    const ab = ABILITIES.jump;
    expect(ab.castAirborne).toBe(true);
    expect(ab.chargeTime).toBeGreaterThan(0);
    expect(ab.effect.kind).toBe('physical-ranged-damage');
  });
});

describe('airborne flag — untargetable / off the board', () => {
  it('unitAt skips airborne units; unitAtAny still returns them', () => {
    const lancer = makeUnit('l', 'player', 3, 3, FACING_E);
    lancer.airborne = true;
    expect(unitAt([lancer], 3, 3)).toBeUndefined();
    expect(unitAtAny([lancer], 3, 3)).toBe(lancer);
  });

  it('Movement treats an airborne unit\'s tile as walkable', () => {
    const map = new BattleMap(flatMap(5, 5));
    const mover  = makeUnit('m', 'player', 0, 0, FACING_E, { move: 5 });
    const lancer = makeUnit('l', 'player', 1, 0, FACING_W);
    lancer.airborne = true;
    const plan = new MovePlan(mover, map, [mover, lancer]);
    const tiles = plan.endTiles();
    expect(tiles.find(t => t.x === 1 && t.z === 0)).toBeDefined();
  });
});

describe('TurnSystem — airborne units freeze in place', () => {
  it('peekReady ignores airborne units even with full CT', () => {
    const lancer = makeUnit('l', 'player', 0, 0, FACING_E, { speed: 10 });
    const enemy  = makeUnit('e', 'enemy',  1, 0, FACING_W, { speed: 5 });
    lancer.ct = 100;
    lancer.airborne = true;
    const turns = new TurnSystem([lancer, enemy]);
    expect(turns.peekReady()).toBeNull();
  });

  it('predictUpcoming omits airborne units from the turn-order strip', () => {
    const lancer = makeUnit('l', 'player', 0, 0, FACING_E, { speed: 10 });
    const enemy  = makeUnit('e', 'enemy',  1, 0, FACING_W, { speed: 10 });
    lancer.airborne = true;
    const turns = new TurnSystem([lancer, enemy]);
    const upcoming = turns.predictUpcoming(4);
    expect(upcoming.every(u => u.id !== 'l')).toBe(true);
  });

  it('CT does not grow for airborne units', () => {
    const lancer = makeUnit('l', 'player', 0, 0, FACING_E, { speed: 10 });
    const enemy  = makeUnit('e', 'enemy',  1, 0, FACING_W, { speed: 5 });
    lancer.airborne = true;
    const ctBefore = lancer.ct;
    const turns = new TurnSystem([lancer, enemy]);
    // Drive a few advance() iterations — enemy will reach 100 and act.
    for (let i = 0; i < 3; i++) {
      const ev = turns.advance();
      if (ev.kind === 'turn') turns.endTurn(ev.unit, { moved: false, acted: false });
    }
    expect(lancer.ct).toBe(ctBefore);
  });
});
