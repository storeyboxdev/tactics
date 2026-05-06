import * as THREE from 'three';
import { BattleMap, MapData } from './battle/Map';
import { Unit, UnitDef, UnitStats, FACING_E, FACING_W } from './battle/Unit';
import { TurnSystem, PendingSpell } from './battle/TurnSystem';
import { MovePlan } from './battle/Movement';
import {
  meleeAttackTargets, potionTargets, abilityTargets, unitAt, unitAtAny,
  affectedUnits, aoeTiles,
} from './battle/Targeting';
import {
  AttackOutcome, resolveAttack, resolvePotion, resolveSpell, resolveRangedAttack, resolveHeal,
  resolveRevive, applyStatShift, applyBreak, facingTowards,
  predictAttackDamage, predictSpellDamage, predictRangedAttack, predictHeal,
  physicalHitChance, magicStatusHitChance, rollHit, relativeFacing,
} from './battle/ActionResolver';
import { HeuristicAi, EnemyController } from './battle/Ai';
import {
  awardExp, awardJp, learnedActivesInJob, jobLevelFor,
} from './battle/Progression';
import { computeDisplayStats } from './battle/Stats';
import { ABILITIES, Ability } from './data/abilities';
import { JOB_DEFS } from './data/jobs';
import { STATUS_DEFS } from './data/statuses';
import { MapRenderer } from './render/MapRenderer';
import { UnitRenderer } from './render/UnitRenderer';
import { UnitOverlays } from './render/UnitOverlays';
import { ProjectileRenderer } from './render/ProjectileRenderer';
import { CameraController } from './render/CameraController';
import { Cursor } from './render/Cursor';
import { Hud, SkillEntry, SkillGroup } from './render/Hud';
import { InputController } from './input/InputController';
import { AssetLoader } from './core/AssetLoader';
import { loadSave, SavedUnit } from './core/Save';
import { defaultRoster } from './core/Bootstrap';
import { showRosterScreen } from './render/RosterScreen';
import grasslandJson from './data/maps/grassland.json';

// ─────────────────────────────────────────────────────────────────────────────
// Renderer / scene setup
// ─────────────────────────────────────────────────────────────────────────────

const app = document.getElementById('app');
if (!app) throw new Error('#app not found');

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0a0a14);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 0.95);
sun.position.set(8, 14, 6);
scene.add(sun);

const map = new BattleMap(grasslandJson as unknown as MapData);
const mapRenderer = new MapRenderer(map);
scene.add(mapRenderer.group);

// ─────────────────────────────────────────────────────────────────────────────
// Unit setup — stats and learnable abilities come from JOB_DEFS (src/data/jobs.ts)
// ─────────────────────────────────────────────────────────────────────────────

interface EnemySeed { id: string; name: string; jobId: string; x: number; z: number; }

/**
 * Default reaction/support/movement loadout per job — used to flesh out
 * enemies and to seed the *first-ever* player roster (`defaultRoster`-built
 * units start with no equipped passives, which would feel barren in the very
 * first battle). Once a player unit's save exists, their saved equip slots
 * win.
 */
const JOB_DEFAULT_LOADOUT: Record<string, { reaction: string | null; support: string | null; movement: string | null }> = {
  knight:     { reaction: 'counter',     support: null,          movement: 'move_plus_1' },
  squire:     { reaction: 'counter',     support: null,          movement: 'move_plus_1' },
  chemist:    { reaction: 'auto_potion', support: 'mp_recovery', movement: null },
  black_mage: { reaction: null,          support: 'mp_recovery', movement: 'move_hp_up' },
  time_mage:  { reaction: null,          support: 'mp_recovery', movement: 'move_hp_up' },
  oracle:     { reaction: 'auto_potion', support: 'mp_recovery', movement: null },
};

function buildEnemy(seed: EnemySeed): Unit {
  const job = JOB_DEFS[seed.jobId];
  if (!job) throw new Error(`unknown jobId: ${seed.jobId}`);
  const loadout = JOB_DEFAULT_LOADOUT[seed.jobId] ?? { reaction: null, support: null, movement: null };
  const def: UnitDef = {
    id: seed.id, name: seed.name, team: 'enemy',
    jobId: seed.jobId, level: 1, stats: { ...job.baseStats } as UnitStats,
    reaction: loadout.reaction, support: loadout.support, movement: loadout.movement,
  };
  return new Unit(def, seed.x, seed.z, FACING_W);
}

function buildPlayerUnit(saved: SavedUnit, x: number, z: number): Unit {
  const job = JOB_DEFS[saved.jobId];
  if (!job) throw new Error(`buildPlayerUnit: unknown jobId ${saved.jobId}`);
  const fallback = JOB_DEFAULT_LOADOUT[saved.jobId] ?? { reaction: null, support: null, movement: null };
  const def: UnitDef = {
    id: saved.id, name: saved.name, team: 'player',
    jobId: saved.jobId, level: saved.progression.totalLevel,
    // `stats` will be overwritten by refreshStatsFromProgression() inside the
    // Unit ctor (because progression is set), but the type requires a full
    // UnitStats — `job.baseStats` is the natural placeholder.
    stats: { ...job.baseStats } as UnitStats,
    // Saved slots win when set; otherwise fall back to job defaults so the
    // very first battle isn't barren.
    reaction: saved.reaction ?? fallback.reaction,
    support:  saved.support  ?? fallback.support,
    movement: saved.movement ?? fallback.movement,
    progression: saved.progression,
    secondaryJobId: saved.secondaryJobId,
  };
  return new Unit(def, x, z, FACING_E);
}

