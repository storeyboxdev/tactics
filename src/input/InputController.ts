import * as THREE from 'three';
import { Unit } from '../battle/Unit';
import { MapRenderer } from '../render/MapRenderer';
import { UnitRenderer } from '../render/UnitRenderer';
import { Cursor } from '../render/Cursor';

type PickResult =
  | { type: 'unit'; unitId: string }
  | { type: 'tile'; x: number; z: number }
  | null;

export interface PickMode {
  tiles: { x: number; z: number }[];
  color: number;
  onPick: (x: number, z: number) => void;
  onCancel?: () => void;
}

/**
 * Mouse handler that runs in two states:
 *   - idle: hover highlights a tile but clicks do nothing
 *   - pick mode: a set of tiles is highlighted (color caller-chosen); clicking
 *     one of them invokes onPick. Right-click cancels.
 *
 * The orchestrator (main.ts) starts pick modes for movement, attack targeting,
 * and item targeting using the same API.
 */
export class InputController {
  private mode: PickMode | null = null;
  private animating = false;
  private allowedKeys: Set<string> | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly mouseNdc = new THREE.Vector2();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
    private readonly mapRenderer: MapRenderer,
    private readonly unitRenderer: UnitRenderer,
    private readonly cursor: Cursor,
    private readonly units: Unit[],
  ) {
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('click', this.onClick);
    canvas.addEventListener('contextmenu', this.onRightClick);
  }

  beginPick(mode: PickMode): void {
    this.cancel();
    this.mode = mode;
    this.allowedKeys = new Set(mode.tiles.map(t => `${t.x},${t.z}`));
    this.cursor.showRange(mode.tiles, mode.color);
  }

  cancel(): void {
    if (!this.mode) return;
    const cb = this.mode.onCancel;
    this.mode = null;
    this.allowedKeys = null;
    this.cursor.clearRange();
    cb?.();
  }

  setAnimating(v: boolean): void { this.animating = v; }
  isAnimating(): boolean { return this.animating; }

  private resolveTile(ev: MouseEvent): { x: number; z: number } | null {
    const hit = this.pick(ev);
    if (!hit) return null;
    if (hit.type === 'tile') return { x: hit.x, z: hit.z };
    const u = this.units.find(uu => uu.id === hit.unitId);
    return u ? { x: u.x, z: u.z } : null;
  }

  private pick(ev: MouseEvent): PickResult {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseNdc.x =  ((ev.clientX - rect.left) / rect.width)  * 2 - 1;
    this.mouseNdc.y = -((ev.clientY - rect.top)  / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouseNdc, this.camera);

    const unitHits = this.raycaster.intersectObjects(this.unitRenderer.group.children, false);
    if (unitHits.length) {
      const id = unitHits[0].object.userData.unitId as string | undefined;
      if (id) return { type: 'unit', unitId: id };
    }

    const tileHits = this.raycaster.intersectObjects(this.mapRenderer.group.children, false);
    if (tileHits.length) {
      const ud = tileHits[0].object.userData as { tileX?: number; tileZ?: number };
      if (typeof ud.tileX === 'number' && typeof ud.tileZ === 'number') {
        return { type: 'tile', x: ud.tileX, z: ud.tileZ };
      }
    }
    return null;
  }

  private onMouseMove = (ev: MouseEvent) => {
    const tile = this.resolveTile(ev);
    if (!tile) {
      this.cursor.setHover(null, null);
      return;
    }
    this.cursor.setHover(tile.x, tile.z);
  };

  private onClick = (ev: MouseEvent) => {
    if (this.animating || !this.mode || !this.allowedKeys) return;
    const tile = this.resolveTile(ev);
    if (!tile) return;
    if (!this.allowedKeys.has(`${tile.x},${tile.z}`)) return;
    const onPick = this.mode.onPick;
    this.mode = null;
    this.allowedKeys = null;
    this.cursor.clearRange();
    onPick(tile.x, tile.z);
  };

  private onRightClick = (ev: MouseEvent) => {
    ev.preventDefault();
    if (this.animating) return;
    this.cancel();
  };
}
