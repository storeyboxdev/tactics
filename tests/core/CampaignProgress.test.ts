import { describe, it, expect, beforeEach } from 'vitest';
import {
  activeCampaign, startCampaign, advanceCampaign, endCampaign,
  currentCampaignBattle, campaignFinished, setBattleIsCampaign, battleIsCampaign,
} from '../../src/core/CampaignProgress';
import { CAMPAIGNS } from '../../src/data/campaigns';

// Vitest's node environment has no Web Storage — install in-memory shims.
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string): string | null { return this.data.get(k) ?? null; }
  setItem(k: string, v: string): void { this.data.set(k, v); }
  removeItem(k: string): void { this.data.delete(k); }
  clear(): void { this.data.clear(); }
}
(globalThis as any).localStorage = new MemoryStorage();
(globalThis as any).sessionStorage = new MemoryStorage();

const FIRST = CAMPAIGNS[0];

describe('campaign data', () => {
  it('the built-in campaign has battles, each with an objective and enemies', () => {
    expect(FIRST.battles.length).toBeGreaterThan(0);
    for (const b of FIRST.battles) {
      expect(b.mapName.length).toBeGreaterThan(0);
      expect(b.enemies.length).toBeGreaterThan(0);
      expect(b.objective.kind).toBeTruthy();
    }
  });
});

describe('campaign progress', () => {
  beforeEach(() => localStorage.clear());

  it('starts at battle 0 and resolves the current battle', () => {
    expect(activeCampaign()).toBeNull();
    startCampaign(FIRST.id);
    expect(activeCampaign()).toEqual({ campaignId: FIRST.id, battleIndex: 0 });
    expect(currentCampaignBattle()).toBe(FIRST.battles[0]);
  });

  it('advances through the battles, then reports finished', () => {
    startCampaign(FIRST.id);
    for (let i = 1; i < FIRST.battles.length; i++) {
      advanceCampaign();
      expect(activeCampaign()!.battleIndex).toBe(i);
    }
    expect(campaignFinished()).toBe(false);
    advanceCampaign(); // past the last battle
    expect(campaignFinished()).toBe(true);
    expect(currentCampaignBattle()).toBeNull();
  });

  it('endCampaign clears progress', () => {
    startCampaign(FIRST.id);
    endCampaign();
    expect(activeCampaign()).toBeNull();
    expect(currentCampaignBattle()).toBeNull();
  });
});

describe('current-battle mode flag', () => {
  beforeEach(() => sessionStorage.clear());

  it('defaults off and toggles', () => {
    expect(battleIsCampaign()).toBe(false);
    setBattleIsCampaign(true);
    expect(battleIsCampaign()).toBe(true);
    setBattleIsCampaign(false);
    expect(battleIsCampaign()).toBe(false);
  });
});