const playerSpawns = map.spawns.player;
const enemySpawns  = map.spawns.enemy;
// Mirror-matching the Squire starter roster — keeps battle 1 winnable while
// the player has zero learned actives. Crank this up (or vary jobs) once the
// roster has spent a few battles' worth of JP.
const enemyJobs    = ['squire', 'squire', 'squire', 'squire', 'squire'];

const save = loadSave();
const roster: SavedUnit[] = save?.roster ?? defaultRoster();

const units: Unit[] = [];
playerSpawns.forEach(([x, z], i) => {
  const saved = roster[i];
  if (!saved) return; // roster smaller than spawn count — leave the slot empty
  units.push(buildPlayerUnit(saved, x, z));
});
enemySpawns.forEach(([x, z], i) => units.push(buildEnemy({
  id: `e${i + 1}`, name: `E${i + 1}`, jobId: enemyJobs[i], x, z,
})));

const unitRenderer = new UnitRenderer(units, map);
scene.add(unitRenderer.group);

const unitOverlays = new UnitOverlays(units, map);

const projectiles = new ProjectileRenderer(map);
scene.add(projectiles.group);

const cursor = new Cursor(map);
scene.add(cursor.group);

const cam = new CameraController(
  new THREE.Vector3(map.width / 2, 0, map.depth / 2),
  20,
);

const turns = new TurnSystem(units);
const hud = new Hud();

// Per-tick status events come from TurnSystem. Mirror them in the action log
// and trigger the KO animation if poison drops a unit to 0.
turns.setTickListener((ev) => {
  if (ev.kind === 'crystal') {
    hud.log(`${ev.unit.name} crystallizes — gone for the rest of the battle.`);
    return;
  }
  const def = STATUS_DEFS[ev.statusId];
  if (ev.kind === 'status-damage') {
    hud.log(`${ev.unit.name} takes ${ev.amount} ${def.name} damage` + (ev.ko ? ` — ${ev.unit.name} KO'd` : ''));
    if (ev.ko) unitRenderer.playKO(ev.unit);
  } else if (ev.kind === 'status-heal') {
    hud.log(`${ev.unit.name} regenerates ${ev.amount} HP from ${def.name}`);
  } else {
    hud.log(`${ev.unit.name}'s ${def.name} wears off`);
  }
});

const input = new InputController(
  renderer.domElement,
  cam.camera,
  mapRenderer,
  unitRenderer,
  cursor,
  units,
);

// ─────────────────────────────────────────────────────────────────────────────
// Battle orchestration
// ─────────────────────────────────────────────────────────────────────────────

const COLOR_MOVE   = 0x4f9fff;
const COLOR_ATTACK = 0xff5b5b;
const COLOR_HEAL   = 0x6fdc8c;
const COLOR_MAGIC  = 0xb86fff;
const COLOR_FACING = 0xffe14a;

const ai: EnemyController = new HeuristicAi();

let currentActor: Unit | null = null;
let hasMoved = false;
let hasActed = false;
let battleOver = false;

function checkBattleEnd(): 'player' | 'enemy' | null {
  const playerAlive = units.some(u => u.team === 'player' && u.isAlive);
  const enemyAlive  = units.some(u => u.team === 'enemy'  && u.isAlive);
  if (!enemyAlive)  return 'player';
  if (!playerAlive) return 'enemy';
  return null;
}

function activateNext() {
  if (battleOver) return;
  hud.clearActionMenu();
  input.cancel();
  const winner = checkBattleEnd();
  if (winner) {
    battleOver = true;
    currentActor = null;
    cursor.clearActiveTile();
    refreshHud();
    hud.setStatus(winner === 'player' ? 'Victory!' : 'Defeat.');
    hud.showResult(winner, () => showRosterScreen(units));
    return;
  }
  const event = turns.advance();
  if (event.kind === 'spell') {
    resolveScheduledSpell(event.spell);
    refreshHud();
    if (checkBattleEnd()) { activateNext(); return; }
    activateNext();
    return;
  }
  const actor = event.unit;

  // Blocked-turn statuses (Sleep, Stop) skip the actor's turn entirely.
  const blocking = actor.statuses.find(s => STATUS_DEFS[s.id].blocksTurn);
  if (blocking) {
    hud.log(`${actor.name} is ${STATUS_DEFS[blocking.id].name} — turn skipped`);
    turns.endTurn(actor, { moved: false, acted: false });
    activateNext();
    return;
  }

  currentActor = actor;
  hasMoved = false;
  hasActed = false;
  refreshHud();
  if (actor.team === 'player') {
    hud.setStatus(`${actor.name}'s turn (${actor.jobId}) — choose an action`);
    showActionMenu();
    beginMove(); // default into Move targeting; player can switch via menu
  } else {
    hud.setStatus(`${actor.name} (enemy) thinking...`);
    setTimeout(() => enemyAutoTurn(actor), 600);
  }
}

