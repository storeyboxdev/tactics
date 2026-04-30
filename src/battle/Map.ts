import { Terrain, TERRAIN_PASSABLE, HEIGHT_UNIT } from '../core/types';

export interface Tile {
  h: number;
  terrain: Terrain;
}

export interface MapData {
  name: string;
  width: number;
  height: number;
  heights: number[][];
  terrains?: string[][];
  spawns: { player: [number, number][]; enemy: [number, number][] };
}

function deriveTerrain(h: number): Terrain {
  if (h <= 0) return 'water';
  if (h >= 3) return 'stone';
  return 'grass';
}

export class BattleMap {
  readonly name: string;
  readonly width: number;
  readonly depth: number;
  readonly tiles: Tile[][];
  readonly spawns: { player: [number, number][]; enemy: [number, number][] };

  constructor(data: MapData) {
    if (data.heights.length !== data.height) {
      throw new Error(`map ${data.name}: heights rows ${data.heights.length} != height ${data.height}`);
    }
    this.name = data.name;
    this.width = data.width;
    this.depth = data.height;
    this.tiles = [];
    for (let z = 0; z < data.height; z++) {
      const row: Tile[] = [];
      const hRow = data.heights[z];
      const tRow = data.terrains?.[z];
      if (hRow.length !== data.width) {
        throw new Error(`map ${data.name}: row ${z} width ${hRow.length} != ${data.width}`);
      }
      for (let x = 0; x < data.width; x++) {
        const h = hRow[x];
        const terrain = (tRow?.[x] as Terrain | undefined) ?? deriveTerrain(h);
        row.push({ h, terrain });
      }
      this.tiles.push(row);
    }
    this.spawns = data.spawns;
  }

  inBounds(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.width && z < this.depth;
  }

  getTile(x: number, z: number): Tile {
    if (!this.inBounds(x, z)) throw new Error(`tile (${x},${z}) out of bounds`);
    return this.tiles[z][x];
  }

  isPassable(x: number, z: number): boolean {
    if (!this.inBounds(x, z)) return false;
    return TERRAIN_PASSABLE[this.tiles[z][x].terrain];
  }

  /** World-space y coordinate of the top surface of the tile (where a unit stands). */
  topY(x: number, z: number): number {
    if (!this.inBounds(x, z)) return 0;
    return this.tiles[z][x].h * HEIGHT_UNIT;
  }
}
