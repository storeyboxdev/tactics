import { Unit } from './Unit';
import { BattleMap } from './Map';
import { ABILITIES } from '../data/abilities';

interface Node {
  x: number;
  z: number;
  cost: number;
  parent: string | null;
}

const DIRS: [number, number][] = [
  [ 1, 0],
  [-1, 0],
  [ 0, 1],
  [ 0,-1],
];

const key = (x: number, z: number) => `${x},${z}`;

/**
 * BFS reachability from a unit's tile, respecting Move (steps), Jump (vertical
 * climb), terrain passability, and other-unit occupancy.
 *
 * Simplification vs FFT: occupied tiles (any team other than self) block both
 * pass-through and stopping. We can refine to ally-passthrough later.
 */
export class MovePlan {
  readonly unit: Unit;
  private readonly nodes = new Map<string, Node>();

  constructor(unit: Unit, map: BattleMap, units: readonly Unit[]) {
    this.unit = unit;

    const occupied = new Set<string>();
    for (const u of units) {
      // Living units AND KO'd-not-crystallized corpses both occupy their
      // tile (FFT canon). Crystals — once their countdown hits 0 — clear
      // out. Airborne lancers (mid-Jump) are off the board until they land.
      if (u !== unit && !u.crystallized && !u.airborne) occupied.add(key(u.x, u.z));
    }

    // Float passes over water tiles. Other movement abilities don't change
    // passability, so the predicate falls back to the map's terrain rule.
    const movementAb = unit.movement ? ABILITIES[unit.movement] : null;
    const hasFloat = movementAb?.effect.kind === 'movement-float';

    const start: Node = { x: unit.x, z: unit.z, cost: 0, parent: null };
    this.nodes.set(key(start.x, start.z), start);

    const queue: Node[] = [start];
    const moveBudget = unit.effectiveMove;
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur.cost === moveBudget) continue;
      const curTile = map.getTile(cur.x, cur.z);
      for (const [dx, dz] of DIRS) {
        const nx = cur.x + dx;
        const nz = cur.z + dz;
        const k = key(nx, nz);
        if (this.nodes.has(k)) continue;
        if (!map.inBounds(nx, nz)) continue;
        if (!hasFloat && !map.isPassable(nx, nz)) continue;
        if (occupied.has(k)) continue;
        const nTile = map.getTile(nx, nz);
        if (Math.abs(nTile.h - curTile.h) > unit.effectiveJump) continue;
        const node: Node = { x: nx, z: nz, cost: cur.cost + 1, parent: key(cur.x, cur.z) };
        this.nodes.set(k, node);
        queue.push(node);
      }
    }
  }

  /** Tiles the unit can stop on (includes origin = stay-in-place). */
  endTiles(): { x: number; z: number; cost: number }[] {
    return [...this.nodes.values()].map(n => ({ x: n.x, z: n.z, cost: n.cost }));
  }

  canEndAt(x: number, z: number): boolean {
    return this.nodes.has(key(x, z));
  }

  /** Returns origin → destination tile sequence; empty if unreachable. */
  pathTo(x: number, z: number): { x: number; z: number }[] {
    const startKey = key(x, z);
    if (!this.nodes.has(startKey)) return [];
    const out: { x: number; z: number }[] = [];
    let cursor: string | null = startKey;
    while (cursor !== null) {
      const node: Node | undefined = this.nodes.get(cursor);
      if (!node) break;
      out.unshift({ x: node.x, z: node.z });
      cursor = node.parent;
    }
    return out;
  }
}