function showActionMenu() {
  if (!currentActor) return;
  hud.showActionMenu({
    canMove: !hasMoved,
    canAct:  !hasActed,
    skillGroups: actionMenuGroupsFor(currentActor),
    onMove:   () => beginMove(),
    onAttack: () => beginAttack(),
    onItem:   () => beginItem(),
    onWait:   () => endTurn(),
  });
}

/**
 * Builds the action menu's skill groups: primary job's learned actives, and
 * — if a Secondary Command is set — that secondary job's learned actives.
 *
 * Player units only see abilities they've LEARNED inside the source job;
 * enemies (no progression) keep the legacy "all learnable" path so they
 * remain a credible threat without a training history.
 */
function actionMenuGroupsFor(actor: Unit): SkillGroup[] {
  const groups: SkillGroup[] = [];
  groups.push({
    label: jobLabel(actor.jobId, 'primary'),
    skills: skillsFor(actor, actor.jobId),
  });
  if (actor.secondaryJobId && actor.secondaryJobId !== actor.jobId) {
    groups.push({
      label: jobLabel(actor.secondaryJobId, 'secondary'),
      skills: skillsFor(actor, actor.secondaryJobId),
    });
  }
  return groups;
}

function skillsFor(actor: Unit, jobId: string): SkillEntry[] {
  const ids = actor.progression
    ? learnedActivesInJob(actor.progression, jobId)
    : (JOB_DEFS[jobId]?.learnableActives ?? []);
  return ids.map(id => {
    const ab = ABILITIES[id];
    return {
      id,
      label: skillLabel(ab),
      enabled: actor.mp >= ab.mpCost,
      onPick: () => beginSkill(id),
    };
  });
}

function jobLabel(jobId: string, role: 'primary' | 'secondary'): string {
  const name = JOB_DEFS[jobId]?.name ?? jobId;
  return `${name} (${role})`;
}

function skillLabel(ab: Ability): string {
  const tags: string[] = [];
  if (ab.mpCost > 0)     tags.push(`${ab.mpCost}MP`);
  if (ab.chargeTime > 0) tags.push(`CT${ab.chargeTime}`);
  return tags.length === 0 ? ab.name : `${ab.name} (${tags.join(', ')})`;
}

function beginMove() {
  if (!currentActor || hasMoved) return;
  const unit = currentActor;
  const plan = new MovePlan(unit, map, units);
  input.beginPick({
    tiles: plan.endTiles().map(t => ({ x: t.x, z: t.z })),
    color: COLOR_MOVE,
    onPick: (x, z) => {
      const path = plan.pathTo(x, z);
      if (path.length < 2) { showActionMenu(); return; }
      input.setAnimating(true);
      hud.clearActionMenu();
      unitRenderer.startMove(unit, path, () => {
        input.setAnimating(false);
        hasMoved = true;
        applyMovementEndHook(unit);
        refreshHud();
        if (!autoEndIfDone()) showActionMenu();
      });
    },
  });
}

function beginAttack() {
  if (!currentActor || hasActed) return;
  const unit = currentActor;
  const tiles = meleeAttackTargets(unit, map, units);
  if (tiles.length === 0) { hud.log(`${unit.name}: no melee targets`); return; }
  const basePrompt = `${unit.name}: pick an attack target — right-click to cancel`;
  hud.setStatus(basePrompt);
  input.beginPick({
    tiles, color: COLOR_ATTACK,
    onPick: (x, z) => {
      const target = unitAt(units, x, z);
      if (!target) return;
      unit.facing = facingTowards(unit.x, unit.z, target.x, target.z);
      const out = resolveAttack(unit, target, map);
      logAttack(out);
      playAttackVisual(out);
      awardForAttack(out);
      hasActed = true;
      refreshHud();
      if (!autoEndIfDone()) showActionMenu();
    },
    onHover: (x, z) => {
      hud.setStatus(previewWith(basePrompt, hoverPreview(unit, x, z)));
    },
  });
}

function beginItem() {
  if (!currentActor || hasActed) return;
  const unit = currentActor;
  const tiles = potionTargets(unit, map, units);
  const basePrompt = `${unit.name}: pick a Potion target`;
  hud.setStatus(basePrompt);
  input.beginPick({
    tiles, color: COLOR_HEAL,
    onPick: (x, z) => {
      const target = unitAt(units, x, z);
      if (!target) return;
      const out = resolvePotion(unit, target);
      hud.log(`${unit.name} uses Potion on ${target.name}: +${out.amount} HP`);
      // Items always pay JP to the actor's job; healing self/ally is not an
      // enemy-affecting action so no EXP.
      awardForAction(unit, false);
      hasActed = true;
      refreshHud();
      if (!autoEndIfDone()) showActionMenu();
    },
    onHover: (x, z) => {
      hud.setStatus(previewWith(basePrompt, potionPreview(unit, x, z)));
    },
  });
}

