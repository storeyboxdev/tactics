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
  resolveRevive, resolveCureStatus, resolveDamageAndStatus, resolveFlatHeal,
  resolvePhysicalDamageAndStatus, predictPhysicalDamageAndStatus,
  resolveDeathTrigger, effectiveMpCost, applyStatShift, applyBreak, facingTowards,
  predictAttackDamage, predictSpellDamage, predictRangedAttack, predictHeal,
  physicalHitChance, magicStatusHitChance, rollHit, relativeFacing,
} from './battle/ActionResolver';
import { HeuristicAi, EnemyController } from './battle/Ai';
import {
  awardExp, awardJp, learnedActivesInJob, jobLevelFor,
} from './battle/Progression';
import { LastActionLog } from './battle/LastAction';
import { computeDisplayStats } from './battle/Stats';
import { pickObjective, evaluateObjective, objectiveLabel, pickLeaderIndex } from './battle/Objective';
import { ABILITIES, Ability } from './data/abilities';
import { JOB_DEFS } from './data/jobs';
import { WEAPONS } from './data/weapons';
import { ARMOR } from './data/armor';
import { STATUS_DEFS } from './data/statuses';
import { MapRenderer } from './render/MapRenderer';
import { UnitRenderer } from './render/UnitRenderer';
import { UnitOverlays } from './render/UnitOverlays';
import { ProjectileRenderer } from './render/ProjectileRenderer';
import { SpellFxRenderer } from './render/SpellFxRenderer';
import { CameraController } from './render/CameraController';
import { Cursor } from './render/Cursor';
import { Hud, SkillEntry, SkillGroup } from './render/Hud';
import { InputController } from './input/InputController';
import { AssetLoader } from './core/AssetLoader';
import { loadSave, recordBattleRewards, SavedUnit } from './core/Save';
import { defaultRoster, pickEnemyJobs } from './core/Bootstrap';
import { showRosterScreen } from './render/RosterScreen';
import grasslandJson from './data/maps/grassland.json';
import stoneCorridorJson from './data/maps/stone_corridor.json';
import waterPondJson from './data/maps/water_pond.json';
import highGroundJson from './data/maps/high_ground.json';
import bridgeJson from './data/maps/bridge.json';
import dunesJson from './data/maps/dunes.json';
import ruinsJson from './data/maps/ruins.json';

const ALL_MAPS = [
  grasslandJson, stoneCorridorJson, waterPondJson, highGroundJson,
  bridgeJson, dunesJson, ruinsJson,
];

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

// Pick a random map each load. Refreshing the page or hitting Continue in
// the roster screen rolls a new battlefield, breaking up the visual
// repetition while testing.
const pickedMap = ALL_MAPS[Math.floor(Math.random() * ALL_MAPS.length)];
const map = new BattleMap(pickedMap as unknown as MapData);
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
  // Monsters read better named after the creature ("Goblin" beats "E2").
  const name = job.isMonster ? job.name : seed.name;
  const def: UnitDef = {
    id: seed.id, name, team: 'enemy',
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
    weaponId: saved.weaponId,
    armorId: saved.armorId,
  };
  return new Unit(def, x, z, FACING_E);
}

const playerSpawns = map.spawns.player;
const enemySpawns  = map.spawns.enemy;
const save = loadSave();
// A length check, not just `??` — recordBattleRewards can write a save
// with an empty roster (battle 0, no prior save); fall back to the default.
const roster: SavedUnit[] = save?.roster?.length ? save.roster : defaultRoster();
// Enemy team scales with how many battles the party has survived. Battle 0
// is Squires-only (the very first fight the player ever sees); Tier-1 jobs
// come in by battle 2, casters by 4, the full pool by 6.
const enemyJobs = pickEnemyJobs(save?.battleCount ?? 0, enemySpawns.length);

