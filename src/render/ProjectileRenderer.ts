/**
 * Lightweight projectile renderer for ranged physical attacks (Charge, Wave
 * Fist, Throw, Phoenix Down toss, etc). One small billboarded sprite per
 * shot, traveling from caster to target tile along a parabolic arc. Calls
 * `onArrive` at landing so the orchestrator can defer hit FX (the target's
 * hurt/KO animation) until the projectile actually connects.
 *
 * Damage is applied by the resolver synchronously — the projectile is purely
 * a visual delay layer so the player has a moment to read "shot fired" before
 * the recipient flinches.
 */

import * as THREE from 'three';
import { Unit } from '../battle/Unit';
import { BattleMap } from '../battle/Map';

const TRAVEL_TIME = 0.25;   // seconds from launch to land
const ARC_HEIGHT  = 0.8;    // peak height above the linear midpoint
const SPRITE_SIZE = 0.30;
const Y_OFFSET    = 0.85;   // launch/land Y above the tile top

interface ActiveShot {
  mesh: THREE.Sprite;
  fromX: number; fromZ: number; fromY: number;
  toX: number;   toZ: number;   toY: number;
  t: number;
  onArrive: () => void;
}

export class ProjectileRenderer {
  readonly group = new THREE.Group();
  private readonly material: THREE.SpriteMaterial;
  private readonly active: ActiveShot[] = [];

  constructor(private readonly map: BattleMap) {
    this.material = new THREE.SpriteMaterial({
      map: makeDiamondTexture(),
      transparent: true,
      depthWrite: false,
    });
  }

  /**
   * Launch a projectile from the caster's tile to the destination tile.
   * `onArrive` fires when the sprite reaches the destination — that's the
   * moment the orchestrator should play the hurt animation on the target.
   */
  fire(caster: Unit, dest: { x: number; z: number }, onArrive: () => void = () => {}): void {
    const sprite = new THREE.Sprite(this.material);
    sprite.scale.set(SPRITE_SIZE, SPRITE_SIZE, 1);

    const fromX = caster.x + 0.5;
    const fromZ = caster.z + 0.5;
    const fromY = this.map.topY(caster.x, caster.z) + Y_OFFSET;

    const toX = dest.x + 0.5;
    const toZ = dest.z + 0.5;
    const toY = this.map.topY(dest.x, dest.z) + Y_OFFSET;

    sprite.position.set(fromX, fromY, fromZ);
    this.group.add(sprite);

    this.active.push({
      mesh: sprite,
      fromX, fromZ, fromY,
      toX, toZ, toY,
      t: 0, onArrive,
    });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.t = Math.min(1, p.t + dt / TRAVEL_TIME);

      const x = p.fromX + (p.toX - p.fromX) * p.t;
      const z = p.fromZ + (p.toZ - p.fromZ) * p.t;
      const baseY = p.fromY + (p.toY - p.fromY) * p.t;
      // sin(πt) = 0 at endpoints, 1 at midpoint — cheap parabolic arc.
      const arc = ARC_HEIGHT * Math.sin(p.t * Math.PI);
      p.mesh.position.set(x, baseY + arc, z);

      if (p.t >= 1) {
        this.group.remove(p.mesh);
        this.active.splice(i, 1);
        p.onArrive();
      }
    }
  }
}

function makeDiamondTexture(): THREE.Texture {
  // 8×8 white diamond on transparent — generic enough to read as
  // "thrown thing" for arrows, stones, or spell motes.
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(4, 0); ctx.lineTo(7, 4); ctx.lineTo(4, 7); ctx.lineTo(1, 4);
  ctx.closePath();
  ctx.fill();
  // Yellow highlight in the middle.
  ctx.fillStyle = '#ffe14a';
  ctx.fillRect(3, 3, 2, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