function beginSkill(abilityId: string) {
  if (!currentActor || hasActed) return;
  const unit = currentActor;
  const ab = ABILITIES[abilityId];
  if (!ab) return;
  if (unit.mp < ab.mpCost) { hud.log(`${unit.name}: not enough MP for ${ab.name}`); return; }

  const tiles = abilityTargets(unit, ab, map, units);
  if (tiles.length === 0) { hud.log(`${unit.name}: no targets in range for ${ab.name}`); return; }

  const color =
    ab.effect.kind === 'magic-heal' ? COLOR_HEAL :
    ab.type === 'magical'           ? COLOR_MAGIC :
                                      COLOR_ATTACK;
  const basePrompt = `${unit.name}: pick a target for ${ab.name}`;
  hud.setStatus(basePrompt);
  input.beginPick({
    tiles, color,
    onPick: (x, z) => {
      const target = unitAt(units, x, z);
      if (!target) return;
      unit.facing = facingTowards(unit.x, unit.z, target.x, target.z);
      unit.mp = Math.max(0, unit.mp - ab.mpCost);

      if (ab.chargeTime > 0) {
        const resolveTick = turns.tick + ab.chargeTime;
        turns.schedule({ caster: unit, abilityId: ab.id, target: { x, z }, resolveTick });
        hud.log(`${unit.name} begins casting ${ab.name} on ${target.name} (resolves in ${ab.chargeTime} ticks)`);
        if (ab.castAirborne) {
          unit.airborne = true;
          hud.log(`  ↳ ${unit.name} leaps into the air`);
          // Jump leaves the lancer off the field — no further movement, no
          // facing pick. Force-end the turn now.
          hasActed = true;
          refreshHud();
          endTurn();
          return;
        }
      } else {
        applyInstantAbility(unit, ab, x, z);
      }

      hasActed = true;
      refreshHud();
      if (!autoEndIfDone()) showActionMenu();
    },
    onHover: (x, z) => {
      hud.setStatus(previewWith(basePrompt, abilityPreview(unit, ab, x, z)));
    },
  });
}

/**
 * Apply an instant (non-charged) ability cast on tile (cx, cz). For AoE
 * abilities, every unit in the radius matching the effect's targeting rule
 * takes its own independent hit / damage roll. EXP/JP is awarded once for
 * the cast (not per affected unit) — `affectedEnemy` is true if at least
 * one enemy was actually impacted.
 */
function applyInstantAbility(actor: Unit, ab: Ability, cx: number, cz: number) {
  const targets = collectAbilityTargets(actor, ab, cx, cz);
  if (targets.length === 0) {
    hud.log(`${ab.name}: no valid targets`);
    return;
  }
  // Ranged-physical AoE plays the attacker's bow animation once for the
  // cast; per-target sprite reactions still fire from applyEffectToTarget.
  let rangedAnimPlayed = false;
  let affectedEnemy = false;
  for (const target of targets) {
    if (ab.effect.kind === 'physical-ranged-damage' && !rangedAnimPlayed) {
      unitRenderer.playRangedAttack(actor);
      rangedAnimPlayed = true;
    }
    if (applyEffectToTarget(actor, ab, target)) affectedEnemy = true;
  }
  awardForAction(actor, affectedEnemy);
}

function collectAbilityTargets(actor: Unit, ab: Ability, cx: number, cz: number): Unit[] {
  if (ab.area) return affectedUnits(actor, ab, cx, cz, map, units);
  // Revive walks past `isAlive`; everything else needs a living target.
  if (ab.effect.kind === 'revive') {
    const t = unitAtAny(units, cx, cz);
    return t && !t.isAlive && !t.crystallized && t.team === actor.team ? [t] : [];
  }
  const t = unitAt(units, cx, cz);
  return t ? [t] : [];
}

/**
 * Apply one ability's effect to a single target. Returns `true` iff the
 * target was an enemy AND the effect actually landed (used for EXP gating).
 *
 * No award is issued here — `applyInstantAbility` aggregates one award per
 * cast, so an AoE Pebble Blast catching three enemies still only credits
 * the caster once. Animations / log lines fire per affected target.
 */