const units: Unit[] = [];
playerSpawns.forEach(([x, z], i) => {
  const saved = roster[i];
  if (!saved) return; // roster smaller than spawn count — leave the slot empty
  units.push(buildPlayerUnit(saved, x, z));
});
enemySpawns.forEach(([x, z], i) => units.push(buildEnemy({
  id: `e${i + 1}`, name: `E${i + 1}`, jobId: enemyJobs[i], x, z,
})));

// Battle objective — the win condition for this fight. Battle 0 is always
// a Rout; later battles may roll Regicide / Survive / Protect.
const battleObjective = pickObjective(save?.battleCount ?? 0);
if (battleObjective.kind === 'regicide') {
  const enemies = units.filter(u => u.team === 'enemy');
  const players = units.filter(u => u.team === 'player');
  const leader = enemies[pickLeaderIndex(enemies, players)];
  if (leader) {
    leader.isLeader = true;
    // A regicide target shouldn't just be the squishiest enemy — beef it.
    leader.hpMax = Math.floor(leader.hpMax * 1.5);
    leader.hp = leader.hpMax;
  }
}
if (battleObjective.kind === 'protect') {
  const allies = units.filter(u => u.team === 'player');
  const vip = allies[Math.floor(Math.random() * allies.length)];
  if (vip) vip.isProtected = true;
}
if (battleObjective.kind === 'escort') {
  const allies = units.filter(u => u.team === 'player');
  const escortee = allies[Math.floor(Math.random() * allies.length)];
  if (escortee) escortee.isEscortee = true;
  // Goal: the first passable tile on the far edge, scanning from mid-row out.
  const mid = Math.floor(map.depth / 2);
  const farX = map.width - 1;
  for (let d = 0; d <= mid; d++) {
    for (const z of [mid - d, mid + d]) {
      if (z >= 0 && z < map.depth && map.isPassable(farX, z)) {
        battleObjective.goalX = farX;
        battleObjective.goalZ = z;
        d = mid + 1; // break the outer loop
        break;
      }
    }
  }
}

const unitRenderer = new UnitRenderer(units, map);
scene.add(unitRenderer.group);

const unitOverlays = new UnitOverlays(units, map);

const projectiles = new ProjectileRenderer(map);
scene.add(projectiles.group);

const spellFx = new SpellFxRenderer(map);
scene.add(spellFx.group);

const cursor = new Cursor(map);
scene.add(cursor.group);

const cam = new CameraController(
  new THREE.Vector3(map.width / 2, 0, map.depth / 2),
  20,
);

const turns = new TurnSystem(units);
const hud = new Hud();
const lastActions = new LastActionLog();

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
  // Objective-aware: Rout needs the whole enemy team down, Regicide just the
  // leader, Survive a tick threshold. Loss (player team wiped) is universal.
  // Petrified units count as down inside evaluateObjective's standing check.
  return evaluateObjective(battleObjective, units, turns.tick);
}

/**
 * Fire any pending death triggers — currently only Bomb's Self-Destruct.
 * A KO'd unit with a `deathTrigger` erupts: flat damage to every alive
 * unit (both teams) within Manhattan radius of its tile. Loops so a blast
 * that KOs another Bomb chain-detonates it; the `deathTriggerFired` flag
 * keeps each creature firing exactly once.
 */
function resolveDeathTriggers() {
  let fired = true;
  while (fired) {
    fired = false;
    for (const bomb of units) {
      if (bomb.isAlive || bomb.deathTriggerFired) continue;
      const trig = JOB_DEFS[bomb.jobId]?.deathTrigger;
      if (!trig) continue;
      fired = true;
      hud.log(`${bomb.name} explodes!`);
      spellFx.burst({ x: bomb.x, z: bomb.z }, 'fire', () => {});
      const out = resolveDeathTrigger(bomb, trig.radius, trig.damage, units);
      for (const v of out.victims) {
        hud.log(`  ↳ ${v.unit.name} takes ${v.dealt} from the blast`);
        spellFx.burst({ x: v.unit.x, z: v.unit.z }, 'fire', () => playSpellHitVisual(v.unit));
        if (v.reraised) logReraise(v.unit);
      }
    }
  }
}

