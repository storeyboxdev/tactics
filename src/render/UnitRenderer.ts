import * as THREE from 'three';
import { Unit, Facing, FACING_E, FACING_W, FACING_N, FACING_S } from '../battle/Unit';
import { BattleMap } from '../battle/Map';

const QUADRANT_TO_CAMERA_SIDE: Record<number, number> = { 0: 2, 1: 3, 2: 0, 3: 1 };

const FRAME_FRONT = 0;
const FRAME_RIGHT = 1;
const FRAME_BACK  = 2;
const FRAME_LEFT  = 3;

const SPRITE_W = 32;
const SPRITE_H = 48;
const WORLD_W = 1.0;
const WORLD_H = 1.5;

const STEP_TIME = 0.22; // seconds per tile during movement animation

interface MoveState {
  path: { x: number; z: number }[];
  idx: number;     // index of the path tile the unit is currently AT (or just left, mid-step)
  t: number;       // 0..STEP_TIME progress from path[idx] toward path[idx+1]
  onDone: () => void;
}

interface Entry {
  unit: Unit;
  sprite: THREE.Sprite;
  frames: THREE.Texture[];
  move: MoveState | null;
}

export class UnitRenderer {
  readonly group = new THREE.Group();
  private readonly entries: Entry[] = [];

  constructor(units: Unit[], private readonly map: BattleMap) {
    for (const unit of units) {
      const frames = makeUnitFrames(unit);
      const material = new THREE.SpriteMaterial({ map: frames[FRAME_FRONT], transparent: true });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(WORLD_W, WORLD_H, 1);
      sprite.userData = { unitId: unit.id };
      this.group.add(sprite);

      const entry: Entry = { unit, sprite, frames, move: null };
      this.entries.push(entry);
    }
  }

  startMove(unit: Unit, path: { x: number; z: number }[], onDone: () => void) {
    if (path.length < 2) {
      onDone();
      return;
    }
    const e = this.entries.find(en => en.unit === unit);
    if (!e) {
      onDone();
      return;
    }
    e.move = { path, idx: 0, t: 0, onDone };
    unit.facing = facingTowards(path[0].x, path[0].z, path[1].x, path[1].z);
  }

  isAnimating(): boolean {
    return this.entries.some(e => e.move !== null);
  }

  update(dt: number, cameraQuadrant: number) {
    const cameraSide = QUADRANT_TO_CAMERA_SIDE[cameraQuadrant] ?? 2;

    for (const e of this.entries) {
      // Advance any in-progress move animation. Each step elapses STEP_TIME and snaps
      // the logical unit position to the next tile; the sprite is then positioned by
      // interpolating between the current and next tile during the partial step.
      if (e.move) {
        const m = e.move;
        m.t += dt;
        while (m.idx < m.path.length - 1 && m.t >= STEP_TIME) {
          m.t -= STEP_TIME;
          m.idx++;
          e.unit.x = m.path[m.idx].x;
          e.unit.z = m.path[m.idx].z;
          if (m.idx < m.path.length - 1) {
            const next = m.path[m.idx + 1];
            e.unit.facing = facingTowards(e.unit.x, e.unit.z, next.x, next.z);
          }
        }
        if (m.idx >= m.path.length - 1) {
          const onDone = m.onDone;
          e.move = null;
          onDone();
        }
      }

      // Position sprite (animated mid-step or static on tile)
      const pos = this.spriteWorldPos(e);
      e.sprite.position.copy(pos);
      e.sprite.visible = e.unit.isAlive;

      // Pick directional frame
      const rv = (cameraSide - e.unit.facing + 4) % 4;
      const tex = e.frames[rv];
      if (e.sprite.material.map !== tex) {
        e.sprite.material.map = tex;
        e.sprite.material.needsUpdate = true;
      }
    }
  }

  private spriteWorldPos(entry: Entry): THREE.Vector3 {
    const { unit, move } = entry;
    if (move && move.idx < move.path.length - 1) {
      const cur = move.path[move.idx];
      const nxt = move.path[move.idx + 1];
      const f = move.t / STEP_TIME;
      const x = cur.x + (nxt.x - cur.x) * f;
      const z = cur.z + (nxt.z - cur.z) * f;
      const yCur = this.map.topY(cur.x, cur.z);
      const yNxt = this.map.topY(nxt.x, nxt.z);
      const y = yCur + (yNxt - yCur) * f;
      return new THREE.Vector3(x + 0.5, y + WORLD_H / 2, z + 0.5);
    }
    const yTop = this.map.topY(unit.x, unit.z);
    return new THREE.Vector3(unit.x + 0.5, yTop + WORLD_H / 2, unit.z + 0.5);
  }
}

function facingTowards(fx: number, fz: number, tx: number, tz: number): Facing {
  const dx = tx - fx;
  const dz = tz - fz;
  if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? FACING_E : FACING_W;
  return dz >= 0 ? FACING_S : FACING_N;
}

const JOB_LABEL: Record<string, string> = {
  squire: 'S', chemist: 'C', knight: 'K', black_mage: 'M',
};

function makeUnitFrames(unit: Unit): THREE.Texture[] {
  const teamColor = unit.team === 'player' ? '#5b8def' : '#d96363';
  const jobLetter = JOB_LABEL[unit.jobId] ?? '?';
  return [
    makeFrameTexture(teamColor, FRAME_FRONT, jobLetter),
    makeFrameTexture(teamColor, FRAME_RIGHT, jobLetter),
    makeFrameTexture(teamColor, FRAME_BACK,  jobLetter),
    makeFrameTexture(teamColor, FRAME_LEFT,  jobLetter),
  ];
}

function makeFrameTexture(bodyColor: string, view: number, jobLetter: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = bodyColor;
  ctx.fillRect(8, 16, SPRITE_W - 16, SPRITE_H - 20);
  ctx.fillStyle = '#f3d6a8';
  ctx.fillRect(10, 4, SPRITE_W - 20, 14);

  ctx.fillStyle = '#222';
  switch (view) {
    case FRAME_FRONT:
      ctx.fillRect(13, 9, 2, 2);
      ctx.fillRect(17, 9, 2, 2);
      break;
    case FRAME_RIGHT:
      ctx.fillRect(17, 9, 2, 2);
      ctx.fillStyle = bodyColor;
      ctx.fillRect(SPRITE_W - 10, 18, 2, 14);
      break;
    case FRAME_BACK:
      ctx.fillRect(11, 6, 10, 2);
      break;
    case FRAME_LEFT:
      ctx.fillRect(13, 9, 2, 2);
      ctx.fillStyle = bodyColor;
      ctx.fillRect(8, 18, 2, 14);
      break;
  }

  // Job initial centered on the chest, in white, for at-a-glance identification.
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(jobLetter, SPRITE_W / 2, 28);

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