function applyEffectToTarget(actor: Unit, ab: Ability, target: Unit): boolean {
  const eff = ab.effect;
  if (eff.kind === 'debuff') {
    const out = applyBreak(actor, target, eff.stat, eff.amount);
    const statLabel = out.stat.toUpperCase();
    if (out.hit) {
      hud.log(`${actor.name} ${ab.name} on ${target.name}: ${statLabel} -${out.amount}`);
    } else {
      hud.log(`${actor.name} ${ab.name} on ${target.name}: missed`);
      hud.showFloatingMiss(target);
    }
    return target.team === 'enemy' && out.hit;
  }
  if (eff.kind === 'magic-damage') {
    const out = resolveSpell(actor, target, eff.spellPower);
    hud.log(`${ab.name}: ${actor.name} → ${target.name} for ${out.damage} dmg`);
    playSpellHitVisual(target);
    return target.team === 'enemy' && out.damage > 0;
  }
  if (eff.kind === 'magic-heal') {
    const out = resolveHeal(actor, target, eff.spellPower);
    hud.log(`${ab.name}: ${actor.name} → ${target.name} for +${out.amount} HP`);
    return false; // heals never grant EXP
  }
  if (eff.kind === 'revive') {
    const out = resolveRevive(actor, target, eff.hpPercent);
    if (out.amount > 0) {
      hud.log(`${ab.name}: ${actor.name} revives ${target.name} (${out.amount} HP)`);
      unitRenderer.revive(target);
      hud.showFloatingAward(target, ['REVIVED']);
    }
    return false;
  }
  if (eff.kind === 'physical-ranged-damage') {
    const out = resolveRangedAttack(actor, target, eff.weaponPower, map);
    // Damage was applied synchronously in the resolver. The projectile is
    // a visual delay — when it lands, the per-target hurt anim and any
    // crit/miss toast fire so the timing reads as "shot → impact".
    if (out.hit) {
      const critTag = out.crit ? ' ★CRIT' : '';
      hud.log(`${ab.name}: ${actor.name} → ${target.name} for ${out.damage} dmg${critTag} (${out.facing})`);
      projectiles.fire(actor, target, () => {
        playSpellHitVisual(target);
        if (out.crit) hud.showFloatingCrit(target);
      });
    } else {
      hud.log(`${ab.name}: ${actor.name} misses ${target.name}`);
      projectiles.fire(actor, target, () => hud.showFloatingMiss(target));
    }
    return target.team === 'enemy' && out.hit;
  }
  if (eff.kind === 'inflict-status') {
    const chance = magicStatusHitChance(actor, target, eff.baseAccuracy);
    if (rollHit(chance, Math.random)) {
      target.addStatus(eff.statusId);
      const def = STATUS_DEFS[eff.statusId];
      hud.log(`${ab.name}: ${target.name} is now ${def.name}`);
      return target.team === 'enemy';
    }
    hud.log(`${ab.name}: ${target.name} resists`);
    hud.showFloatingMiss(target);
    return false;
  }
  if (eff.kind === 'stat-shift') {
    const chance = magicStatusHitChance(actor, target, eff.baseAccuracy);
    if (rollHit(chance, Math.random)) {
      const out = applyStatShift(actor, target, eff.stat, eff.amount);
      const arrow = eff.amount > 0 ? '↑' : '↓';
      hud.log(
        `${ab.name}: ${target.name} ${eff.stat.toUpperCase()} ` +
        `${out.before} ${arrow} ${out.after}`,
      );
      // Reaching an enemy at all counts for EXP — these abilities are
      // targeted, intentional moves, even when the magnitude is small.
      return target.team === 'enemy' && out.before !== out.after;
    }
    hud.log(`${ab.name}: ${target.name} resists`);
    hud.showFloatingMiss(target);
    return false;
  }
  return false;
}

function resolveScheduledSpell(spell: PendingSpell) {
  const ab = ABILITIES[spell.abilityId];
  if (!ab) return;
  // Lancer lands BEFORE the resolution check — even a "fizzles, caster fell"
  // log shouldn't leave them invisible. (For Jump, isAlive is true here:
  // the lancer is airborne but not dead. The flag lifts and they land.)
  if (ab.castAirborne) {
    spell.caster.airborne = false;
    hud.log(`  ↳ ${spell.caster.name} lands`);
  }
  if (!spell.caster.isAlive) {
    hud.log(`${ab.name} fizzles — caster fell.`);
    return;
  }
  // Charged AoE: just route through the same pipeline. For non-AoE charged
  // spells, applyInstantAbility's empty-targets fallback covers the
  // "target moved away, hits empty ground" case.
  applyInstantAbility(spell.caster, ab, spell.target.x, spell.target.z);
}

// ─── Hover-preview helpers ─────────────────────────────────────────────────
//
// During target-pick, the orchestrator's `onHover` callback runs each time the
// cursor moves on/off a valid tile. We pipe the predicted outcome back into
// the status bar so the player can see "23 dmg → KO" / "+30 HP / +0 HP (full)"
// before committing. All predictions use randomMul=1.0 (the deterministic
// midpoint of the 0.85–1.15 range) so the displayed number is the *expected*
// damage, not a worst- or best-case figure.

const HP_FULL = 'HP full';

function previewWith(base: string, preview: string | null): string {
  return preview ? `${base} — ${preview}` : base;
}

function hoverPreview(actor: Unit, x: number | null, z: number | null): string | null {
  if (x === null || z === null) return null;
  const target = unitAt(units, x, z);
  if (!target) return null;
  const pred = predictAttackDamage(actor, target, map);
  return formatDamageLine(target, pred.damage, pred.facing, pred.hitChance, pred.critChance);
}

function potionPreview(_actor: Unit, x: number | null, z: number | null): string | null {
  if (x === null || z === null) return null;
  const target = unitAt(units, x, z);
  if (!target) return null;
  if (target.hp >= target.hpMax) return `${target.name}: ${HP_FULL}`;
  const heal = Math.min(target.hpMax - target.hp, 30);
  return `${target.name}: +${heal} HP`;
}

function abilityPreview(actor: Unit, ab: Ability, x: number | null, z: number | null): string | null {
  if (x === null || z === null) return null;

  // AoE preview: aggregate per affected unit. Single-target stays exact.
  if (ab.area) {
    const targets = affectedUnits(actor, ab, x, z, map, units);
    if (targets.length === 0) {
      const tiles = aoeTiles(x, z, ab.area.radius, map).length;
      return `${tiles} tile${tiles === 1 ? '' : 's'} (no targets)`;
    }
    return aoePreviewLine(actor, ab, targets);
  }

  // Revive needs to find KO'd allies; everything else lives-only.
  const target = ab.effect.kind === 'revive'
    ? unitAtAny(units, x, z)
    : unitAt(units, x, z);
  if (!target) return null;
  return singleTargetPreview(actor, ab, target);
}

