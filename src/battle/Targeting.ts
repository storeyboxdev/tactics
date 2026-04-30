import { Unit } from './Unit';
import { BattleMap } from './Map';
import { Ability } from '../data/abilities';

const ADJACENT: [number, number][] = [
  [ 1, 0],
  [-1, 0],
  [ 0, 1],
  [ 0,-1],
];

export function meleeAttackTargets(actor: Unit, map: BattleMap, units: readonly Unit[]): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const [dx, dz] of ADJACENT) {
    const x = actor.x + dx;
    const z = actor.z + dz;
    if (!map.inBounds(x, z)) continue;
    const t = unitAt(units, x, z);
    if (t && t.team !== actor.team) out.push({ x, z });
  }
  return out;
}

export function potionTargets(actor: Unit, map: BattleMap, units: readonly Unit[]): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [{ x: actor.x, z: actor.z }];
  for (const [dx, dz] of ADJACENT) {
    const x = actor.x + dx;
    const z = actor.z + dz;
    if (!map.inBounds(x, z)) continue;
    const t = unitAt(units, x, z);
    if (t && t !== actor && t.team === actor.team) out.push({ x, z });
  }
  return out;
}

/**
 * Tiles within Manhattan range of the actor that contain a valid target for
 * the given ability. Friend-or-foe filter depends on ability effect:
 *   - debuff / magic-damage → enemies only
 */
export function abilityTargets(actor: Unit, ability: Ability, map: BattleMap, units: readonly Unit[]): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let dx = -ability.range; dx <= ability.range; dx++) {
    for (let dz = -ability.range; dz <= ability.range; dz++) {
      const m = Math.abs(dx) + Math.abs(dz);
      if (m === 0 || m > ability.range) continue;
      const x = actor.x + dx;
      const z = actor.z + dz;
      if (!map.inBounds(x, z)) continue;
      const u = unitAt(units, x, z);
      if (!u) continue;
      // For now both effect kinds target enemies
      if (u.team === actor.team) continue;
      out.push({ x, z });
    }
  }
  return out;
}

export function unitAt(units: readonly Unit[], x: number, z: number): Unit | undefined {
  return units.find(u => u.isAlive && u.x === x && u.z === z);
}