function activateNext() {
  if (battleOver) return;
  hud.clearActionMenu();
  input.cancel();
  // Resolve any pending death triggers (Bomb's Self-Destruct) before the
  // win/loss check — a dying Bomb's blast can KO the last unit on a team.
  resolveDeathTriggers();
  const winner = checkBattleEnd();
  if (winner) {
    // Commit gil + loot now (once) so the roster screen and shop show
    // what was just earned — not a battle-stale balance.
    if (winner === 'player' && !battleOver) recordBattleRewards(units);
    battleOver = true;
    currentActor = null;
    cursor.clearActiveTile();
    refreshHud();
    hud.setStatus(winner === 'player' ? 'Victory!' : 'Defeat.');
    hud.showResult(winner, () => showRosterScreen(units, winner === 'player'));
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

  // AI-override statuses (Berserk, Confuse, Charm) take the turn from both
  // teams. Runs alternate logic instead of player menu / standard AI.
  if (actor.hasStatus('berserk') || actor.hasStatus('confuse') || actor.hasStatus('charm')) {
    const label = actor.hasStatus('berserk') ? 'Berserk'
                : actor.hasStatus('charm')   ? 'Charmed'
                : 'Confused';
    hud.setStatus(`${actor.name} is ${label}!`);
    setTimeout(() => runOverrideTurn(actor), 600);
    return;
  }

  if (actor.team === 'player') {
    const job = JOB_DEFS[actor.jobId];
    const weaponName = job?.weapon ? WEAPONS[job.weapon]?.name : undefined;
    const armorName  = job?.armor  ? ARMOR[job.armor]?.name   : undefined;
    const gear = [weaponName, armorName].filter(Boolean).join(' / ');
    const kit = gear ? `${actor.jobId} · ${gear}` : actor.jobId;
    hud.setStatus(`${actor.name}'s turn (${kit}) — choose an action`);
    showActionMenu();
    beginMove(); // default into Move targeting; player can switch via menu
  } else {
    hud.setStatus(`${actor.name} (enemy) thinking...`);
    setTimeout(() => enemyAutoTurn(actor), 600);
  }
}

function showActionMenu() {
  if (!currentActor) return;
  const restrained = currentActor.statuses.find(s => STATUS_DEFS[s.id].blocksMove);
  const muzzled    = currentActor.statuses.find(s => STATUS_DEFS[s.id].blocksAct);
  // Frog: abilities/items gone, but Attack stays.
  const frogged    = currentActor.statuses.some(s => STATUS_DEFS[s.id].blocksAbilities);
  hud.showActionMenu({
    canMove: !hasMoved && !restrained,
    canAct:  !hasActed && !muzzled,
    skillGroups: (muzzled || frogged) ? [] : actionMenuGroupsFor(currentActor),
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
  const silenced = actor.statuses.some(s => STATUS_DEFS[s.id].blocksMagic);
  const terrain = map.getTile(actor.x, actor.z).terrain;
  return ids.map(id => {
    const ab = ABILITIES[id];
    let enabled = actor.mp >= effectiveMpCost(actor, ab);
    // Mimic disables when the mime's team has no recorded action to copy.
    if (ab.effect.kind === 'mimic' && !lastActions.get(actor.team)) enabled = false;
    // Silence locks out magical-type abilities (FFT canon: Black/White/Time
    // magic, Summons, songs, dances, Math Skill — all type 'magical').
    if (silenced && ab.type === 'magical') enabled = false;
    // Geomancer-style terrain gate: only castable on listed terrain types.
    if (ab.requiresTerrain && !ab.requiresTerrain.includes(terrain)) enabled = false;
    return {
      id,
      label: skillLabel(ab, actor),
      enabled,
      onPick: () => beginSkill(id),
    };
  });
}

function jobLabel(jobId: string, role: 'primary' | 'secondary'): string {
  const name = JOB_DEFS[jobId]?.name ?? jobId;
  return `${name} (${role})`;
}

function skillLabel(ab: Ability, actor?: Unit): string {
  const tags: string[] = [];
  const mp = actor ? effectiveMpCost(actor, ab) : ab.mpCost;
  if (mp > 0)             tags.push(`${mp}MP`);
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
  if (unit.mp < effectiveMpCost(unit, ab)) { hud.log(`${unit.name}: not enough MP for ${ab.name}`); return; }

  // Mimic: replay the mime's team's most recent ability at the same target.
  // No targeting prompt — the original action's coords are reused.
  if (ab.effect.kind === 'mimic') {
    castMimic(unit);
    return;
  }

  // Math Skill: a global rule-filtered magic-damage sweep. No targeting
  // prompt — every alive unit on the field whose stat is divisible by the
  // rule's divisor takes the hit (both teams).
  if (ab.effect.kind === 'math-skill') {
    castMathSkill(unit, ab);
    return;
  }

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
      unit.mp = Math.max(0, unit.mp - effectiveMpCost(unit, ab));

      if (ab.chargeTime > 0) {
        const resolveTick = turns.tick + ab.chargeTime;
        turns.schedule({ caster: unit, abilityId: ab.id, target: { x, z }, resolveTick });
        hud.log(`${unit.name} begins casting ${ab.name} on ${target.name} (resolves in ${ab.chargeTime} ticks)`);
        lastActions.record(unit.team, ab.id, x, z);
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
        lastActions.record(unit.team, ab.id, x, z);
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

/**
 * Replay the mime's team's most recent ability at the same target tile. The
 * mime's MP / Faith / PA / MA are used (so a mimicked Fire from a high-Faith
 * mime hits harder than the original from a low-Faith Black Mage). MP cost
 * is FREE for the mime — Mimic is the cost.
 */
function castMimic(unit: Unit) {
  const last = lastActions.get(unit.team);
  if (!last) {
    hud.log(`${unit.name}: nothing to mimic yet`);
    return;
  }
  const ab = ABILITIES[last.abilityId];
  if (!ab) {
    hud.log(`${unit.name}: mimic target ability ${last.abilityId} no longer defined`);
    return;
  }
  hud.log(`${unit.name} mimics ${ab.name}!`);
  if (ab.chargeTime > 0) {
    // Mimicked charged spells charge again — same as a fresh cast — but
    // skip MP. (Mime's CT cost is the limiter.)
    const resolveTick = turns.tick + ab.chargeTime;
    turns.schedule({ caster: unit, abilityId: ab.id, target: { x: last.x, z: last.z }, resolveTick });
    if (ab.castAirborne) {
      unit.airborne = true;
      hud.log(`  ↳ ${unit.name} leaps into the air (mimicked Jump)`);
    }
  } else {
    applyInstantAbility(unit, ab, last.x, last.z);
  }
  // Mimic itself doesn't enter the last-action log (otherwise it'd self-
  // chain forever). Mark hasActed and end the turn flow normally.
  hasActed = true;
  refreshHud();
  if (!autoEndIfDone()) showActionMenu();
}

/**
 * Calculator: hit every alive unit whose stat is divisible by the rule's
 * divisor with a per-target magic-damage roll, regardless of team or range.
 * Includes the caster themselves if their stat matches — Math Skill is
 * indiscriminate, that's the catch.
 */
function castMathSkill(actor: Unit, ab: Ability) {
  if (ab.effect.kind !== 'math-skill') return;
  const eff = ab.effect;
  const matched: Unit[] = [];
  for (const u of units) {
    if (!u.isAlive) continue;
    const v = mathStatOf(u, eff.stat);
    if (v % eff.divisor === 0) matched.push(u);
  }

  if (matched.length === 0) {
    hud.log(`${ab.name}: no units match (${eff.stat} % ${eff.divisor} = 0)`);
    return;
  }

  hud.log(`${ab.name}: ${matched.length} unit${matched.length === 1 ? '' : 's'} match`);
  let affectedEnemy = false;
  for (const target of matched) {
    const out = resolveSpell(actor, target, eff.spellPower, Math.random, eff.element);
    hud.log(`  ↳ ${actor.name} → ${target.name} for ${out.damage} dmg`);
    spellFx.burst(target, eff.element ?? 'fire', () => playSpellHitVisual(target));
    if (target.team === 'enemy' && out.damage > 0) affectedEnemy = true;
  }
  awardForAction(actor, affectedEnemy);
  lastActions.record(actor.team, ab.id, actor.x, actor.z);
  hasActed = true;
  refreshHud();
  if (!autoEndIfDone()) showActionMenu();
}

function mathStatOf(u: Unit, stat: 'hp' | 'mp' | 'ct' | 'level'): number {
  switch (stat) {
    case 'hp': return u.hp;
    case 'mp': return u.mp;
    case 'ct': return u.ct;
    case 'level': return u.level;
  }
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
    const out = resolveSpell(actor, target, eff.spellPower, Math.random, eff.element);
    if (out.absorbed) {
      hud.log(`${ab.name}: ${target.name} absorbs ${out.absorbed} HP`);
      spellFx.burst(target, 'heal', () => {});
    } else {
      hud.log(`${ab.name}: ${actor.name} → ${target.name} for ${out.damage} dmg`);
      spellFx.burst(target, eff.element ?? 'fire', () => playSpellHitVisual(target));
      if (out.reraised) logReraise(target);
    }
    return target.team === 'enemy' && out.damage > 0;
  }
  if (eff.kind === 'damage-and-status') {
    const out = resolveDamageAndStatus(actor, target, eff.spellPower, eff.statusId, eff.statusBaseAcc, Math.random, eff.element);
    if (out.absorbed) {
      hud.log(`${ab.name}: ${target.name} absorbs ${out.absorbed} HP`);
      spellFx.burst(target, 'heal', () => {});
    } else {
      hud.log(`${ab.name}: ${actor.name} → ${target.name} for ${out.damage} dmg`);
      spellFx.burst(target, eff.element ?? 'fire', () => playSpellHitVisual(target));
      if (out.reraised) logReraise(target);
    }
    if (out.statusApplied) {
      hud.log(`  ↳ ${target.name} is now ${STATUS_DEFS[eff.statusId].name}`);
    }
    return target.team === 'enemy' && out.damage > 0;
  }
  if (eff.kind === 'magic-heal') {
    const out = resolveHeal(actor, target, eff.spellPower);
    if (out.undead) {
      hud.log(`${ab.name}: ${target.name} is Undead — the light burns for ${out.amount}`);
      playSpellHitVisual(target);
      return target.team === 'enemy' && out.amount > 0;
    }
    hud.log(`${ab.name}: ${actor.name} → ${target.name} for +${out.amount} HP`);
    spellFx.burst(target, 'heal', () => {});
    return false; // heals never grant EXP
  }
  if (eff.kind === 'flat-heal') {
    const out = resolveFlatHeal(actor, target, eff.hp, eff.mp);
    if (out.undead) {
      hud.log(`${ab.name}: ${target.name} is Undead — the item burns for ${-out.hpRestored}`);
      playSpellHitVisual(target);
      return target.team === 'enemy' && out.hpRestored < 0;
    }
    const parts: string[] = [];
    if (out.hpRestored > 0) parts.push(`+${out.hpRestored} HP`);
    if (out.mpRestored > 0) parts.push(`+${out.mpRestored} MP`);
    hud.log(`${ab.name}: ${actor.name} → ${target.name} ${parts.join(', ') || '(no effect)'}`);
    if (out.hpRestored > 0 || out.mpRestored > 0) {
      spellFx.burst(target, 'heal', () => {});
    }
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
    const out = resolveRangedAttack(actor, target, eff.weaponPower, map, undefined, eff.drainPercent ?? 0);
    // Damage was applied synchronously in the resolver. The projectile is
    // a visual delay — when it lands, the per-target hurt anim and any
    // crit/miss toast fire so the timing reads as "shot → impact".
    if (out.bladeGrasp) {
      hud.log(`${ab.name}: ${target.name} catches it! (Blade Grasp)`);
      projectiles.fire(actor, target, () => hud.showFloatingMiss(target));
      return false;
    }
    if (out.hit) {
      const critTag = out.crit ? ' ★CRIT' : '';
      hud.log(`${ab.name}: ${actor.name} → ${target.name} for ${out.damage} dmg${critTag} (${out.facing})`);
      if (out.drained > 0) {
        hud.log(`  ↳ ${actor.name} drains +${out.drained} HP`);
      }
      projectiles.fire(actor, target, () => {
        playSpellHitVisual(target);
        if (out.crit) hud.showFloatingCrit(target);
        if (out.reraised) logReraise(target);
      });
    } else {
      hud.log(`${ab.name}: ${actor.name} misses ${target.name}`);
      projectiles.fire(actor, target, () => hud.showFloatingMiss(target));
    }
    return target.team === 'enemy' && out.hit;
  }
  if (eff.kind === 'physical-damage-and-status') {
    const out = resolvePhysicalDamageAndStatus(
      actor, target, eff.weaponPower, eff.statusId, eff.statusBaseAcc, map,
    );
    if (out.bladeGrasp) {
      hud.log(`${ab.name}: ${target.name} catches it! (Blade Grasp)`);
      projectiles.fire(actor, target, () => hud.showFloatingMiss(target));
      return false;
    }
    if (out.hit) {
      const critTag = out.crit ? ' ★CRIT' : '';
      hud.log(`${ab.name}: ${actor.name} → ${target.name} for ${out.damage} dmg${critTag} (${out.facing})`);
      projectiles.fire(actor, target, () => {
        playSpellHitVisual(target);
        if (out.crit) hud.showFloatingCrit(target);
        if (out.reraised) logReraise(target);
      });
      if (out.statusApplied) {
        hud.log(`  ↳ ${target.name} is now ${STATUS_DEFS[eff.statusId].name}`);
      }
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
  if (eff.kind === 'cure-status') {
    const out = resolveCureStatus(actor, target, eff.statuses, eff.baseAccuracy);
    if (!out.hit) {
      hud.log(`${ab.name}: ${target.name} resists`);
      hud.showFloatingMiss(target);
      return false;
    }
    if (out.removed.length === 0) {
      hud.log(`${ab.name}: ${target.name} (no effect)`);
      return false;
    }
    const names = out.removed.map(id => STATUS_DEFS[id].name).join(', ');
    hud.log(`${ab.name}: ${target.name} cured of ${names}`);
    spellFx.burst(target, 'heal', () => {});
    return false;
  }
  if (eff.kind === 'stat-shift') {
    const chance = magicStatusHitChance(actor, target, eff.baseAccuracy);
    if (rollHit(chance, Math.random)) {
      const out = applyStatShift(actor, target, eff.stat, eff.amount, eff.persistent);
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
    case 'damage-and-status': {
      const pred = predictSpellDamage(actor, target, eff.spellPower);
      const statusHit = magicStatusHitChance(actor, target, eff.statusBaseAcc);
      const koTag = pred.damage >= target.hp ? ' → KO' : '';
      return `${target.name}: ${pred.damage} dmg → ${STATUS_DEFS[eff.statusId].short} @ ${statusHit}%${koTag}`;
    }
    case 'physical-damage-and-status': {
      const pred = predictPhysicalDamageAndStatus(actor, target, eff.weaponPower, eff.statusBaseAcc, map);
      const koTag = pred.damage >= target.hp ? ' → KO' : '';
      return `${target.name}: ${pred.damage} dmg @ ${pred.hitChance}% → ${STATUS_DEFS[eff.statusId].short} @ ${pred.statusHit}%${koTag}`;
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
    case 'flat-heal': {
      const hpNeed = target.hpMax - target.hp;
      const mpNeed = target.mpMax - target.mp;
      const hpEff = eff.hp ? Math.min(eff.hp, hpNeed) : 0;
      const mpEff = eff.mp ? Math.min(eff.mp, mpNeed) : 0;
      const parts: string[] = [];
      if (eff.hp) parts.push(`+${hpEff} HP`);
      if (eff.mp) parts.push(`+${mpEff} MP`);
      if (parts.length === 0) return `${target.name}: (no effect)`;
      return `${target.name}: ${parts.join(' / ')}`;
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
    case 'cure-status': {
      const removable = eff.statuses.filter(s => target.hasStatus(s));
      if (removable.length === 0) return `${target.name}: (no curable status)`;
      const names = removable.map(s => STATUS_DEFS[s].short).join('/');
      const hit = magicStatusHitChance(actor, target, eff.baseAccuracy);
      return `${target.name}: cure ${names} @ ${hit}%`;
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
  if (eff.kind === 'stat-shift') {
    const arrow = eff.amount > 0 ? '↑' : '↓';
    return `${targets.length} target${targets.length === 1 ? '' : 's'} (${names}): ${eff.stat.toUpperCase()} ${arrow}${Math.abs(eff.amount)}`;
  }
  if (eff.kind === 'cure-status') {
    return `${targets.length} ally${targets.length === 1 ? '' : 's'} (${names}): cure any active status`;
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

  // JP Up support multiplies JP earned. The factor lives on the support's
  // ability effect — currently 1.5 (50% bonus), but adjustable per ability.
  let jpAmount = JP_PER_ACTION;
  if (actor.support) {
    const supportAb = ABILITIES[actor.support];
    if (supportAb?.effect.kind === 'support-jp-up') {
      jpAmount = Math.floor(jpAmount * supportAb.effect.factor);
    }
  }
  const jpRes = awardJp(actor.progression, actor.jobId, jpAmount);
  lines.push(`+${jpAmount} JP`);

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
  if (out.bladeGrasp) {
    hud.log(`${out.target.name} catches ${out.attacker.name}'s attack! (Blade Grasp)`);
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
  if (out.reraised) logReraise(out.target);
  if (out.counter) {
    const c = out.counter;
    const cCrit = c.crit ? ' ★CRIT' : '';
    hud.log(
      `  ↳ ${c.counterer.name} counters ${c.victim.name} for ${c.damage}${cCrit} ` +
      `(${c.facing})` +
      (c.victim.hp <= 0 ? ` — ${c.victim.name} KO'd by counter` : ''),
    );
    if (c.crit) hud.showFloatingCrit(c.victim);
    if (c.reraised) logReraise(c.victim);
  }
  if (out.autoPotion && out.autoPotion.amount > 0) {
    hud.log(`  ↳ ${out.autoPotion.user.name} Auto-Potion +${out.autoPotion.amount}`);
  }
}

/** Phoenix flash + log line when a unit's Reraise interrupts a would-KO. */
function logReraise(target: Unit) {
  hud.log(`  ✦ Reraise! ${target.name} is restored to ${target.hp} HP`);
  spellFx.burst(target, 'heal', () => {});
  hud.showFloatingAward(target, ['RERAISE']);
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
  if (ab.effect.kind === 'movement-mp-up') {
    const before = unit.mp;
    unit.mp = Math.min(unit.mpMax, unit.mp + ab.effect.amount);
    if (unit.mp > before) hud.log(`${unit.name}: Move MP Up +${unit.mp - before}`);
  }
}

/**
 * Plays the attacker's swing, then on impact triggers hurt/KO on the target.
 * If a counter occurred, schedules the counter-swing after the original swing.
 * Game state is already mutated by `resolveAttack` — this is purely cosmetic.
 */
function playAttackVisual(out: AttackOutcome) {
  unitRenderer.playAttack(out.attacker, () => {
    // miss or Blade Grasp catch: attacker swings, target unaffected
    if (!out.hit || out.bladeGrasp) return;
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
      if (target && ab && actor.mp >= effectiveMpCost(actor, ab)) {
        actor.facing = facingTowards(actor.x, actor.z, target.x, target.z);
        actor.mp = Math.max(0, actor.mp - effectiveMpCost(actor, ab));
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
        lastActions.record(actor.team, ab.id, target.x, target.z);
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

/**
 * Berserk / Confuse turn handler. Runs for either team — the affected
 * unit's normal turn flow (player menu or standard AI) is bypassed and
 * this routine drives a forced basic-attack instead.
 *
 * Berserk targets the closest opposing-team unit (a rage-blind charge).
 * Confuse targets a random alive unit other than the actor — could
 * easily hit one of the actor's own allies.
 */
function runOverrideTurn(actor: Unit) {
  let target: Unit | null;
  if (actor.hasStatus('berserk')) {
    target = nearestOpponent(actor);
  } else if (actor.hasStatus('charm')) {
    target = nearestAlly(actor);          // charmed → attacks its former team
  } else {
    target = randomAliveOther(actor);     // confuse → random
  }

  if (!target) {
    turns.endTurn(actor, { moved: false, acted: false });
    activateNext();
    return;
  }

  const plan = new MovePlan(actor, map, units);
  const endTile = closestEndTileTo(plan, target);
  const moved = endTile.x !== actor.x || endTile.z !== actor.z;
  const adjacentToTarget =
    Math.abs(endTile.x - target.x) + Math.abs(endTile.z - target.z) === 1;

  const finish = () => {
    let acted = false;
    if (adjacentToTarget && target.isAlive && actor.isAlive) {
      actor.facing = facingTowards(actor.x, actor.z, target.x, target.z);
      const out = resolveAttack(actor, target, map);
      logAttack(out);
      playAttackVisual(out);
      awardForAttack(out);
      acted = true;
    }
    turns.endTurn(actor, { moved, acted });
    applySupportTurnEnd(actor);
    refreshHud();
    activateNext();
  };

  if (moved) {
    const path = plan.pathTo(endTile.x, endTile.z);
    input.setAnimating(true);
    unitRenderer.startMove(actor, path, () => {
      input.setAnimating(false);
      applyMovementEndHook(actor);
      setTimeout(finish, 180);
    });
  } else {
    finish();
  }
}

function nearestOpponent(actor: Unit): Unit | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const u of units) {
    if (!u.isAlive || u.team === actor.team || u === actor) continue;
    const d = Math.abs(u.x - actor.x) + Math.abs(u.z - actor.z);
    if (d < bestD) { bestD = d; best = u; }
  }
  return best;
}

function nearestAlly(actor: Unit): Unit | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const u of units) {
    if (!u.isAlive || u.team !== actor.team || u === actor) continue;
    const d = Math.abs(u.x - actor.x) + Math.abs(u.z - actor.z);
    if (d < bestD) { bestD = d; best = u; }
  }
  return best;
}

function randomAliveOther(actor: Unit): Unit | null {
  const candidates = units.filter(u => u !== actor && u.isAlive);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function closestEndTileTo(plan: MovePlan, target: Unit): { x: number; z: number } {
  let best = { x: plan.unit.x, z: plan.unit.z };
  let bestD = Math.abs(plan.unit.x - target.x) + Math.abs(plan.unit.z - target.z);
  for (const tile of plan.endTiles()) {
    const d = Math.abs(tile.x - target.x) + Math.abs(tile.z - target.z);
    if (d < bestD) { bestD = d; best = { x: tile.x, z: tile.z }; }
  }
  return best;
}

/** The unit an objective banner names — Regicide leader, Protect VIP, or Escortee. */
function objectiveUnitName(): string | null {
  return units.find(u => u.isLeader || u.isProtected || u.isEscortee)?.name ?? null;
}

function refreshHud() {
  hud.setTurnOrder(turns.predictUpcoming(8), currentActor?.id ?? null);
  // Survive's banner counts down — keep it current.
  if (battleObjective.kind === 'survive') {
    hud.setObjective(objectiveLabel(battleObjective, null, turns.tick));
  }
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
  spellFx.update(dt);
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
  hud.setObjective(objectiveLabel(battleObjective, objectiveUnitName()));
  if (battleObjective.kind === 'escort') {
    cursor.setGoalTile(battleObjective.goalX, battleObjective.goalZ);
  }
  activateNext();
})();