function singleTargetPreview(actor: Unit, ab: Ability, target: Unit): string | null {
  const eff = ab.effect;
  switch (eff.kind) {
    case 'magic-damage': {
      const pred = predictSpellDamage(actor, target, eff.spellPower);
      return formatDamageLine(target, pred.damage, null, pred.hitChance);
    }
    case 'physical-ranged-damage': {
      const pred = predictRangedAttack(actor, target, eff.weaponPower, map);
      return formatDamageLine(target, pred.damage, pred.facing, pred.hitChance, pred.critChance);
    }
    case 'magic-heal': {
      if (target.hp >= target.hpMax) return `${target.name}: ${HP_FULL}`;
      const pred = predictHeal(actor, target, eff.spellPower);
      const filled = Math.min(pred.amount, target.hpMax - target.hp);
      return `${target.name}: +${filled} HP`;
    }
    case 'revive': {
      const restored = Math.max(1, Math.floor(target.hpMax * eff.hpPercent / 100));
      return `${target.name}: REVIVE → ${restored} HP`;
    }
    case 'debuff': {
      const facing = relativeFacing(actor, target);
      const hit = physicalHitChance(target, facing);
      return `${target.name}: ${eff.stat.toUpperCase()} -${eff.amount} @ ${hit}%`;
    }
    case 'inflict-status': {
      if (target.hasStatus(eff.statusId)) {
        return `${target.name}: already ${STATUS_DEFS[eff.statusId].name}`;
      }
      const hit = magicStatusHitChance(actor, target, eff.baseAccuracy);
      return `${target.name}: → ${STATUS_DEFS[eff.statusId].name} @ ${hit}%`;
    }
    case 'stat-shift': {
      const hit = magicStatusHitChance(actor, target, eff.baseAccuracy);
      const projected = Math.max(1, Math.min(100, target[eff.stat] + eff.amount));
      const arrow = eff.amount > 0 ? '↑' : '↓';
      return `${target.name}: ${eff.stat.toUpperCase()} ${target[eff.stat]} ${arrow} ${projected} @ ${hit}%`;
    }
    default:
      return null;
  }
}

/**
 * Compose a one-line preview for an AoE: which units are caught and an
 * aggregate damage / heal estimate. Per-unit hit chances are summarised by
 * "all expected to hit" when ≥ 95%, otherwise a "(some may miss)" warning.
 */
function aoePreviewLine(actor: Unit, ab: Ability, targets: Unit[]): string {
  const eff = ab.effect;
  const names = targets.map(t => t.name).join(', ');
  if (eff.kind === 'magic-damage') {
    let total = 0;
    for (const t of targets) total += predictSpellDamage(actor, t, eff.spellPower).damage;
    return `${targets.length} hit (${names}): ~${total} dmg total`;
  }
  if (eff.kind === 'magic-heal') {
    let total = 0;
    for (const t of targets) {
      const p = predictHeal(actor, t, eff.spellPower);
      total += Math.min(p.amount, t.hpMax - t.hp);
    }
    return `${targets.length} healed (${names}): ~+${total} HP total`;
  }
  if (eff.kind === 'physical-ranged-damage') {
    let total = 0; let anyMiss = false;
    for (const t of targets) {
      const p = predictRangedAttack(actor, t, eff.weaponPower, map);
      total += p.damage;
      if (p.hitChance < 95) anyMiss = true;
    }
    const tag = anyMiss ? ' (some may miss)' : '';
    return `${targets.length} hit (${names}): ~${total} dmg${tag}`;
  }
  if (eff.kind === 'inflict-status') {
    return `${targets.length} target${targets.length === 1 ? '' : 's'} (${names}): → ${STATUS_DEFS[eff.statusId].name}`;
  }
  if (eff.kind === 'debuff') {
    return `${targets.length} target${targets.length === 1 ? '' : 's'} (${names}): ${eff.stat.toUpperCase()} -${eff.amount}`;
  }
  return `${targets.length} target${targets.length === 1 ? '' : 's'}`;
}

function formatDamageLine(
  target: Unit, damage: number, facing: string | null, hitChance?: number, critChance?: number,
): string {
  const koTag = damage >= target.hp ? ' → KO' : '';
  const facingTag = facing ? ` (${facing})` : '';
  const hitTag = hitChance !== undefined && hitChance < 100 ? ` @ ${hitChance}%` : '';
  const critTag = critChance !== undefined && critChance > 0 ? ` (★${critChance}%)` : '';
  return `${target.name}: ${damage} dmg${facingTag}${hitTag}${critTag}${koTag}`;
}

// ─── EXP / JP awards ────────────────────────────────────────────────────────

const EXP_PER_ACTION = 10;
const JP_PER_ACTION  = 10;

/**
 * Centralised award rule for player actions: always pay JP to the actor's
 * current job; pay EXP only when the action affected an enemy. No-op for
 * enemy units (they don't progress).
 *
 * Mid-battle level-ups bump `hpMax`/`mpMax` and slide current `hp`/`mp` up
 * by the delta — no full heal. Other display stats (pa/ma/speed) only refresh
 * between battles via `refreshStatsFromProgression()`, so a Speed Break
 * applied earlier this battle stays in effect through a level-up.
 */
