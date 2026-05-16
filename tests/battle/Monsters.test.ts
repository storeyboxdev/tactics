import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, Facing, Team,
} from '../../src/battle/Unit';
import { effectiveWeaponPower, PLACEHOLDER_WEAPON_POWER } from '../../src/battle/ActionResolver';
import { JOB_DEFS, PLAYABLE_JOB_IDS, isPlayableJob } from '../../src/data/jobs';
import { WEAPONS } from '../../src/data/weapons';
import { ABILITIES } from '../../src/data/abilities';
import { poolFor } from '../../src/core/Bootstrap';

const MONSTERS = ['goblin', 'chocobo', 'red_panther', 'bomb', 'skeleton'];

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
  it('all monsters exist and are flagged isMonster', () => {
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

  it("each monster's signature kit", () => {
    expect(JOB_DEFS.goblin.learnableActives).toEqual(['goblin_tackle', 'goblin_eye_gouge']);
    expect(JOB_DEFS.red_panther.learnableActives).toEqual(['blaster', 'panther_scratch']);
    expect(JOB_DEFS.chocobo.learnableActives).toEqual(['choco_cure', 'choco_ball']);
    // Bomb's identity is the on-death blast — no active kit, by design.
    expect(JOB_DEFS.bomb.learnableActives).toEqual([]);
    expect(JOB_DEFS.skeleton.learnableActives).toEqual(['bone_crush']);
  });

  it('the Skeleton spawns permanently Undead', () => {
    expect(JOB_DEFS.skeleton.innateStatuses).toEqual(['undead']);
    const skel = monsterUnit('skeleton');
    expect(skel.hasStatus('undead')).toBe(true);
  });

  it('non-undead monsters carry no innate status', () => {
    expect(JOB_DEFS.goblin.innateStatuses).toBeUndefined();
    expect(monsterUnit('goblin').hasStatus('undead')).toBe(false);
  });

  it('the Skeleton is sturdier and slower than a Goblin', () => {
    const skel = JOB_DEFS.skeleton.baseStats;
    const gob = JOB_DEFS.goblin.baseStats;
    expect(skel.hp).toBeGreaterThan(gob.hp);
    expect(skel.speed).toBeLessThan(gob.speed);
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
  it('Goblins enter the pool by battle 2', () => {
    expect(poolFor(2)).toContain('goblin');
    expect(poolFor(0)).not.toContain('goblin');
  });

  it('Chocobos join by battle 4', () => {
    expect(poolFor(4)).toContain('chocobo');
    expect(poolFor(2)).not.toContain('chocobo');
  });

  it('Red Panther and Bomb appear in the full pool at battle 6+', () => {
    const full = poolFor(6);
    expect(full).toContain('red_panther');
    expect(full).toContain('bomb');
  });

  it('the first battle (0) pool is pure Squires — monster-free', () => {
    expect(poolFor(0)).toEqual(['squire']);
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

  it("Goblin's Eye Gouge inflicts Poison, hitting between claw and Tackle", () => {
    const ab = ABILITIES.goblin_eye_gouge;
    expect(ab.range).toBe(1);
    if (ab.effect.kind !== 'physical-damage-and-status') throw new Error('bad fixture');
    expect(ab.effect.statusId).toBe('poison');
    const tackle = ABILITIES.goblin_tackle.effect;
    if (tackle.kind !== 'physical-ranged-damage') throw new Error('bad fixture');
    expect(ab.effect.weaponPower).toBeGreaterThan(WEAPONS.claw.weaponPower);
    expect(ab.effect.weaponPower).toBeLessThan(tackle.weaponPower);
  });

  it("Red Panther's Blaster chains Don't Move via physical-damage-and-status", () => {
    const ab = ABILITIES.blaster;
    expect(ab.range).toBe(1);
    if (ab.effect.kind !== 'physical-damage-and-status') throw new Error('bad fixture');
    expect(ab.effect.statusId).toBe('dont_move');
  });

  it("Red Panther's Scratch out-powers Blaster — the finisher in the combo", () => {
    const ab = ABILITIES.panther_scratch;
    expect(ab.range).toBe(1);
    if (ab.effect.kind !== 'physical-ranged-damage') throw new Error('bad fixture');
    const blaster = ABILITIES.blaster.effect;
    if (blaster.kind !== 'physical-damage-and-status') throw new Error('bad fixture');
    expect(ab.effect.weaponPower).toBeGreaterThan(blaster.weaponPower);
  });

  it("Skeleton's Bone Crush is a range-1 physical strike above its claw", () => {
    const ab = ABILITIES.bone_crush;
    expect(ab.range).toBe(1);
    if (ab.effect.kind !== 'physical-ranged-damage') throw new Error('bad fixture');
    expect(ab.effect.weaponPower).toBeGreaterThan(WEAPONS.claw.weaponPower);
  });

  it("Chocobo's Choco Cure is a flat HP heal — no MA scaling", () => {
    const ab = ABILITIES.choco_cure;
    if (ab.effect.kind !== 'flat-heal') throw new Error('bad fixture');
    expect(ab.effect.hp).toBe(30);
    expect(ab.effect.mp).toBeUndefined();
  });

  it("Chocobo's Choco Ball is a ranged physical poke", () => {
    const ab = ABILITIES.choco_ball;
    expect(ab.range).toBe(3);
    if (ab.effect.kind !== 'physical-ranged-damage') throw new Error('bad fixture');
    expect(ab.effect.weaponPower).toBe(WEAPONS.claw.weaponPower);
  });
});
