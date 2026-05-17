/**
 * The app's front door — a full-screen title menu, shown on launch.
 * Each button navigates via `goToScreen` (which persists the choice
 * and reloads; the router in `app.ts` re-dispatches).
 */

import { goToScreen } from '../core/Screen';

export function showTitleScreen(): void {
  const root = document.getElementById('hud');
  if (!root) return;

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: absolute; inset: 0;
    background: #0a0a14;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 14px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: #fff;
  `;

  const title = document.createElement('div');
  title.textContent = 'TACTICS';
  title.style.cssText = 'font-size:46px;font-weight:900;letter-spacing:8px;color:#ffe14a;';
  overlay.appendChild(title);

  const sub = document.createElement('div');
  sub.textContent = 'a tactical battler';
  sub.style.cssText = 'font-size:12px;letter-spacing:3px;opacity:0.6;margin-bottom:14px;';
  overlay.appendChild(sub);

  overlay.appendChild(menuButton('New Battle', () => goToScreen('battle')));

  root.appendChild(overlay);
}

function menuButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText = `
    padding: 12px 36px; font-size: 15px; font-family: inherit;
    color: #fff; background: #243c66; border: 1px solid #5b8def;
    border-radius: 4px; cursor: pointer; min-width: 220px;
  `;
  btn.addEventListener('click', onClick);
  return btn;
}
