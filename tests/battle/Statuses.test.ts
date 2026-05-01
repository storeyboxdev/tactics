import { describe, it, expect } from 'vitest';
import { BattleMap, MapData } from '../../src/battle/Map';
import { Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team } from '../../src/battle/Unit';
import { TurnSystem, TickEvent } from '../../src/battle/TurnSystem';
import { resolveAttack } from '../../src/battle/ActionResolver';

const baseStats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 0, pa: 5, ma: 5, speed: 10, move: 4, jump: 1, faith: 50, bravery: 50,
  ...over,
});

function makeUnit(id: string, team: Team, x = 0, z = 0, facing: Facing = FACING_E, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = {
    id, name: id, team, jobId: 'x', level: 1, stats: baseStats(over),
  };
  return new Unit(def, x, z, facing);
}

function flatMap(width: number, depth: number, h = 1): MapData {
  const heights: number[][] = [];
  for (let z = 0; z < depth; z++) heights.push(Array(width).fill(h));
  return { name: 'flat', width, height: depth, heights, spawns: { player: [], enemy: [] } };
}

describe('Status: addStatus / mutual exclusion', () => {
  it('addStatus is idempotent and refreshes duration', () => {
    const u = makeUnit('u', 'player');
    u.addStatus('slow');
    const first = u.statuses.find(s => s.id === 'slow')!.remainingTicks;
    expect(first).toBeGreaterThan(0);
    // tick the duration manually
    u.statuses[0].remainingTicks = 5;
    u.addStatus('slow');
    expect(u.statuses.filter(s => s.id === 'slow').length).toBe(1);
    expect(u.statuses[0].remainingTicks).toBe(first); // refreshed
  });

  it('Slow and Haste are mutually exclusive (same group "time")', () => {
    const u = makeUnit('u', 'player');
    u.addStatus('slow');
    expect(u.hasStatus('slow')).toBe(true);
    u.addStatus('haste');
    expect(u.hasStatus('haste')).toBe(true);
    expect(u.hasStatus('slow')).toBe(false);
  });
});

describe('Status: TurnSystem CT modulation', () => {
  it('Slow halves CT growth (10/tick → 5/tick)', () => {
    // Two units same speed; one Slow, one normal. After 10 ticks the
    // unstoppable normal unit should reach 100 first.
    const a = makeUnit('a', 'player');     // baseline
    const b = makeUnit('b', 'player');     // slowed
    b.addStatus('slow');
    const ts = new TurnSystem([a, b]);
    const ev = ts.advance();
    expect(ev.kind).toBe('turn');
    if (ev.kind === 'turn') expect(ev.unit).toBe(a);
    expect(b.ct).toBeLessThan(a.ct);       // b grew slower
  });

  it('Haste boosts CT growth and beats a baseline unit to 100', () => {
    const a = makeUnit('a', 'player');     // baseline (alphabetical wins ties otherwise)
    const b = makeUnit('b', 'player');
    b.addStatus('haste');
    const ts = new TurnSystem([a, b]);
    const ev = ts.advance();
    expect(ev.kind).toBe('turn');
    if (ev.kind === 'turn') expect(ev.unit).toBe(b);
  });

  it('Stop freezes CT entirely (multiplier 0)', () => {
    const stopped = makeUnit('stopped', 'player');
    const normal  = makeUnit('normal',  'player');
    stopped.addStatus('stop');
    const ts = new TurnSystem([stopped, normal]);
    ts.advance(); // returns normal (stopped never gains CT)
    expect(stopped.ct).toBe(0);
    expect(normal.ct).toBeGreaterThanOrEqual(100);
  });
});

describe('Status: Poison damage per tick', () => {
  it('emits status-damage events and reduces HP each tick', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 30 });
    u.addStatus('poison');
    const partner = makeUnit('p', 'player', 1, 0); // a faster reach to 100 isn't the focus
    const ts = new TurnSystem([u, partner]);
    const events: TickEvent[] = [];
    ts.setTickListener(ev => events.push(ev));
    ts.advance(); // ticks 10 times before partner hits 100
    const dmgEvents = events.filter(e => e.kind === 'status-damage');
    expect(dmgEvents.length).toBe(10);
    expect(u.hp).toBe(30 - 10 * 2);
  });

  it('KO from poison is reported as ko=true and unit dies', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { hp: 3 });
    u.addStatus('poison');
    const partner = makeUnit('p', 'player', 1, 0);
    const ts = new TurnSystem([u, partner]);
    const events: TickEvent[] = [];
    ts.setTickListener(ev => events.push(ev));
    ts.advance();
    const ko = events.find(e => e.kind === 'status-damage' && e.ko);
    expect(ko).toBeDefined();
    expect(u.isAlive).toBe(false);
  });
});

describe('Status: Sleep break on damage', () => {
  it('removes Sleep when the target takes damage from an attack', () => {
    const map = new BattleMap(flatMap(5, 5));
    const attacker = makeUnit('a', 'player', 1, 1);
    const target   = makeUnit('t', 'enemy',  2, 1, FACING_W, { bravery: 0 });
    target.addStatus('sleep');
    expect(target.hasStatus('sleep')).toBe(true);
    resolveAttack(attacker, target, map, () => 0.5);
    expect(target.hasStatus('sleep')).toBe(false);
  });
});

describe('Status: duration expiry', () => {
  it('Slow expires after its declared duration of ticks', () => {
    const u = makeUnit('u', 'player', 0, 0, FACING_E, { speed: 10 });
    u.addStatus('slow');
    const initial = u.statuses[0].remainingTicks;
    expect(initial).toBe(32);
    // Bring CT close to 100 first so we don't burn forever.
    u.ct = 0;
    const fast = makeUnit('fast', 'player', 1, 0, FACING_E, { speed: 1000 });
    const ts = new TurnSystem([u, fast]);
    let expired = false;
    ts.setTickListener(ev => { if (ev.kind === 'status-expire') expired = true; });
    // First advance: fast hits 100 in 1 tick (slow only ticks once).
    ts.advance();
    expect(u.statuses[0]?.remainingTicks).toBe(initial - 1);
    expect(expired).toBe(false);

    // Manually tick down by repeatedly advancing — but we need fast to reset CT.
    // Easier: set u.statuses[0].remainingTicks = 1 and check expire on next tick.
    u.statuses[0].remainingTicks = 1;
    fast.ct = 0;
    ts.advance();
    expect(expired).toBe(true);
    expect(u.hasStatus('slow')).toBe(false);
  });
});
