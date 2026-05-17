/**
 * Campaign picker — reached from the title menu. Lists the campaigns;
 * starting one (or resuming the one in progress) launches its first
 * (or current) battle in campaign mode.
 */

import { CAMPAIGNS, campaignById } from '../data/campaigns';
import {
  activeCampaign, campaignFinished, startCampaign, setBattleIsCampaign,
} from '../core/CampaignProgress';
import { goToScreen } from '../core/Screen';

export function showCampaignSelectScreen(): void {
  const root = document.getElementById('hud');
  if (!root) return;

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: absolute; inset: 0; background: #0a0a14;
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 12px; padding: 24px; box-sizing: border-box;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: #fff; overflow: auto;
  `;

  const heading = document.createElement('div');
  heading.textContent = 'CAMPAIGNS';
  heading.style.cssText = 'font-size:24px;font-weight:900;letter-spacing:3px;color:#ffe14a;margin-bottom:8px;';
  overlay.appendChild(heading);

  // Resume the campaign in progress, if any.
  const progress = activeCampaign();
  if (progress && !campaignFinished()) {
    const c = campaignById(progress.campaignId);
    if (c) {
      overlay.appendChild(menuButton(
        `Resume — ${c.name} (Battle ${progress.battleIndex + 1})`,
        '#1f4a2e', '#4fe07a',
        () => { setBattleIsCampaign(true); goToScreen('battle'); },
      ));
    }
  }

  for (const c of CAMPAIGNS) {
    overlay.appendChild(menuButton(
      `${c.name}  —  ${c.battles.length} battles`,
      '#243c66', '#5b8def',
      () => { startCampaign(c.id); setBattleIsCampaign(true); goToScreen('battle'); },
    ));
  }

  overlay.appendChild(menuButton('Main Menu', '#2a2a36', '#9a9aa0', () => goToScreen('menu')));
  root.appendChild(overlay);
}

function menuButton(label: string, bg: string, border: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText = `
    padding: 11px 24px; font-size: 13px; font-family: inherit;
    color: #fff; background: ${bg}; border: 1px solid ${border};
    border-radius: 4px; cursor: pointer; min-width: 320px;
  `;
  btn.addEventListener('click', onClick);
  return btn;
}
