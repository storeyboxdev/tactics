import * as THREE from 'three';
import { BattleMap } from '../battle/Map';
import { TERRAIN_COLORS, HEIGHT_UNIT, Terrain } from '../core/types';
import { AssetLoader } from '../core/AssetLoader';

const BOTTOM_COLOR = 0x0a0a14;

/**
 * Builds tile meshes immediately with flat-color materials so the scene shows
 * something during asset loading. Call {@link applyTextures} afterward to swap
 * in textured multi-material boxes (top + side per terrain). If a texture
 * fails to load, that face keeps its flat color — game still works.
 */
export class MapRenderer {
  readonly group = new THREE.Group();
  private readonly tileMeshes: THREE.Mesh[][] = [];

  constructor(private readonly map: BattleMap) {
    for (let z = 0; z < map.depth; z++) {
      const row: THREE.Mesh[] = [];
      for (let x = 0; x < map.width; x++) {
        const tile = map.getTile(x, z);
        const isWater = tile.terrain === 'water';
        const visualH = isWater ? 0.1 : Math.max(tile.h, 0.05) * HEIGHT_UNIT;
        const yTop    = isWater ? 0   : tile.h * HEIGHT_UNIT;
        const yCenter = yTop - visualH / 2;

        const geom = new THREE.BoxGeometry(1, visualH, 1);
        const mat = new THREE.MeshLambertMaterial({ color: TERRAIN_COLORS[tile.terrain] });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(x + 0.5, yCenter, z + 0.5);
        mesh.userData = { tileX: x, tileZ: z };
        this.group.add(mesh);
        row.push(mesh);
      }
      this.tileMeshes.push(row);
    }
  }

  /** Load PNGs for every distinct terrain on the map and assign multi-face materials. */
  async applyTextures(loader: AssetLoader): Promise<void> {
    const terrains = new Set<Terrain>();
    for (let z = 0; z < this.map.depth; z++) {
      for (let x = 0; x < this.map.width; x++) terrains.add(this.map.getTile(x, z).terrain);
    }
    const terrainList = [...terrains];

    const tops  = await loader.loadAll(terrainList.map(t => `/sprites/tiles/${t}_top.png`));
    const sides = await loader.loadAll(terrainList.map(t => `/sprites/tiles/${t}_side.png`));

    const topTex  = new Map<Terrain, THREE.Texture | null>();
    const sideTex = new Map<Terrain, THREE.Texture | null>();
    terrainList.forEach((t, i) => { topTex.set(t, tops[i]); sideTex.set(t, sides[i]); });

    const topMatCache = new Map<Terrain, THREE.Material>();
    const sideMatCache = new Map<string, THREE.Material>();
    const bottomMat = new THREE.MeshLambertMaterial({ color: BOTTOM_COLOR });

    const topMat = (terrain: Terrain): THREE.Material => {
      let m = topMatCache.get(terrain);
      if (m) return m;
      const tex = topTex.get(terrain);
      m = tex
        ? new THREE.MeshLambertMaterial({ map: tex })
        : new THREE.MeshLambertMaterial({ color: TERRAIN_COLORS[terrain] });
      topMatCache.set(terrain, m);
      return m;
    };

    const sideMat = (terrain: Terrain, h: number): THREE.Material => {
      const key = `${terrain}-${h}`;
      let m = sideMatCache.get(key);
      if (m) return m;
      const base = sideTex.get(terrain);
      if (base) {
        const tex = base.clone();
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        // One side-texture tile per height step keeps brick rows readable.
        tex.repeat.set(1, Math.max(1, h));
        tex.needsUpdate = true;
        m = new THREE.MeshLambertMaterial({ map: tex });
      } else {
        const c = TERRAIN_COLORS[terrain];
        const dark =
          (Math.floor(((c >> 16) & 0xff) * 0.7) << 16) |
          (Math.floor(((c >> 8)  & 0xff) * 0.7) << 8)  |
           Math.floor((c         & 0xff) * 0.7);
        m = new THREE.MeshLambertMaterial({ color: dark });
      }
      sideMatCache.set(key, m);
      return m;
    };

    for (let z = 0; z < this.map.depth; z++) {
      for (let x = 0; x < this.map.width; x++) {
        const tile = this.map.getTile(x, z);
        const mesh = this.tileMeshes[z][x];
        const oldMat = mesh.material as THREE.Material;
        const top = topMat(tile.terrain);

        if (tile.terrain === 'water') {
          // Water slab is too thin for side detail; same texture on all faces.
          mesh.material = top;
        } else {
          const sm = sideMat(tile.terrain, tile.h);
          // BoxGeometry material order: [+X, -X, +Y, -Y, +Z, -Z]
          mesh.material = [sm, sm, top, bottomMat, sm, sm];
        }
        oldMat.dispose();
      }
    }
  }

  meshAt(x: number, z: number): THREE.Mesh | undefined {
    return this.tileMeshes[z]?.[x];
  }
}
