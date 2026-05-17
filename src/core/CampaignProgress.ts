/**
 * Campaign progress. The active campaign + battle index persists in
 * localStorage (so a campaign resumes across sessions); whether the
 * *current* battle is being played as a campaign battle (vs the random
 * gauntlet) is a session flag, set when the battle is launched.
 */

import { CampaignBattle } from '../data/campaigns';
import { resolveCampaign } from './CustomCampaigns';

const PROGRESS_KEY = 'tactics-campaign-progress';
const MODE_KEY = 'tactics-battle-is-campaign';

export interface CampaignProgress {
  campaignId: string;
  battleIndex: number;
}

export function activeCampaign(): CampaignProgress | null {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && typeof p.campaignId === 'string' && Number.isInteger(p.battleIndex)) {
      return { campaignId: p.campaignId, battleIndex: p.battleIndex };
    }
    return null;
  } catch {
    return null;
  }
}

function writeProgress(p: CampaignProgress | null): void {
  try {
    if (p) localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
    else localStorage.removeItem(PROGRESS_KEY);
  } catch {
    // QuotaExceededError or similar — drop silently.
  }
}

export function startCampaign(campaignId: string): void {
  writeProgress({ campaignId, battleIndex: 0 });
}

export function advanceCampaign(): void {
  const p = activeCampaign();
  if (p) writeProgress({ campaignId: p.campaignId, battleIndex: p.battleIndex + 1 });
}

export function endCampaign(): void {
  writeProgress(null);
}

/** The active campaign's current battle — null if no campaign is active
 *  or its index has run past the last battle. */
export function currentCampaignBattle(): CampaignBattle | null {
  const p = activeCampaign();
  if (!p) return null;
  return resolveCampaign(p.campaignId)?.battles[p.battleIndex] ?? null;
}

/** True once the active campaign's index has passed its final battle. */
export function campaignFinished(): boolean {
  const p = activeCampaign();
  if (!p) return false;
  const c = resolveCampaign(p.campaignId);
  return !!c && p.battleIndex >= c.battles.length;
}

// ── Current-battle mode (session-scoped) ─────────────────────────────────────

/** Flag the next battle as a campaign battle (vs the random gauntlet). */
export function setBattleIsCampaign(isCampaign: boolean): void {
  try {
    if (isCampaign) sessionStorage.setItem(MODE_KEY, '1');
    else sessionStorage.removeItem(MODE_KEY);
  } catch {
    // ignore
  }
}

export function battleIsCampaign(): boolean {
  try {
    return sessionStorage.getItem(MODE_KEY) === '1';
  } catch {
    return false;
  }
}
