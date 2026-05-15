import { StatusId, STATUS_DEFS } from '../data/statuses';
import { ABILITIES } from '../data/abilities';
import { UnitProgression } from './Progression';
import { computeDisplayStats } from './Stats';

export type Team = 'player' | 'enemy';

/** FFT canon — KO'd units have 3 of their own turns before crystallizing. */
export const KO_COUNTDOWN_TURNS = 3;

// Cardinal facing in world coordinates.
//   N = -Z (0), E = +X (1), S = +Z (2), W = -X (3)
export type Facing = 0 | 1 | 2 | 3;

export const FACING_N: Facing = 0;
export const FACING_E: Facing = 1;
export const FACING_S: Facing = 2;
export const FACING_W: Facing = 3;

/** Returned by Unit.applyDamage so callers can log reaction triggers. */
export interface DamageResult {
  dealt: number;
  hpRestored: number;
  braveGained: number;
  /** True if a would-KO was interrupted by Reraise (HP restored, status consumed). */
  reraised: boolean;
  /** True if the Regenerator reaction applied the Regen status on this hit. */
  regenApplied: boolean;
}

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

  /**
   * Turns until a KO'd unit "crystallizes" (permanently lost). FFT canon: the
   * countdown ticks once each time the KO'd unit's CT would have reached 100.
   * `-1` while alive; set to `KO_COUNTDOWN_TURNS` (3) the moment hp drops to 0.
   */
  koTimer: number = -1;
  /** Once true, the unit is gone — its tile clears, no revive possible. */
  crystallized: boolean = false;
  /** Transient in-battle guard: set once a death-trigger (Bomb's Self-
   *  Destruct) has fired, so a KO'd creature doesn't re-explode each turn. */
  deathTriggerFired: boolean = false;
  /** Transient battle flag — true for the enemy leader in a Regicide
   *  objective. Killing this unit wins the battle outright. */
  isLeader: boolean = false;

  /**
   * True while a Jump-style ability is in flight. The unit is removed from
   * targeting / movement / turn order and their sprite hides. Flips back to
   * false when the scheduled action resolves.
   */
  airborne: boolean = false;

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

  /** `jump` stat plus any movement-ability bonus (e.g. Jump +1). */
  get effectiveJump(): number {
    if (!this.movement) return this.jump;
    const ab = ABILITIES[this.movement];
    if (ab?.effect.kind === 'movement-jump-plus') return this.jump + ab.effect.amount;
    return this.jump;
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
   * Single chokepoint for HP loss. Mutates `hp`, clamps at 0, starts the KO
   * countdown on the alive→KO transition, and fires reaction passives that
   * trigger on damage taken (HP Restore, Brave Up). Resolvers should call
   * this rather than mutating `hp` directly so the handshake is always
   * consistent. Returns a result object with the dealt amount and any
   * reaction-side-effects so the orchestrator can log them.
   */
  applyDamage(amount: number): DamageResult {
    if (amount <= 0) return { dealt: 0, hpRestored: 0, braveGained: 0, reraised: false, regenApplied: false };
    const before = this.hp;
    this.hp = Math.max(0, this.hp - amount);
    const dealt = before - this.hp;

    // Reraise interrupts a would-KO. Restore to 10% of hpMax and consume.
    // Runs before koTimer starts so the unit never enters the KO sequence.
    let reraised = false;
    if (this.hp === 0 && this.hasStatus('reraise')) {
      this.removeStatus('reraise');
      this.hp = Math.max(1, Math.ceil(this.hpMax * 0.10));
      reraised = true;
    }

    if (this.hp === 0 && this.koTimer < 0) {
      this.koTimer = KO_COUNTDOWN_TURNS;
    }

    let hpRestored = 0;
    let braveGained = 0;
    const reactionAb = this.reaction ? ABILITIES[this.reaction] : null;
    const eff = reactionAb?.effect;

    // HP Restore: alive AND HP at or below threshold → top up.
    if (eff?.kind === 'reaction-hp-restore' && this.hp > 0
        && this.hp <= Math.floor(this.hpMax * eff.thresholdPercent / 100)) {
      const heal = Math.max(1, Math.floor(this.hpMax * eff.hpPercent / 100));
      const beforeHeal = this.hp;
      this.hp = Math.min(this.hpMax, this.hp + heal);
      hpRestored = this.hp - beforeHeal;
    }

    // Brave Up: every damage instance bumps bravery, including poison ticks.
    // Sync to progression so the gain survives across battles.
    if (eff?.kind === 'reaction-brave-up' && this.isAlive) {
      const beforeBrave = this.bravery;
      this.bravery = Math.min(100, this.bravery + eff.amount);
      braveGained = this.bravery - beforeBrave;
      if (this.progression) this.progression.bravery = this.bravery;
    }

    // Regenerator: surviving a hit grants (or refreshes) the Regen status.
    let regenApplied = false;
    if (eff?.kind === 'reaction-regenerator' && this.isAlive) {
      this.addStatus('regen');
      regenApplied = true;
    }

    return { dealt, hpRestored, braveGained, reraised, regenApplied };
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
