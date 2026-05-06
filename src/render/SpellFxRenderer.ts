/**
 * Procedural per-element magic FX.
 *
 * Magic in FFT is target-localized — fireballs flash *at* the tile, lightning
 * strikes from above, ice crystallizes from below. So instead of the
 * caster→target arc the projectile renderer uses, this plays a short burst
 * at each affected tile and fires `onArrive` when the visual completes —
 * giving the orchestrator a sync point to play the target's hurt animation
 * "on impact". Five element routines cover every magic-damage and
 * magic-heal ability we ship today; a real painted FX sheet can drop in
 * later by swapping the textures here without touching the call sites.
 */

import * as THREE from 'three';
import { BattleMap } from '../battle/Map';

export type FxElement = 'fire' | 'ice' | 'bolt' | 'earth' | 'heal';

interface ElementConfig {
  texture: THREE.Texture;
  duration: number;     // seconds
  startScale: number;
  endScale: number;
  yStart: number;       // offset above tile top at t=0
  yEnd: number;         // offset above tile top at t=1
  fadeStart: number;    // 0..1: opacity holds at 1.0 until this fraction, then linearly drops to 0
}

interface ActiveFx {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;   // per-instance so opacity/scale don't bleed
  config: ElementConfig;
  baseX: number; baseZ: number; baseY: number;
  t: number;
  onArrive: () => void;
  fired: boolean;
}

export class SpellFxRenderer {
  readonly group = new THREE.Group();
  private readonly textures: Record<FxElement, THREE.Texture>;
  private readonly active: ActiveFx[] = [];

  constructor(private readonly map: BattleMap) {
    this.textures = {
      fire:  makeFireTexture(),
      ice:   makeIceTexture(),
      bolt:  makeBoltTexture(),
      earth: makeEarthTexture(),
      heal:  makeHealTexture(),
    };
  }

  /**
   * Spawn a one-shot FX at the given tile. `onArrive` fires when the
   * burst's animation completes — that's the moment the orchestrator
   * should play the target's hurt animation so timing reads as
   * "spell impact → recipient flinches".
   */
  burst(at: { x: number; z: number }, element: FxElement, onArrive: () => void = () => {}): void {
    const cfg = ELEMENT_CONFIG[element];
    cfg.texture = this.textures[element]; // share textures across instances

    const material = new THREE.SpriteMaterial({
      map: cfg.texture,
      transparent: true,
      depthWrite: false,
      opacity: 1,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(cfg.startScale, cfg.startScale, 1);

    const baseX = at.x + 0.5;
    const baseZ = at.z + 0.5;
    const baseY = this.map.topY(at.x, at.z);
    sprite.position.set(baseX, baseY + cfg.yStart, baseZ);

    this.group.add(sprite);
    this.active.push({ sprite, material, config: cfg, baseX, baseZ, baseY, t: 0, onArrive, fired: false });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i];
      const cfg = fx.config;
      fx.t = Math.min(1, fx.t + dt / cfg.duration);

      // Scale curve.
      const scale = cfg.startScale + (cfg.endScale - cfg.startScale) * fx.t;
      fx.sprite.scale.set(scale, scaleY(cfg, scale), 1);

      // Y travel.
      const y = fx.baseY + cfg.yStart + (cfg.yEnd - cfg.yStart) * fx.t;
      fx.sprite.position.set(fx.baseX, y, fx.baseZ);

      // Opacity: full until fadeStart, then linear to 0.
      if (fx.t < cfg.fadeStart) {
        fx.material.opacity = 1;
      } else {
        const fadeT = (fx.t - cfg.fadeStart) / (1 - cfg.fadeStart);
        fx.material.opacity = Math.max(0, 1 - fadeT);
      }

      if (fx.t >= 1) {
        if (!fx.fired) {
          fx.fired = true;
          fx.onArrive();
        }
        this.group.remove(fx.sprite);
        fx.material.dispose();
        this.active.splice(i, 1);
      }
    }
  }
}

// Bolt textures are tall by design — keep their aspect ratio rather than
// scaling height by the same factor as width.
function scaleY(cfg: ElementConfig, scaleX: number): number {
  // The bolt texture is 8x48 — preserve its 6:1 ratio.
  if (cfg.texture.image && cfg.texture.image.height === 48) return scaleX * 3;
  return scaleX;
}