function awardForAction(actor: Unit, affectedEnemy: boolean): void {
  if (actor.team !== 'player' || !actor.progression) return;
  const lines: string[] = [];

  const jpRes = awardJp(actor.progression, actor.jobId, JP_PER_ACTION);
  lines.push(`+${JP_PER_ACTION} JP`);

  if (affectedEnemy) {
    const expRes = awardExp(actor.progression, actor.jobId, EXP_PER_ACTION);
    lines.push(`+${EXP_PER_ACTION} EXP`);
    if (expRes.leveledUp) {
      lines.push(`Level Up! Lv ${expRes.to}`);
      const stats = computeDisplayStats(actor.progression, actor.jobId);
      const hpDelta = stats.hp - actor.hpMax;
      const mpDelta = stats.mp - actor.mpMax;
      actor.hpMax = stats.hp;
      actor.mpMax = stats.mp;
      actor.hp = Math.min(actor.hpMax, actor.hp + Math.max(0, hpDelta));
      actor.mp = Math.min(actor.mpMax, actor.mp + Math.max(0, mpDelta));
      actor.level = actor.progression.totalLevel;
    }
  }

  if (jpRes.jobLevelGained) {
    lines.push(`Job Lv ${jobLevelFor(jpRes.jpTo)}!`);
  }
  for (const id of jpRes.newlyUnlocked) {
    lines.push(`${JOB_DEFS[id]?.name ?? id} unlocked!`);
  }

  hud.showFloatingAward(actor, lines);
}

/**
 * Awards for a melee attack. Original attacker earns from hitting an enemy;
 * a counter, if it fires, earns separately for the counter-er.
 */
function awardForAttack(out: AttackOutcome): void {
  awardForAction(out.attacker, out.target.team === 'enemy' && out.damage > 0);
  if (out.counter) {
    const c = out.counter;
    awardForAction(c.counterer, c.victim.team === 'enemy' && c.damage > 0);
  }
}

function logAttack(out: AttackOutcome) {
  if (!out.hit) {
    hud.log(`${out.attacker.name} misses ${out.target.name}!`);
    hud.showFloatingMiss(out.target);
    return;
  }
  const critTag = out.crit ? ' ★CRIT' : '';
  hud.log(
    `${out.attacker.name} → ${out.target.name}: ${out.damage} dmg${critTag} ` +
    `(${out.facing}, h${out.heightDiff >= 0 ? '+' : ''}${out.heightDiff})` +
    (out.target.hp <= 0 ? ` — ${out.target.name} KO'd` : ''),
  );
  if (out.crit) hud.showFloatingCrit(out.target);
  if (out.counter) {
    const c = out.counter;
    const cCrit = c.crit ? ' ★CRIT' : '';
    hud.log(
      `  ↳ ${c.counterer.name} counters ${c.victim.name} for ${c.damage}${cCrit} ` +
      `(${c.facing})` +
      (c.victim.hp <= 0 ? ` — ${c.victim.name} KO'd by counter` : ''),
    );
    if (c.crit) hud.showFloatingCrit(c.victim);
  }
  if (out.autoPotion && out.autoPotion.amount > 0) {
    hud.log(`  ↳ ${out.autoPotion.user.name} Auto-Potion +${out.autoPotion.amount}`);
  }
}

/** Called after the unit's turn cost is applied. Triggers passive support effects. */
function applySupportTurnEnd(actor: Unit) {
  if (!actor.support) return;
  const ab = ABILITIES[actor.support];
  if (!ab) return;
  if (ab.effect.kind === 'support-mp-recovery') {
    const before = actor.mp;
    actor.mp = Math.min(actor.mpMax, actor.mp + ab.effect.amount);
    if (actor.mp > before) hud.log(`${actor.name}: MP Recovery +${actor.mp - before}`);
  }
}

/** Called after a move animation completes. Triggers passive movement effects. */
function applyMovementEndHook(unit: Unit) {
  if (!unit.movement) return;
  const ab = ABILITIES[unit.movement];
  if (!ab) return;
  if (ab.effect.kind === 'movement-hp-up') {
    const before = unit.hp;
    unit.hp = Math.min(unit.hpMax, unit.hp + ab.effect.amount);
    if (unit.hp > before) hud.log(`${unit.name}: Move HP Up +${unit.hp - before}`);
  }
}

/**
 * Plays the attacker's swing, then on impact triggers hurt/KO on the target.
 * If a counter occurred, schedules the counter-swing after the original swing.
 * Game state is already mutated by `resolveAttack` — this is purely cosmetic.
 */
function playAttackVisual(out: AttackOutcome) {
  unitRenderer.playAttack(out.attacker, () => {
    if (!out.hit) return; // miss: attacker swings, target unaffected
    if (out.target.hp <= 0) unitRenderer.playKO(out.target);
    else unitRenderer.playHurt(out.target);
  });
  if (out.counter) {
    const c = out.counter;
    setTimeout(() => {
      unitRenderer.playAttack(c.counterer, () => {
        if (c.victim.hp <= 0) unitRenderer.playKO(c.victim);
        else unitRenderer.playHurt(c.victim);
      });
    }, 420);
  }
}

