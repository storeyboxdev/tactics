import * as THREE from 'three';
import { BattleMap } from '../battle/Map';

const RANGE_COLOR  = 0x4f9fff;
const HOVER_COLOR  = 0xffe14a;
const ACTIVE_COLOR = 0xffe14a;

export class Cursor {
  readonly group = new THREE.Group();

  private readonly hoverMesh: THREE.Mesh;
  private readonly activeMesh: THREE.Mesh;
  private rangeMeshes: THREE.Mesh[] = [];

  constructor(private readonly map: BattleMap) {
    // Active actor marker — sits beneath the range highlight so the unit's
    // tile is always visibly tagged even while choosing a Move/Attack target.
    this.activeMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.95),
      new THREE.MeshBasicMaterial({
        color: ACTIVE_COLOR,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    );
    this.activeMesh.rotation.x = -Math.PI / 2;
    this.activeMesh.visible = false;
    this.activeMesh.renderOrder = 0;
    this.group.add(this.activeMesh);

    // Hover indicator
    this.hoverMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.95),
      new THREE.MeshBasicMaterial({
        color: HOVER_COLOR,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    this.hoverMesh.rotation.x = -Math.PI / 2;
    this.hoverMesh.visible = false;
    this.hoverMesh.renderOrder = 2;
    this.group.add(this.hoverMesh);
  }

  setHover(x: number | null, z: number | null) {
    if (x === null || z === null || !this.map.inBounds(x, z)) {
      this.hoverMesh.visible = false;
      return;
    }
    this.hoverMesh.visible = true;
    this.hoverMesh.position.set(x + 0.5, this.map.topY(x, z) + 0.04, z + 0.5);
  }

  setActiveTile(x: number, z: number) {
    if (!this.map.inBounds(x, z)) {
      this.activeMesh.visible = false;
      return;
    }
    this.activeMesh.visible = true;
    this.activeMesh.position.set(x + 0.5, this.map.topY(x, z) + 0.015, z + 0.5);
  }

  clearActiveTile() {
    this.activeMesh.visible = false;
  }

  showRange(tiles: { x: number; z: number }[], color: number = RANGE_COLOR) {
    this.clearRange();
    for (const t of tiles) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 0.95),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(t.x + 0.5, this.map.topY(t.x, t.z) + 0.025, t.z + 0.5);
      m.renderOrder = 1;
      this.group.add(m);
      this.rangeMeshes.push(m);
    }
  }

  clearRange() {
    for (const m of this.rangeMeshes) {
      this.group.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.rangeMeshes = [];
  }

  /** Pulsing animation for the active marker. Call from the render loop. */
  update(timeSec: number) {
    if (!this.activeMesh.visible) return;
    const mat = this.activeMesh.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.30 + 0.20 * (Math.sin(timeSec * 4) * 0.5 + 0.5);
  }
}
