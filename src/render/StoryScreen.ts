/**
 * A story-beat overlay — a speaker and lines of narrative text with a
 * Continue button. Used for campaign battle intros and outros. The
 * caller decides what Continue does (start the battle, advance, …).
 */

import { StoryBeat } from '../data/campaigns';

export function showStoryScreen(beat: StoryBeat, onContinue: () => void): void {
  const root = document.getElementById('hud');
  if (!root) { onContinue(); return; }

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: absolute; inset: 0; background: rgba(8, 8, 16, 0.96);
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 14px; padding: 32px; box-sizing: border-box;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: #fff; z-index: 30;
  `;

  if (beat.speaker) {
    const who = document.createElement('div');
    who.textContent = beat.speaker;
    who.style.cssText = 'font-size:16px;font-weight:700;color:#ffe14a;letter-spacing:1px;';
    overlay.appendChild(who);
  }

  const panel = document.createElement('div');
  panel.style.cssText = 'max-width:560px;display:flex;flex-direction:column;gap:8px;';
  for (const line of beat.lines) {
    const p = document.createElement('div');
    p.textContent = line;
    p.style.cssText = 'font-size:14px;line-height:1.5;text-align:center;opacity:0.92;';
    panel.appendChild(p);
  }
  overlay.appendChild(panel);

  const cont = document.createElement('button');
  cont.textContent = 'Continue';
  cont.style.cssText = `
    margin-top: 10px; padding: 10px 28px; font-size: 14px; font-family: inherit;
    color: #fff; background: #243c66; border: 1px solid #5b8def;
    border-radius: 4px; cursor: pointer;
  `;
  cont.addEventListener('click', () => { overlay.remove(); onContinue(); });
  overlay.appendChild(cont);

  root.appendChild(overlay);
}
