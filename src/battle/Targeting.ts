import { Unit } from './Unit';
import { BattleMap } from './Map';
import { Ability } from '../data/abilities';
import { effectiveWeapon } from './ActionResolver';

const ADJACENT: [number, number][] = [
  [ 1, 0],
  [-1, 0],
  [ 0, 1],
  [ 0,-1],
];

/**
 * Tiles a basic Attack can reach — opposing units within the actor's
 * effective-weapon range (Manhattan). Melee weapons reach 1; a Bow or
 * Gun reaches further.
 */
export function attackTargets(actor: Unit, units: readonly Unit[]): { x: number; z: number }[] {
  const range = effectiveWeapon(actor)?.range ?? 1;
  const out: { x: number; z: number }[] = [];
  for (const u of units) {
    if (u.team === actor.team || !u.isAlive) continue;
    const d = Math.abs(u.x - actor.x) + Math.abs(u.z - actor.z);
    if (d >= 1 && d <= range) out.push({ x: u.x, z: u.z });
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
 * the given ability. Targeting rules per effect kind:
 *   - debuff / magic-damage / physical-ranged-damage:  enemies only
 *   - magic-heal:                                      allies (incl. self)
 *   - inflict-status (targetTeam):                     enemies, allies, or any
 *
 * `from` overrides the origin point — used by AI scoring to evaluate a target
 * set as if the actor had moved to a candidate tile.
 */
export function abilityTargets(
  actor: Unit, ability: Ability, map: BattleMap, units: readonly Unit[],
  from?: { x: number; z: number },
): { x: number; z: number }[] {
  let allowEnemy = false, allowAlly = false, allowSelf = false;
  const isRevive = ability.effect.kind === 'revive';
  if (ability.effect.kind === 'inflict-status' || ability.effect.kind === 'stat-shift') {
    const t = ability.effect.targetTeam;
    allowEnemy = t === 'enemy' || t === 'any';
    allowAlly  = t === 'ally'  || t === 'any';
    allowSelf  = t === 'ally'  || t === 'any';
  } else if (ability.effect.kind === 'magic-heal' || ability.effect.kind === 'flat-heal') {
    allowAlly = true;
    allowSelf = true;
  } else if (ability.effect.kind === 'cure-status') {
    // Cure-status acts like a heal — alive allies (and self) only. Tile must
    // contain an ally who has ≥1 of the listed statuses; a clean target is
    // not a valid pick.
    allowAlly = true;
    allowSelf = true;
    allowEnemy = ability.effect.targetTeam === 'any';
  } else if (isRevive) {
    // KO'd allies only — self can't revive itself even at allowSelf=true.
    allowAlly = true;
  } else {
    allowEnemy = true;
  }

  const ox = from?.x ?? actor.x;
  const oz = from?.z ?? actor.z;

  // Single-target cure-status filters out clean targets (no point picking a
  // healthy ally). AoE cure-status (Stigma Magic) skips the filter — the
  // cast lands anywhere in range; the AoE itself decides who actually
  // benefits.
  const cureStatuses: readonly string[] | null =
    ability.effect.kind === 'cure-status' && !ability.area
      ? ability.effect.statuses : null;

  const out: { x: number; z: number }[] = [];
  for (let dx = -ability.range; dx <= ability.range; dx++) {
    for (let dz = -ability.range; dz <= ability.range; dz++) {
      const m = Math.abs(dx) + Math.abs(dz);
      if (m > ability.range) continue;
      // Self-centered AoE (Draw Out katanas, Cheer Song): the caster's tile
      // is a valid origin even when the effect itself doesn't target self.
      if (m === 0 && !allowSelf && !ability.area) continue;
      const x = ox + dx;
      const z = oz + dz;
      if (!map.inBounds(x, z)) continue;
      const u = isRevive ? unitAtAny(units, x, z) : unitAt(units, x, z);
      if (!u) continue;
      // Revive needs a KO'd target that hasn't crystallized yet; everything
      // else needs a living one.
      if (isRevive && (u.isAlive || u.crystallized)) continue;
      if (u === actor) {
        // Self-centered AoE (Draw Out katanas, Cheer Song): the caster's
        // tile is a valid origin even for damage effects that wouldn't
        // normally target self — affectedUnits filters out the caster
        // by the team rule, so no friendly fire.
        if (!allowSelf && !ability.area) continue;
      } else if (u.team === actor.team) {
        if (!allowAlly) continue;
      } else {
        if (!allowEnemy) continue;
      }
      // Cure-status: skip targets with none of the listed statuses to clean up.
      if (cureStatuses && !cureStatuses.some(s => u.statuses.some(x => x.id === s))) continue;
      out.push({ x, z });
    }
  }
  return out;
}

export function unitAt(units: readonly Unit[], x: number, z: number): Unit | undefined {
  return units.find(u => u.isAlive && !u.airborne && u.x === x && u.z === z);
}

/**
 * Includes KO'd units. Used by revive targeting and any future inspector that
 * wants to find a unit standing on a tile regardless of state.
 */
export function unitAtAny(units: readonly Unit[], x: number, z: number): Unit | undefined {
  return units.find(u => u.x === x && u.z === z);
}

/**
 * Manhattan-radius cross around (cx, cz), clamped to map bounds. The center
 * tile is included. Used both for visual AoE highlight and for collecting
 * affected units in the resolver. `radius = 0` returns just the center tile.
 */
export function aoeTiles(
  cx: number, cz: number, radius: number, map: BattleMap,
): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      if (Math.abs(dx) + Math.abs(dz) > radius) continue;
      const x = cx + dx;
      const z = cz + dz;
      if (!map.inBounds(x, z)) continue;
      out.push({ x, z });
    }
  }
  return out;
}

/**
 * The list of units that an ability cast on (cx, cz) would actually affect,
 * filtered by the ability's per-effect targeting rule (enemy / ally / any).
 * For non-AoE abilities, this is at most one unit (the unit standing on the
 * center tile). The center unit may or may not pass the team filter.
 */
export function affectedUnits(
  caster: Unit, ability: Ability, cx: number, cz: number,
  map: BattleMap, units: readonly Unit[],
): Unit[] {
  const radius = ability.area?.radius ?? 0;
  const tiles = aoeTiles(cx, cz, radius, map);
  const eff = ability.effect;

  // Mirror the per-effect targeting logic from abilityTargets.
  let allowEnemy = false, allowAlly = false, allowSelf = false;
  const isRevive = eff.kind === 'revive';
  if (eff.kind === 'inflict-status' || eff.kind === 'stat-shift') {
    const t = eff.targetTeam;
    allowEnemy = t === 'enemy' || t === 'any';
    allowAlly  = t === 'ally'  || t === 'any';
    allowSelf  = t === 'ally'  || t === 'any';
  } else if (eff.kind === 'magic-heal' || eff.kind === 'flat-heal') {
    allowAlly = true;
    allowSelf = true;
  } else if (eff.kind === 'cure-status') {
    allowAlly = true;
    allowSelf = true;
    allowEnemy = eff.targetTeam === 'any';
  } else if (isRevive) {
    allowAlly = true;
  } else {
    allowEnemy = true;
  }

  const out: Unit[] = [];
  for (const t of tiles) {
    const u = isRevive ? unitAtAny(units, t.x, t.z) : unitAt(units, t.x, t.z);
    if (!u) continue;
    if (isRevive && (u.isAlive || u.crystallized)) continue;
    if (u === caster) {
      if (allowSelf) out.push(u);
    } else if (u.team === caster.team) {
      if (allowAlly) out.push(u);
    } else {
      if (allowEnemy) out.push(u);
    }
  }
  return out;
}
