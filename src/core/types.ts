export type Direction = 'N' | 'E' | 'S' | 'W';

export type Terrain = 'grass' | 'dirt' | 'stone' | 'water' | 'sand';

export const TERRAIN_COLORS: Record<Terrain, number> = {
  grass: 0x6aa84f,
  dirt:  0x8b6f47,
  stone: 0x9a9a9a,
  water: 0x3f7fbf,
  sand:  0xd6c896,
};

export const TERRAIN_PASSABLE: Record<Terrain, boolean> = {
  grass: true,
  dirt:  true,
  stone: true,
  water: false,
  sand:  true,
};

// World-space size of one height step. Tile footprint is 1x1, so 0.5 makes
// each elevation step half a tile thick — close to FFT proportions.
export const HEIGHT_UNIT = 0.5;