// ─── Per-element animation curves ───────────────────────────────────────────

const ELEMENT_CONFIG: Record<FxElement, ElementConfig> = {
  fire:  { texture: null!, duration: 0.34, startScale: 0.30, endScale: 1.30, yStart: 0.55, yEnd: 0.55, fadeStart: 0.40 },
  ice:   { texture: null!, duration: 0.42, startScale: 0.70, endScale: 0.90, yStart: 0.05, yEnd: 0.65, fadeStart: 0.55 },
  bolt:  { texture: null!, duration: 0.28, startScale: 0.95, endScale: 1.05, yStart: 1.20, yEnd: 1.20, fadeStart: 0.30 },
  earth: { texture: null!, duration: 0.32, startScale: 0.45, endScale: 0.95, yStart: 0.30, yEnd: 0.30, fadeStart: 0.55 },
  heal:  { texture: null!, duration: 0.42, startScale: 0.40, endScale: 0.80, yStart: 0.25, yEnd: 0.95, fadeStart: 0.45 },
};

// ─── Procedural textures ────────────────────────────────────────────────────

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function canvasTex(c: HTMLCanvasElement): THREE.Texture {
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFireTexture(): THREE.Texture {
  const c = makeCanvas(32, 32);
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
  g.addColorStop(0,   '#fff5cc');
  g.addColorStop(0.3, '#ffae40');
  g.addColorStop(0.7, '#ff3a1a');
  g.addColorStop(1,   'rgba(120, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(16, 16, 16, 0, Math.PI * 2);
  ctx.fill();
  return canvasTex(c);
}

function makeIceTexture(): THREE.Texture {
  const c = makeCanvas(32, 32);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(180, 240, 255, 0.95)';
  // Four diamond shards arranged in a plus.
  drawDiamond(ctx, 16, 4,  4, 6);
  drawDiamond(ctx, 16, 28, 4, 6);
  drawDiamond(ctx, 4,  16, 4, 6);
  drawDiamond(ctx, 28, 16, 4, 6);
  // Bright center.
  ctx.fillStyle = '#ffffff';
  drawDiamond(ctx, 16, 16, 5, 7);
  return canvasTex(c);
}

function makeBoltTexture(): THREE.Texture {
  // Tall + narrow — vertical lightning streak.
  const c = makeCanvas(8, 48);
  const ctx = c.getContext('2d')!;
  // Outer glow
  ctx.fillStyle = '#fff8a8';
  ctx.fillRect(2, 0, 4, 48);
  // Inner core
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(3, 0, 2, 48);
  // Zig kicks
  ctx.fillStyle = '#ffe14a';
  ctx.fillRect(0, 8,  3, 4);
  ctx.fillRect(5, 16, 3, 4);
  ctx.fillRect(0, 26, 3, 4);
  ctx.fillRect(5, 36, 3, 4);
  return canvasTex(c);
}

function makeEarthTexture(): THREE.Texture {
  const c = makeCanvas(32, 32);
  const ctx = c.getContext('2d')!;
  // Cluster of irregular brown stones.
  ctx.fillStyle = '#704028';
  drawDiamond(ctx, 12, 10, 4, 5);
  drawDiamond(ctx, 22, 14, 5, 4);
  drawDiamond(ctx, 14, 22, 5, 5);
  drawDiamond(ctx, 24, 24, 4, 4);
  // Lighter highlight on tops.
  ctx.fillStyle = '#a07050';
  ctx.fillRect(12, 8,  3, 1);
  ctx.fillRect(21, 13, 3, 1);
  ctx.fillRect(13, 20, 3, 1);
  ctx.fillRect(23, 23, 3, 1);
  return canvasTex(c);
}

function makeHealTexture(): THREE.Texture {
  const c = makeCanvas(32, 32);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(170, 255, 180, 0.95)';
  // Plus-shape medical cross, slightly soft edges.
  ctx.fillRect(13, 6, 6, 20);
  ctx.fillRect(6, 13, 20, 6);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(14, 8, 4, 16);
  ctx.fillRect(8, 14, 16, 4);
  return canvasTex(c);
}

function drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, halfW: number, halfH: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - halfH);
  ctx.lineTo(cx + halfW, cy);
  ctx.lineTo(cx, cy + halfH);
  ctx.lineTo(cx - halfW, cy);
  ctx.closePath();
  ctx.fill();
}
