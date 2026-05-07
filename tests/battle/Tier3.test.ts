import { describe, it, expect } from 'vitest';
import {
  Unit, UnitDef, UnitStats, FACING_E, FACING_W, Facing, Team,
} from '../../src/battle/Unit';
import {
  resolveSpell, resolveHeal, predictSpellDamage,
} from '../../src/battle/ActionResolver';
import { ABILITIES } from '../../src/data/abilities';
import { JOB_DEFS } from '../../src/data/jobs';

const stats = (over: Partial<UnitStats> = {}): UnitStats => ({
  hp: 100, mp: 30, pa: 5, ma: 8, speed: 8, move: 4, jump: 1,
  faith: 100, bravery: 50, evasion: 10,
  ...over,
});

function makeUnit(id: string, team: Team, x: number, z: number, facing: Facing, over: Partial<UnitStats> = {}): Unit {
  const def: UnitDef = { id, name: id, team, jobId: 'x', level: 1, stats: stats(over) };
  return new Unit(def, x, z, facing);
}

const rngHalf = () => 0.5;

describe('Tier-3 spell catalog', () => {
  it('White Mage learns Curaja and Holy', () => {
    expect(JOB_DEFS.white_mage.learnableActives).toContain('curaja');
    expect(JOB_DEFS.white_mage.learnableActives).toContain('holy');
  });

  it('Black Mage learns Flare', () => {
    expect(JOB_DEFS.black_mage.learnableActives).toContain('flare');
  });

  it('Holy spellpower exceeds tier-2 Black Mage spells', () => {
    const holyEff = ABILITIES['holy'].effect;
    const fire2Eff = ABILITIES['fire_2'].effect;
    if (holyEff.kind !== 'magic-damage' || fire2Eff.kind !== 'magic-damage') throw new Error('bad fixture');
    expect(holyEff.spellPower).toBeGreaterThan(fire2Eff.spellPower);
  });

  it('Flare deals more damage than Holy at matched faith', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const t = makeUnit('t', 'enemy',  1, 0, FACING_W, { hp: 999, faith: 100 });
    const flareEff = ABILITIES['flare'].effect;
    const holyEff = ABILITIES['holy'].effect;
    if (flareEff.kind !== 'magic-damage' || holyEff.kind !== 'magic-damage') throw new Error('bad fixture');
    const flareOut = resolveSpell(c, t, flareEff.spellPower, rngHalf);
    t.hp = 999;
    const holyOut  = resolveSpell(c, t, holyEff.spellPower, rngHalf);
    expect(flareOut.damage).toBeGreaterThan(holyOut.damage);
  });

  it('Curaja outheals Cura on the centered target', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const t = makeUnit('t', 'player', 1, 0, FACING_W, { hp: 1, faith: 100 });
    const curaEff = ABILITIES['cura'].effect;
    const curajaEff = ABILITIES['curaja'].effect;
    if (curaEff.kind !== 'magic-heal' || curajaEff.kind !== 'magic-heal') throw new Error('bad fixture');
    t.hp = 1; t.hpMax = 9999;
    const cura = resolveHeal(c, t, curaEff.spellPower, rngHalf);
    t.hp = 1;
    const curaja = resolveHeal(c, t, curajaEff.spellPower, rngHalf);
    expect(curaja.amount).toBeGreaterThan(cura.amount);
  });

  it('Holy carries the holy element through to predictions', () => {
    const ab = ABILITIES['holy'];
    if (ab.effect.kind !== 'magic-damage') throw new Error('bad fixture');
    expect(ab.effect.element).toBe('holy');
  });

  it('Flare is non-elemental (no element tag)', () => {
    const ab = ABILITIES['flare'];
    if (ab.effect.kind !== 'magic-damage') throw new Error('bad fixture');
    expect(ab.effect.element).toBeUndefined();
  });

  it('Magic Defense Up still discounts tier-3 magic damage', () => {
    const c = makeUnit('c', 'player', 0, 0, FACING_E, { ma: 8, faith: 100 });
    const baseT   = makeUnit('t1', 'enemy', 1, 0, FACING_W, { faith: 100 });
    const wardedT = makeUnit('t2', 'enemy', 1, 0, FACING_W, { faith: 100 });
    wardedT.support = 'magic_defense_up';
    expect(predictSpellDamage(c, wardedT, 32).damage)
      .toBeLessThan(predictSpellDamage(c, baseT, 32).damage);
  });
});