function playSpellHitVisual(target: Unit) {
  if (target.hp <= 0) unitRenderer.playKO(target);
  else unitRenderer.playHurt(target);
}

function autoEndIfDone(): boolean {
  if (!currentActor) return false;
  if (!currentActor.isAlive || (hasMoved && hasActed)) {
    endTurn();
    return true;
  }
  return false;
}

function endTurn() {
  if (!currentActor) return;
  const actor = currentActor;
  const moved = hasMoved;
  const acted = hasActed;

  const finalize = () => {
    turns.endTurn(actor, { moved, acted });
    applySupportTurnEnd(actor);
    activateNext();
  };

  // Skip the facing prompt if the unit died on its own turn (e.g. counter KO'd
  // them mid-attack) — or is mid-Jump (off the field, no facing applies).
  if (!actor.isAlive || actor.airborne) { finalize(); return; }

  promptFacing(actor, finalize);
}

/**
 * FFT-style end-of-turn facing pick. Highlights the 4 in-bounds neighbors;
 * the player clicks one to face that way, or right-clicks to keep the
 * current facing. Hovering a valid tile rotates the sprite live so the
 * player can preview the facing before committing.
 */
function promptFacing(unit: Unit, onDone: () => void) {
  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const tiles: { x: number; z: number }[] = [];
  for (const [dx, dz] of dirs) {
    const x = unit.x + dx;
    const z = unit.z + dz;
    if (map.inBounds(x, z)) tiles.push({ x, z });
  }
  if (tiles.length === 0) { onDone(); return; }

  const originalFacing = unit.facing;

  hud.clearActionMenu();
  hud.setStatus(`${unit.name}: click an adjacent tile to set facing — right-click to keep current`);
  input.beginPick({
    tiles,
    color: COLOR_FACING,
    onPick: (x, z) => {
      unit.facing = facingTowards(unit.x, unit.z, x, z);
      onDone();
    },
    onCancel: () => {
      unit.facing = originalFacing;
      onDone();
    },
    onHover: (x, z) => {
      if (x === null || z === null) {
        unit.facing = originalFacing;
      } else {
        unit.facing = facingTowards(unit.x, unit.z, x, z);
      }
    },
  });
}

function enemyAutoTurn(actor: Unit) {
  const decision = ai.decide(actor, map, units);

  const finishTurn = () => {
    if (decision.action?.kind === 'attack') {
      const target = units.find(u => u.id === decision.action!.targetId);
      if (target && target.isAlive) {
        actor.facing = facingTowards(actor.x, actor.z, target.x, target.z);
        const out = resolveAttack(actor, target, map);
        logAttack(out);
        playAttackVisual(out);
        // Player counter on enemy still earns; awardForAttack short-circuits
        // for the enemy attacker.
        awardForAttack(out);
      }
    } else if (decision.action?.kind === 'ability') {
      const target = units.find(u => u.id === decision.action!.targetId);
      const ab = ABILITIES[decision.action.abilityId];
      if (target && ab && actor.mp >= ab.mpCost) {
        actor.facing = facingTowards(actor.x, actor.z, target.x, target.z);
        actor.mp = Math.max(0, actor.mp - ab.mpCost);
        if (ab.chargeTime > 0) {
          turns.schedule({
            caster: actor,
            abilityId: ab.id,
            target: { x: target.x, z: target.z },
            resolveTick: turns.tick + ab.chargeTime,
          });
          hud.log(`${actor.name} begins casting ${ab.name} on ${target.name} (resolves in ${ab.chargeTime} ticks)`);
        } else {
          applyInstantAbility(actor, ab, target.x, target.z);
        }
      }
    }
    turns.endTurn(actor, {
      moved: decision.movePath.length >= 2,
      acted: !!decision.action,
    });
    applySupportTurnEnd(actor);
    refreshHud();
    activateNext();
  };

  if (decision.movePath.length >= 2) {
    input.setAnimating(true);
    unitRenderer.startMove(actor, decision.movePath, () => {
      input.setAnimating(false);
      applyMovementEndHook(actor);
      setTimeout(finishTurn, 180);
    });
  } else {
    finishTurn();
  }
}

function refreshHud() {
  hud.setTurnOrder(turns.predictUpcoming(8), currentActor?.id ?? null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Camera + main loop
// ─────────────────────────────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === 'q' || e.key === 'Q') cam.rotateLeft();
  else if (e.key === 'e' || e.key === 'E') cam.rotateRight();
});

window.addEventListener('resize', () => {
  cam.resize();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let last = performance.now();
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  cam.update(dt);
  unitRenderer.update(dt, cam.quadrant);
  unitOverlays.update(cam.camera);
  projectiles.update(dt);
  if (currentActor && currentActor.isAlive && !battleOver) {
    cursor.setActiveTile(currentActor.x, currentActor.z);
  }
  cursor.update(now / 1000);
  renderer.render(scene, cam.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Load sprite sheets and tile textures, then start the battle. The render loop
// is already running with placeholder materials so the user sees something
// during the (typically brief) load.
hud.setStatus('Loading assets...');
(async () => {
  const loader = new AssetLoader();
  await Promise.all([
    mapRenderer.applyTextures(loader),
    unitRenderer.applyTextures(loader),
  ]);
  activateNext();
})();
