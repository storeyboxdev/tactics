/**
 * Campaign definitions — ordered sequences of scripted battles with
 * story. A campaign battle pins the map, the enemy roster, and the
 * objective (instead of the random gauntlet), and may carry intro/outro
 * story beats.
 *
 * Built-in campaigns are TS data, like JOB_DEFS. Custom campaigns (from
 * a future campaign editor) will live in localStorage.
 */

import { BattleObjective } from '../battle/Objective';

export interface StoryBeat {
  /** Optional speaker name shown above the lines. */
  speaker?: string;
  lines: string[];
}

export interface CampaignBattle {
  /** A map by `MapData.name` — built-in or custom. */
  mapName: string;
  /** Enemies placed at the map's enemy spawn tiles, in order. */
  enemies: { jobId: string; level: number }[];
  objective: BattleObjective;
  /** Shown before the battle. */
  intro?: StoryBeat;
  /** Shown on victory. */
  outro?: StoryBeat;
}

export interface Campaign {
  id: string;
  name: string;
  battles: CampaignBattle[];
}

export const CAMPAIGNS: Campaign[] = [
  {
    id: 'proving_grounds',
    name: 'The Proving Grounds',
    battles: [
      {
        mapName: 'Grassland',
        enemies: [
          { jobId: 'squire', level: 2 },
          { jobId: 'squire', level: 2 },
          { jobId: 'archer', level: 2 },
        ],
        objective: { kind: 'rout' },
        intro: {
          speaker: 'Instructor Vael',
          lines: [
            'So — you would call yourself a tactician.',
            'The Proving Grounds will be the judge of that.',
            'Three trials. Rout this first band, and we continue.',
          ],
        },
        outro: {
          speaker: 'Instructor Vael',
          lines: ['Cleanly done. But raw recruits test nothing. Onward.'],
        },
      },
      {
        mapName: 'Stone Corridor',
        enemies: [
          { jobId: 'knight', level: 4 },
          { jobId: 'squire', level: 3 },
          { jobId: 'black_mage', level: 4 },
        ],
        objective: { kind: 'regicide' },
        intro: {
          speaker: 'Instructor Vael',
          lines: [
            'A corridor. A captain and his guard.',
            'Cut down the captain — the rest is noise.',
          ],
        },
        outro: {
          speaker: 'Instructor Vael',
          lines: ['The captain falls, the guard scatters. One trial remains.'],
        },
      },
      {
        mapName: 'High Ground',
        enemies: [
          { jobId: 'knight', level: 6 },
          { jobId: 'archer', level: 6 },
          { jobId: 'monk', level: 6 },
          { jobId: 'white_mage', level: 6 },
        ],
        objective: { kind: 'rout' },
        intro: {
          speaker: 'Instructor Vael',
          lines: [
            'The last trial. They hold the high ground, and they are no recruits.',
            'Rout them, and the Grounds have nothing left to teach you.',
          ],
        },
        outro: {
          speaker: 'Instructor Vael',
          lines: [
            'It is done. The Proving Grounds release you.',
            'Whatever war finds you next — you are ready for it.',
          ],
        },
      },
    ],
  },
];

export function campaignById(id: string): Campaign | undefined {
  return CAMPAIGNS.find(c => c.id === id);
}
