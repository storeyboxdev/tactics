/**
 * Runtime custom-campaign layer. Campaigns authored in the in-app editor
 * live in localStorage (key `tactics-custom-campaigns`); the campaign
 * picker and runner resolve them alongside the built-in `CAMPAIGNS`.
 * Campaigns can also be exported to / imported from JSON files.
 *
 * Validation mirrors `CustomMaps.ts`: anything malformed is dropped,
 * never crashes the caller.
 */

import { BattleObjective } from '../battle/Objective';
import { Campaign, CampaignBattle, StoryBeat, CAMPAIGNS, campaignById } from '../data/campaigns';

const STORE_KEY = 'tactics-custom-campaigns';

const OBJECTIVE_KINDS = ['rout', 'regicide', 'survive', 'protect', 'escort'] as const;

function validateObjective(raw: unknown): BattleObjective | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.kind !== 'string' || !OBJECTIVE_KINDS.includes(o.kind as never)) return null;
  switch (o.kind) {
    case 'rout': return { kind: 'rout' };
    case 'regicide': return { kind: 'regicide' };
    case 'protect': return { kind: 'protect' };
    case 'survive':
      if (!Number.isInteger(o.ticks) || (o.ticks as number) < 0) return null;
      return { kind: 'survive', ticks: o.ticks as number };
    case 'escort':
      // The goal tile is map-dependent — battle setup recomputes it.
      return { kind: 'escort', goalX: 0, goalZ: 0 };
    default:
      return null;
  }
}

function validateBeat(raw: unknown): StoryBeat | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b.lines) || !b.lines.every(l => typeof l === 'string')) return null;
  if (b.speaker !== undefined && typeof b.speaker !== 'string') return null;
  const beat: StoryBeat = { lines: [...b.lines] as string[] };
  if (typeof b.speaker === 'string' && b.speaker.length > 0) beat.speaker = b.speaker;
  return beat;
}

function validateBattle(raw: unknown): CampaignBattle | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.mapName !== 'string' || b.mapName.length === 0) return null;

  if (!Array.isArray(b.enemies)) return null;
  const enemies: { jobId: string; level: number }[] = [];
  for (const e of b.enemies) {
    if (!e || typeof e !== 'object') return null;
    const en = e as Record<string, unknown>;
    if (typeof en.jobId !== 'string' || en.jobId.length === 0) return null;
    if (!Number.isInteger(en.level) || (en.level as number) < 1) return null;
    enemies.push({ jobId: en.jobId, level: en.level as number });
  }

  const objective = validateObjective(b.objective);
  if (!objective) return null;

  const battle: CampaignBattle = { mapName: b.mapName, enemies, objective };
  if (b.intro !== undefined) {
    const intro = validateBeat(b.intro);
    if (!intro) return null;
    battle.intro = intro;
  }
  if (b.outro !== undefined) {
    const outro = validateBeat(b.outro);
    if (!outro) return null;
    battle.outro = outro;
  }
  return battle;
}

/** Validate an unknown value as a `Campaign`. Returns a clean copy or null. */
export function validateCampaign(raw: unknown): Campaign | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== 'string' || c.id.length === 0) return null;
  if (typeof c.name !== 'string' || c.name.length === 0) return null;
  if (!Array.isArray(c.battles)) return null;
  const battles: CampaignBattle[] = [];
  for (const b of c.battles) {
    const battle = validateBattle(b);
    if (!battle) return null;
    battles.push(battle);
  }
  return { id: c.id, name: c.name, battles };
}

/** Every custom campaign in the browser store; malformed entries are dropped. */
export function loadCustomCampaigns(): Campaign[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(validateCampaign).filter((c): c is Campaign => c !== null);
  } catch {
    return [];
  }
}

/** Save a custom campaign, replacing any existing custom campaign of the same id. */
export function saveCustomCampaign(campaign: Campaign): void {
  writeCustomCampaigns([...loadCustomCampaigns().filter(c => c.id !== campaign.id), campaign]);
}

export function deleteCustomCampaign(id: string): void {
  writeCustomCampaigns(loadCustomCampaigns().filter(c => c.id !== id));
}

function writeCustomCampaigns(campaigns: Campaign[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(campaigns));
  } catch {
    // QuotaExceededError or similar — drop silently.
  }
}

/** Built-in campaigns unioned with the custom store — the picker's pool. */
export function allCampaigns(): Campaign[] {
  return [...CAMPAIGNS, ...loadCustomCampaigns()];
}

/** Find a campaign by id across the built-in and custom pools. */
export function resolveCampaign(id: string): Campaign | undefined {
  return campaignById(id) ?? loadCustomCampaigns().find(c => c.id === id);
}

/** Download a campaign as a JSON file. */
export function exportCampaign(campaign: Campaign): void {
  const blob = new Blob([JSON.stringify(campaign, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${campaign.name.replace(/[^a-z0-9_-]+/gi, '_') || 'campaign'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse an uploaded JSON file into a `Campaign`, or null if invalid. */
export async function importCampaign(file: File): Promise<Campaign | null> {
  try {
    return validateCampaign(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}
