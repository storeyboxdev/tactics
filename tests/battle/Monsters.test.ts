import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, Facing, Team,
} from '../../src/battle/Unit';
import { effectiveWeaponPower, PLACEHOLDER_WEAPON_POWER } from '../../src/battle/ActionResolver';
import { JOB_DEFS, PLAYABLE_JOB_IDS, isPlayableJob } from '../../src/data/jobs';
import { WEAPONS } from '../../src/data/weapons';
import { ABILITIES } from '../../src/data/abilities';
import { pickEnemyJobs } from '../../src/core/Bootstrap';

const MONSTERS = ['goblin', 'chocobo', 'red_panther', 'bomb'];

function monsterUnit(jobId: string, team: Team = 'enemy'): Unit {
  const job = JOB_DEFS[jobId];
  const stats: UnitStats = {
    hp: job.baseStats.hp, mp: job.baseStats.mp, pa: job.baseStats.pa,
    ma: job.baseStats.ma, speed: job.baseStats.speed, move: job.baseStats.move,
    jump: job.baseStats.jump, faith: job.baseStats.faith,
    bravery: job.baseStats.bravery, evasion: job.baseStats.evasion,
  };
  const def: UnitDef = { id: jobId, name: job.name, team, jobId, level: 1, stats };
  return new Unit(def, 0, 0, FACING_E as Facing);
}

describe('Monster bestiary', () => {
  it('all three monsters exist and are flagged isMonster', () => {
    for (const id of MONSTERS) {
      const job = JOB_DEFS[id];
      expect(job, id).toBeDefined();
      expect(job.isMonster, id).toBe(true);
    }
  });

  it('monsters have no unlock prereqs and no passive menu', () => {
    for (const id of MONSTERS) {
      const job = JOB_DEFS[id];
      expect(job.prereqs, `${id} prereqs`).toEqual([]);
      expect(job.learnableReactions.length
        + job.learnableSupports.length
        + job.learnableMovements.length, `${id} passives`).toBe(0);
    }
  });

  it('each monster has exactly one signature ability', () => {
    expect(JOB_DEFS.goblin.learnableActives).toEqual(['goblin_tackle']);
    expect(JOB_DEFS.red_panther.learnableActives).toEqual(['blaster']);
    expect(JOB_DEFS.chocobo.learnableActives).toEqual(['choco_cure']);
  });

  it('isPlayableJob excludes monsters, includes real jobs', () => {
    for (const id of MONSTERS) expect(isPlayableJob(id), id).toBe(false);
    expect(isPlayableJob('knight')).toBe(true);
    expect(isPlayableJob('squire')).toBe(true);
  });

  it('PLAYABLE_JOB_IDS contains the 20 real jobs and no monsters', () => {
    expect(PLAYABLE_JOB_IDS).toHaveLength(20);
    for (const id of MONSTERS) expect(PLAYABLE_JOB_IDS).not.toContain(id);
    expect(PLAYABLE_JOB_IDS).toContain('mime');
  });

  it('monster units resolve their claw weaponPower (a real weapon, not the placeholder)', () => {
    const goblin = monsterUnit('goblin');
    expect(effectiveWeaponPower(goblin)).toBe(WEAPONS.claw.weaponPower);
    expect(WEAPONS.claw.weaponPower).not.toBe(PLACEHOLDER_WEAPON_POWER);
  });

  it('monster stat profiles are distinct (Chocobo fast, Goblin sturdy, Panther hits hard)', () => {
    const g = JOB_DEFS.goblin.baseStats;
    const c = JOB_DEFS.chocobo.baseStats;
    const p = JOB_DEFS.red_panther.baseStats;
    expect(c.speed).toBeGreaterThan(g.speed);   // Chocobo darts
    expect(g.hp).toBeGreaterThan(p.hp);          // Goblin is the sturdy one
    expect(p.pa).toBeGreaterThan(g.pa);          // Panther hits hardest
  });
});

describe('Monster spawning', () => {
  // rng → 0.999 always picks the last element of the tier pool, where each
  // tier's newest monster sits.
  const pickLast = () => 0.999;

  it('Goblins can spawn from battle 2 (tier 1)', () => {
    const jobs = pickEnemyJobs(2, 4, pickLast);
    expect(jobs).toContain('goblin');
  });

  it('Chocobos join the pool by battle 4 (tier 2)', () => {
    const jobs = pickEnemyJobs(4, 4, pickLast);
    expect(jobs).toContain('chocobo');
  });

  it('Red Panthers appear in the full pool at battle 6+', () => {
    const jobs = pickEnemyJobs(6, 4, pickLast);
    expect(jobs).toContain('red_panther');
  });

  it('the first battle (0) is still monster-free — pure Squires', () => {
    const jobs = pickEnemyJobs(0, 5, Math.random);
    expect(jobs.every(j => j === 'squire')).toBe(true);
  });

  it('a spawned monster id builds a valid enemy unit profile', () => {
    const goblin = monsterUnit('goblin');
    expect(goblin.isAlive).toBe(true);
    expect(goblin.team).toBe('enemy');
    expect(JOB_DEFS[goblin.jobId].isMonster).toBe(true);
  });
});

describe('Monster signature abilities', () => {
  it("Goblin's Tackle is a range-1 physical-ranged strike above its claw", () => {
    const ab = ABILITIES.goblin_tackle;
    expect(ab.range).toBe(1);
    if (ab.effect.kind !== 'physical-ranged-damage') throw new Error('bad fixture');
    expect(ab.effect.weaponPower).toBeGreaterThan(WEAPONS.claw.weaponPower);
  });

  it("Red Panther's Blaster chains Don't Move via physical-damage-and-status", () => {
    const ab = ABILITIES.blaster;
    expect(ab.range).toBe(1);
    if (ab.effect.kind !== 'physical-damage-and-status') throw new Error('bad fixture');
    expect(ab.effect.statusId).toBe('dont_move');
  });

  it("Chocobo's Choco Cure is a flat HP heal — no MA scaling", () => {
    const ab = ABILITIES.choco_cure;
    if (ab.effect.kind !== 'flat-heal') throw new Error('bad fixture');
    expect(ab.effect.hp).toBe(30);
    expect(ab.effect.mp).toBeUndefined();
  });
});
