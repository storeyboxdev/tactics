/**
 * Per-unit HUD overlay anchored above each sprite. Renders the unit's active
 * status badges (poison, slow, sleep, haste, stop) and — when KO'd — the
 * crystal countdown ("KO 3" → "KO 2" → "KO 1") so the player sees how many
 * of the unit's own turns remain before the corpse is permanently lost.
 *
 * Anchored via Three.js world-to-screen projection each frame. Units behind
 * the camera, crystallized, or with nothing to show have their element
 * hidden.
 */

import * as THREE from 'three';
import { Unit } from '../battle/Unit';
import { BattleMap } from '../battle/Map';
import { STATUS_DEFS } from '../data/statuses';

const WORLD_H = 1.5;          // matches UnitRenderer's sprite height
const HEAD_OFFSET = 0.45;     // extra world-y above the sprite top

interface Entry {
  unit: Unit;
  el: HTMLDivElement;
  statusRow: HTMLDivElement;
  koPill: HTMLDivElement;
}

export class UnitOverlays {
  private readonly root: HTMLDivElement;
  private readonly entries: Entry[] = [];

  constructor(units: readonly Unit[], private readonly map: BattleMap) {
    const hud = document.getElementById('hud');
    if (!hud) throw new Error('#hud not found');

    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'absolute', inset: '0',
      pointerEvents: 'none',
      overflow: 'hidden',
    });
    hud.appendChild(this.root);

    for (const unit of units) {
      const el = document.createElement('div');
      el.style.cssText = `
        position: absolute;
        transform: translate(-50%, -100%);
        display: none;
        flex-direction: column; align-items: center; gap: 2px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        pointer-events: none;
        white-space: nowrap;
      `;

      const statusRow = document.createElement('div');
      statusRow.style.cssText = 'display: flex; gap: 2px;';

      const koPill = document.createElement('div');
      koPill.style.cssText = `
        font-size: 11px; font-weight: 700; color: #fff;
        background: rgba(150, 30, 30, 0.88);
        padding: 1px 5px; border-radius: 3px;
        border: 1px solid rgba(255, 120, 120, 0.7);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
      `;

      el.appendChild(statusRow);
      el.appendChild(koPill);
      this.root.appendChild(el);
      this.entries.push({ unit, el, statusRow, koPill });
    }
  }

  update(camera: THREE.Camera): void {
    const v = new THREE.Vector3();
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const e of this.entries) {
      const u = e.unit;
      const hasStatuses = u.statuses.length > 0;
      const showKO = !u.isAlive && !u.crystallized;

      if (u.crystallized || (!hasStatuses && !showKO)) {
        e.el.style.display = 'none';
        continue;
      }

      // Project world-space anchor (slightly above the sprite top) → screen.
      const yTop = this.map.topY(u.x, u.z);
      v.set(u.x + 0.5, yTop + WORLD_H + HEAD_OFFSET, u.z + 0.5);
      v.project(camera);
      if (v.z > 1 || v.z < -1) {
        e.el.style.display = 'none';
        continue;
      }
      const sx = (v.x + 1) * 0.5 * w;
      const sy = (1 - v.y) * 0.5 * h;
      e.el.style.display = 'flex';
      e.el.style.left = `${sx}px`;
      e.el.style.top = `${sy}px`;

      // Status chips.
      if (hasStatuses) {
        e.statusRow.innerHTML = '';
        for (const s of u.statuses) {
          const def = STATUS_DEFS[s.id];
          const chip = document.createElement('div');
          chip.style.cssText = `
            font-size: 9px; font-weight: 700;
            padding: 1px 3px;
            background: ${hexToCss(def.color)};
            color: #fff;
            border-radius: 2px;
            line-height: 1;
          `;
          chip.textContent = def.short;
          chip.title = def.name + (s.remainingTicks > 0 ? ` (${s.remainingTicks})` : '');
          e.statusRow.appendChild(chip);
        }
        e.statusRow.style.display = 'flex';
      } else {
        e.statusRow.style.display = 'none';
      }

      // KO countdown pill.
      if (showKO) {
        e.koPill.textContent = `KO ${u.koTimer}`;
        e.koPill.style.display = 'block';
      } else {
        e.koPill.style.display = 'none';
      }
    }
  }
}

function hexToCss(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}
