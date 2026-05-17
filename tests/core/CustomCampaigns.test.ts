import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateCampaign, loadCustomCampaigns, saveCustomCampaign, deleteCustomCampaign,
  allCampaigns, resolveCampaign,
} from '../../src/core/CustomCampaigns';
import { CAMPAIGNS, Campaign } from '../../src/data/campaigns';

// Vitest's node environment has no Web Storage — install an in-memory shim.
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string): string | null { return this.data.get(k) ?? null; }
  setItem(k: string, v: string): void { this.data.set(k, v); }
  removeItem(k: string): void { this.data.delete(k); }
  clear(): void { this.data.clear(); }
}
(globalThis as any).localStorage = new MemoryStorage();

function sampleCampaign(): Campaign {
  return {
    id: 'custom_test',
    name: 'Test Campaign',
    battles: [
      {
        mapName: 'Grassland',
        enemies: [{ jobId: 'squire', level: 3 }],
        objective: { kind: 'rout' },
        intro: { speaker: 'Narrator', lines: ['It begins.'] },
      },
      {
        mapName: 'High Ground',
        enemies: [{ jobId: 'knight', level: 5 }, { jobId: 'archer', level: 5 }],
        objective: { kind: 'survive', ticks: 40 },
      },
    ],
  };
}

describe('validateCampaign', () => {
  it('accepts a well-formed campaign', () => {
    expect(validateCampaign(sampleCampaign())).toEqual(sampleCampaign());
  });

  it('rejects a campaign with no battles array', () => {
    const c: any = sampleCampaign();
    delete c.battles;
    expect(validateCampaign(c)).toBeNull();
  });

  it('rejects a battle with a malformed enemy', () => {
    const c: any = sampleCampaign();
    c.battles[0].enemies[0].level = 0; // level must be >= 1
    expect(validateCampaign(c)).toBeNull();
  });

  it('rejects an unknown objective kind', () => {
    const c: any = sampleCampaign();
    c.battles[0].objective = { kind: 'conquer' };
    expect(validateCampaign(c)).toBeNull();
  });

  it('rejects a survive objective with no ticks', () => {
    const c: any = sampleCampaign();
    c.battles[1].objective = { kind: 'survive' };
    expect(validateCampaign(c)).toBeNull();
  });

  it('rejects a story beat whose lines are not strings', () => {
    const c: any = sampleCampaign();
    c.battles[0].intro.lines = [1, 2];
    expect(validateCampaign(c)).toBeNull();
  });
});

describe('custom campaign store', () => {
  beforeEach(() => localStorage.clear());

  it('saves, loads, and deletes', () => {
    expect(loadCustomCampaigns()).toEqual([]);
    saveCustomCampaign(sampleCampaign());
    expect(loadCustomCampaigns()).toEqual([sampleCampaign()]);
    deleteCustomCampaign('custom_test');
    expect(loadCustomCampaigns()).toEqual([]);
  });

  it('upserts by id rather than duplicating', () => {
    saveCustomCampaign(sampleCampaign());
    const renamed = { ...sampleCampaign(), name: 'Renamed' };
    saveCustomCampaign(renamed);
    expect(loadCustomCampaigns()).toEqual([renamed]);
  });
});

describe('campaign resolution', () => {
  beforeEach(() => localStorage.clear());

  it('allCampaigns unions built-in and custom', () => {
    saveCustomCampaign(sampleCampaign());
    const all = allCampaigns();
    expect(all.length).toBe(CAMPAIGNS.length + 1);
    expect(all.some(c => c.id === 'custom_test')).toBe(true);
  });

  it('resolveCampaign finds built-in and custom campaigns by id', () => {
    saveCustomCampaign(sampleCampaign());
    expect(resolveCampaign(CAMPAIGNS[0].id)).toBe(CAMPAIGNS[0]);
    expect(resolveCampaign('custom_test')?.name).toBe('Test Campaign');
    expect(resolveCampaign('nonexistent')).toBeUndefined();
  });
});
