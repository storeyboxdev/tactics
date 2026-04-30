import * as THREE from 'three';
import { BattleMap } from '../battle/Map';
import { TERRAIN_COLORS, HEIGHT_UNIT } from '../core/types';

export class MapRenderer {
  readonly group = new THREE.Group();
  private readonly tileMeshes: THREE.Mesh[][] = [];

  constructor(map: BattleMap) {
    for (let z = 0; z < map.depth; z++) {
      const row: THREE.Mesh[] = [];
      for (let x = 0; x < map.width; x++) {
        const tile = map.getTile(x, z);
        const isWater = tile.terrain === 'water';

        // Land tiles rise from y=0 to y=h*HEIGHT_UNIT.
        // Water sits as a thin slab around y=0 so it reads as a surface, not absent geometry.
        const visualH = isWater ? 0.1 : Math.max(tile.h, 0.05) * HEIGHT_UNIT;
        const yTop = isWater ? 0 : tile.h * HEIGHT_UNIT;
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

  meshAt(x: number, z: number): THREE.Mesh | undefined {
    return this.tileMeshes[z]?.[x];
  }
}
