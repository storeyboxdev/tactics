import { StatusId, STATUS_DEFS } from '../data/statuses';
import { ABILITIES } from '../data/abilities';
import { UnitProgression } from './Progression';
import { computeDisplayStats } from './Stats';

export type Team = 'player' | 'enemy';

// Cardinal facing in world coordinates.
//   N = -Z (0), E = +X (1), S = +Z (2), W = -X (3)
export type Facing = 0 | 1 | 2 | 3;

export const FACING_N: Facing = 0;
export const FACING_E: Facing = 1;
export const FACING_S: Facing = 2;
export const FACING_W: Facing = 3;

export interface UnitStats {
  hp: number;
  mp: number;
  pa: number;     // physical attack
  ma: number;     // magic attack
  speed: number;  // CT tick rate
  move: number;   // tile move range
  jump: number;   // vertical climb
  faith: number;  // 0..100
  bravery: number;// 0..100
  evasion: number;// Class Evade %, subtracted from physical-hit chance
}

export interface UnitDef {
  id: string;
  name: string;
  team: Team;
  jobId: string;
  level: number;
  stats: UnitStats;
  /** ability id slotted as a Reaction (e.g. 'counter', 'auto_potion'). */
  reaction?: string | null;
  /** ability id slotted as a Support (e.g. 'mp_recovery'). */
  support?: string | null;
  /** ability id slotted as a Movement (e.g. 'move_plus_1', 'move_hp_up'). */
  movement?: string | null;
  /**
   * Optional progression record. Player units carry one; enemies do not (they
   * read stats directly from `def.stats`, copied from the job baseline). When
   * present, `refreshStatsFromProgression()` is the source of truth for
   * display stats and supersedes `def.stats`.
   */
  progression?: UnitProgression;
  /** Reserved — Secondary Command UI deferred. */
  secondaryJobId?: string | null;
}

export interface StatusInstance {
  id: StatusId;
  /** Remaining ticks for duration-based statuses; -1 for permanent / conditional. */
  remainingTicks: number;
}

export class Unit {
  readonly id: string;
  name: string;
  team: Team;
  jobId: string;
  level: number;

  x: number;
  z: number;
  facing: Facing;

  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  pa: number;
  ma: number;
  speed: number;
  move: number;
  jump: number;
  faith: number;
  bravery: number;
  evasion: number;

  ct = 0;
  statuses: StatusInstance[] = [];

  /** Equipped ability slots — null when nothing in that slot. */
  reaction: string | null;
  support: string | null;
  movement: string | null;

  /** Player units carry a progression record; enemies have null. */
  progression: UnitProgression | null;
  /** Reserved — Secondary Command UI deferred. */
  secondaryJobId: string | null;

  constructor(def: UnitDef, x: number, z: number, facing: Facing) {
    this.id = def.id;
    this.name = def.name;
    this.team = def.team;
    this.jobId = def.jobId;
    this.level = def.level;
    this.x = x;
    this.z = z;
    this.facing = facing;

    this.hp = this.hpMax = def.stats.hp;
    this.mp = this.mpMax = def.stats.mp;
    this.pa = def.stats.pa;
    this.ma = def.stats.ma;
    this.speed = def.stats.speed;
    this.move = def.stats.move;
    this.jump = def.stats.jump;
    this.faith = def.stats.faith;
    this.bravery = def.stats.bravery;
    this.evasion = def.stats.evasion;

    this.reaction = def.reaction ?? null;
    this.support = def.support ?? null;
    this.movement = def.movement ?? null;

    this.progression = def.progression ?? null;
    this.secondaryJobId = def.secondaryJobId ?? null;

    if (this.progression) {
      this.level = this.progression.totalLevel;
      this.refreshStatsFromProgression();
    }
  }

  get isAlive(): boolean { return this.hp > 0; }

  /** `move` stat plus any movement-ability bonus (e.g. Move +1). */
  get effectiveMove(): number {
    if (!this.movement) return this.move;
    const ab = ABILITIES[this.movement];
    if (ab?.effect.kind === 'movement-move-plus') return this.move + ab.effect.amount;
    return this.move;
  }

  hasStatus(id: StatusId): boolean {
    return this.statuses.some(s => s.id === id);
  }

  /**
   * Apply a status. If the status belongs to a mutual-exclusion group, any
   * existing same-group status is removed first. Re-applying the same status
   * refreshes its duration.
   */
  addStatus(id: StatusId): void {
    const def = STATUS_DEFS[id];
    if (def.group) {
      this.statuses = this.statuses.filter(s => STATUS_DEFS[s.id].group !== def.group);
    } else {
      // de-dup
      this.statuses = this.statuses.filter(s => s.id !== id);
    }
    const remainingTicks = def.expiry.kind === 'duration' ? def.expiry.ticks : -1;
    this.statuses.push({ id, remainingTicks });
  }

  removeStatus(id: StatusId): boolean {
    const before = this.statuses.length;
    this.statuses = this.statuses.filter(s => s.id !== id);
    return this.statuses.length < before;
  }

  /**
   * For progression-backed units: recompute hp/mp/pa/ma/speed from raw × mult,
   * pull move/jump/faith/bravery from job + progression, and fully restore
   * hp/mp. Also clobbers any lingering `applyBreak` decrements (those are
   * battle-duration only, applied directly to the live fields).
   *
   * No-op for enemy units (`progression === null`).
   */
  refreshStatsFromProgression(): void {
    if (!this.progression) return;
    const s = computeDisplayStats(this.progression, this.jobId);
    this.hpMax = s.hp;
    this.mpMax = s.mp;
    this.hp = s.hp;
    this.mp = s.mp;
    this.pa = s.pa;
    this.ma = s.ma;
    this.speed = s.speed;
    this.move = s.move;
    this.jump = s.jump;
    this.faith = s.faith;
    this.bravery = s.bravery;
    this.evasion = s.evasion;
    this.level = this.progression.totalLevel;
  }
}
