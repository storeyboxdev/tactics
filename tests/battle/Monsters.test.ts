import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, Facing, Team,
} from '../../src/battle/Unit';
import { effectiveWeaponPower, PLACEHOLDER_WEAPON_POWER } from '../../src/battle/ActionResolver';
import { JOB_DEFS, PLAYABLE_JOB_IDS, isPlayableJob } from '../../src/data/jobs';
import { WEAPONS } from '../../src/data/weapons';

const MONSTERS = ['goblin', 'chocobo', 'red_panther'];

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

  it('monsters have no unlock prereqs and no learnable abilities', () => {
    for (const id of MONSTERS) {
      const job = JOB_DEFS[id];
      expect(job.prereqs, `${id} prereqs`).toEqual([]);
      expect(job.learnableActives, `${id} actives`).toEqual([]);
      expect(job.learnableReactions.length
        + job.learnableSupports.length
        + job.learnableMovements.length, `${id} passives`).toBe(0);
    }
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
