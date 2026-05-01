import * as THREE from 'three';
import { Unit, Facing, FACING_E, FACING_W, FACING_N, FACING_S } from '../battle/Unit';
import { BattleMap } from '../battle/Map';
import { AssetLoader } from '../core/AssetLoader';
import { AnimationState } from './AnimationState';
import { SHEET_LAYOUT, ATTACK_IMPACT_FRAME } from '../data/sprites';

// Camera quadrant 0..3 corresponds to camera position roughly: 0=SE, 1=SW, 2=NW, 3=NE.
// The cardinal world side of the unit most facing the camera is then S, W, N, E.
const QUADRANT_TO_CAMERA_SIDE: Record<number, number> = { 0: 2, 1: 3, 2: 0, 3: 1 };

const SPRITE_W = SHEET_LAYOUT.cellW; // 32
const SPRITE_H = SHEET_LAYOUT.cellH; // 48
const WORLD_W = 1.0;
const WORLD_H = 1.5;

const STEP_TIME = 0.22; // seconds per tile during movement animation

// UV cell sizes for sub-region sampling on a loaded sheet.
const CELL_U = 1 / SHEET_LAYOUT.cols;
const CELL_V = 1 / SHEET_LAYOUT.rows;

const JOB_LABEL: Record<string, string> = {
  squire: 'S', chemist: 'C', knight: 'K', black_mage: 'M',
  time_mage: 'T', oracle: 'O',
};

interface MoveState {
  path: { x: number; z: number }[];
  idx: number;
  t: number;
  onDone: () => void;
}

interface Entry {
  unit: Unit;
  sprite: THREE.Sprite;
  anim: AnimationState;
  /** When non-null, this sprite is animated from a loaded sheet. */
  sheetTexture: THREE.Texture | null;
  /** Fallback static frames keyed by relative view 0..3. */
  placeholderFrames: THREE.Texture[] | null;
  move: MoveState | null;
}

export class UnitRenderer {
  readonly group = new THREE.Group();
  private readonly entries: Entry[] = [];

  constructor(units: Unit[], private readonly map: BattleMap) {
    for (const unit of units) {
      const placeholderFrames = makePlaceholderFrames(unit);
      const material = new THREE.SpriteMaterial({ map: placeholderFrames[0], transparent: true });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(WORLD_W, WORLD_H, 1);
      sprite.userData = { unitId: unit.id };
      this.group.add(sprite);
      this.entries.push({
        unit, sprite,
        anim: new AnimationState(),
        sheetTexture: null,
        placeholderFrames,
        move: null,
      });
    }
  }

  /** Try to swap each unit's placeholder for a loaded sheet PNG. */
  async applyTextures(loader: AssetLoader): Promise<void> {
    await Promise.all(this.entries.map(async e => {
      const url = `/sprites/units/${e.unit.jobId}_${e.unit.team}.png`;
      const tex = await loader.load(url);
      if (!tex) return; // keep placeholder
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      e.sheetTexture = tex;
      e.sprite.material.map = tex;
      e.sprite.material.needsUpdate = true;
      e.placeholderFrames?.forEach(t => t.dispose());
      e.placeholderFrames = null;
    }));
  }

  startMove(unit: Unit, path: { x: number; z: number }[], onDone: () => void) {
    if (path.length < 2) { onDone(); return; }
    const e = this.entries.find(en => en.unit === unit);
    if (!e) { onDone(); return; }
    e.move = { path, idx: 0, t: 0, onDone };
    unit.facing = facingTowards(path[0].x, path[0].z, path[1].x, path[1].z);
    if (e.sheetTexture) e.anim.play('walk');
  }

  isAnimating(): boolean { return this.entries.some(e => e.move !== null); }

  /** One-shot attack swing. `onImpact` fires at the hit frame so callers can sync FX. */
  playAttack(unit: Unit, onImpact?: () => void): void {
    const e = this.entries.find(en => en.unit === unit);
    if (!e || !e.sheetTexture) { onImpact?.(); return; }
    e.anim.play('attack', { onImpact, impactFrame: ATTACK_IMPACT_FRAME });
  }

  playHurt(unit: Unit): void {
    const e = this.entries.find(en => en.unit === unit);
    if (!e || !e.sheetTexture) return;
    e.anim.play('hurt');
  }

  playKO(unit: Unit): void {
    const e = this.entries.find(en => en.unit === unit);
    if (!e || !e.sheetTexture) return;
    e.anim.play('ko');
  }

  update(dt: number, cameraQuadrant: number) {
    const cameraSide = QUADRANT_TO_CAMERA_SIDE[cameraQuadrant] ?? 2;

    for (const e of this.entries) {
      // Advance any in-progress move animation.
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
          if (e.sheetTexture && e.anim.current === 'walk') e.anim.play('idle');
          onDone();
        }
      }

      // Tick animation (only meaningful when a sheet is loaded).
      if (e.sheetTexture) e.anim.tick(dt);

      // Position sprite (animated mid-step or static on tile).
      const pos = this.spriteWorldPos(e);
      e.sprite.position.copy(pos);
      // KO sprites stay visible (lying down); other dead units hide.
      e.sprite.visible = e.unit.isAlive || e.anim.current === 'ko';

      // Pick UV cell (sheet) or placeholder texture (fallback).
      const relView = (cameraSide - e.unit.facing + 4) % 4;
      if (e.sheetTexture) {
        const col = e.anim.currentColumn();
        e.sheetTexture.offset.set(col * CELL_U, 1 - (relView + 1) * CELL_V);
        e.sheetTexture.repeat.set(CELL_U, CELL_V);
      } else {
        const tex = e.placeholderFrames?.[relView];
        if (tex && e.sprite.material.map !== tex) {
          e.sprite.material.map = tex;
          e.sprite.material.needsUpdate = true;
        }
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

// ─── Placeholder canvas frames (fallback if no PNG sheet present) ───────────

function makePlaceholderFrames(unit: Unit): THREE.Texture[] {
  const teamColor = unit.team === 'player' ? '#5b8def' : '#d96363';
  const jobLetter = JOB_LABEL[unit.jobId] ?? '?';
  return [
    makeFrameTexture(teamColor, 0, jobLetter),
    makeFrameTexture(teamColor, 1, jobLetter),
    makeFrameTexture(teamColor, 2, jobLetter),
    makeFrameTexture(teamColor, 3, jobLetter),
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
    case 0: ctx.fillRect(13, 9, 2, 2); ctx.fillRect(17, 9, 2, 2); break;
    case 1: ctx.fillRect(17, 9, 2, 2); ctx.fillStyle = bodyColor; ctx.fillRect(SPRITE_W - 10, 18, 2, 14); break;
    case 2: ctx.fillRect(11, 6, 10, 2); break;
    case 3: ctx.fillRect(13, 9, 2, 2); ctx.fillStyle = bodyColor; ctx.fillRect(8, 18, 2, 14); break;
  }

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
