/**
 * Active ability definitions used by skill targeting and resolution.
 *
 * MVP scope (M9): two Knight Breaks (instant physical debuffs) and the three
 * elemental Black Mage spells (charged magic damage). The full FFT-style
 * `Ability` schema (reactions, supports, movements) is deferred — when those
 * land, this table grows but its consumers shouldn't need to change much.
 */

export type AbilityEffect =
  | { kind: 'magic-damage'; spellPower: number; element?: 'fire' | 'ice' | 'bolt' }
  | { kind: 'debuff'; stat: 'pa' | 'speed' | 'ma'; amount: number };

export interface Ability {
  id: string;
  name: string;
  jpCost: number;        // unused until JP/job progression lands
  type: 'physical' | 'magical';
  range: number;         // Manhattan tiles
  chargeTime: number;    // 0 = instant; >0 = ticks to wait before resolving
  mpCost: number;
  effect: AbilityEffect;
}

export const ABILITIES: Record<string, Ability> = {
  power_break: {
    id: 'power_break',
    name: 'Power Break',
    jpCost: 200,
    type: 'physical',
    range: 1,
    chargeTime: 0,
    mpCost: 0,
    effect: { kind: 'debuff', stat: 'pa', amount: 2 },
  },
  speed_break: {
    id: 'speed_break',
    name: 'Speed Break',
    jpCost: 400,
    type: 'physical',
    range: 1,
    chargeTime: 0,
    mpCost: 0,
    effect: { kind: 'debuff', stat: 'speed', amount: 2 },
  },
  fire: {
    id: 'fire',
    name: 'Fire',
    jpCost: 200,
    type: 'magical',
    range: 4,
    chargeTime: 4,
    mpCost: 6,
    effect: { kind: 'magic-damage', spellPower: 14, element: 'fire' },
  },
  bolt: {
    id: 'bolt',
    name: 'Bolt',
    jpCost: 200,
    type: 'magical',
    range: 4,
    chargeTime: 5,
    mpCost: 6,
    effect: { kind: 'magic-damage', spellPower: 16, element: 'bolt' },
  },
  ice: {
    id: 'ice',
    name: 'Ice',
    jpCost: 200,
    type: 'magical',
    range: 4,
    chargeTime: 3,
    mpCost: 6,
    effect: { kind: 'magic-damage', spellPower: 12, element: 'ice' },
  },
};

// Job → ability mapping moved to JOB_DEFS[jobId].learnableActives (src/data/jobs.ts).
