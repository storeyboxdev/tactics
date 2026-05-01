import * as THREE from 'three';
import { BattleMap, MapData } from './battle/Map';
import { Unit, UnitDef, UnitStats, FACING_E, FACING_W, Team } from './battle/Unit';
import { TurnSystem, PendingSpell } from './battle/TurnSystem';
import { MovePlan } from './battle/Movement';
import { meleeAttackTargets, potionTargets, abilityTargets, unitAt } from './battle/Targeting';
import {
  AttackOutcome, resolveAttack, resolvePotion, resolveSpell, applyBreak, facingTowards,
} from './battle/ActionResolver';
import { HeuristicAi, EnemyController } from './battle/Ai';
import { ABILITIES, Ability } from './data/abilities';
import { JOB_DEFS } from './data/jobs';
import { STATUS_DEFS } from './data/statuses';
import { MapRenderer } from './render/MapRenderer';
import { UnitRenderer } from './render/UnitRenderer';
import { CameraController } from './render/CameraController';
import { Cursor } from './render/Cursor';
import { Hud, SkillEntry } from './render/Hud';
import { InputController } from './input/InputController';
import { AssetLoader } from './core/AssetLoader';
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

interface UnitSeed { id: string; name: string; team: Team; jobId: string; x: number; z: number; }

/**
 * Default reaction/support/movement loadout per job. Swappable per unit later;
 * for now this stands in for the equip-screen UI.
 */
const JOB_DEFAULT_LOADOUT: Record<string, { reaction: string | null; support: string | null; movement: string | null }> = {
  knight:     { reaction: 'counter',     support: null,          movement: 'move_plus_1' },
  squire:     { reaction: 'counter',     support: null,          movement: 'move_plus_1' },
  chemist:    { reaction: 'auto_potion', support: 'mp_recovery', movement: null },
  black_mage: { reaction: null,          support: 'mp_recovery', movement: 'move_hp_up' },
  time_mage:  { reaction: null,          support: 'mp_recovery', movement: 'move_hp_up' },
  oracle:     { reaction: 'auto_potion', support: 'mp_recovery', movement: null },
};

function buildUnit(seed: UnitSeed): Unit {
  const job = JOB_DEFS[seed.jobId];
  if (!job) throw new Error(`unknown jobId: ${seed.jobId}`);
  const loadout = JOB_DEFAULT_LOADOUT[seed.jobId] ?? { reaction: null, support: null, movement: null };
  const def: UnitDef = {
    id: seed.id, name: seed.name, team: seed.team,
    jobId: seed.jobId, level: 1, stats: { ...job.baseStats } as UnitStats,
    reaction: loadout.reaction, support: loadout.support, movement: loadout.movement,
  };
  const facing = seed.team === 'player' ? FACING_E : FACING_W;
  return new Unit(def, seed.x, seed.z, facing);
}

const playerSpawns = map.spawns.player;
const enemySpawns  = map.spawns.enemy;
const playerJobs   = ['knight', 'squire',    'time_mage', 'black_mage', 'oracle'];
const enemyJobs    = ['knight', 'knight',    'knight',    'time_mage',  'oracle'];

const units: Unit[] = [];
playerSpawns.forEach(([x, z], i) => units.push(buildUnit({
  id: `p${i + 1}`, name: `P${i + 1}`, team: 'player', jobId: playerJobs[i], x, z,
})));
enemySpawns.forEach(([x, z], i) => units.push(buildUnit({
  id: `e${i + 1}`, name: `E${i + 1}`, team: 'enemy', jobId: enemyJobs[i], x, z,
})));

const unitRenderer = new UnitRenderer(units, map);
scene.add(unitRenderer.group);

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
    hud.showResult(winner);
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
    skills:  jobAbilitiesFor(currentActor),
    onMove:   () => beginMove(),
    onAttack: () => beginAttack(),
    onItem:   () => beginItem(),
    onWait:   () => endTurn(),
  });
}

function jobAbilitiesFor(actor: Unit): SkillEntry[] {
  const ids = JOB_DEFS[actor.jobId]?.learnableActives ?? [];
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
  input.beginPick({
    tiles, color: COLOR_ATTACK,
    onPick: (x, z) => {
      const target = unitAt(units, x, z);
      if (!target) return;
      unit.facing = facingTowards(unit.x, unit.z, target.x, target.z);
      const out = resolveAttack(unit, target, map);
      logAttack(out);
      playAttackVisual(out);
      hasActed = true;
      refreshHud();
      if (!autoEndIfDone()) showActionMenu();
    },
  });
}

function beginItem() {
  if (!currentActor || hasActed) return;
  const unit = currentActor;
  const tiles = potionTargets(unit, map, units);
  input.beginPick({
    tiles, color: COLOR_HEAL,
    onPick: (x, z) => {
      const target = unitAt(units, x, z);
      if (!target) return;
      const out = resolvePotion(unit, target);
      hud.log(`${unit.name} uses Potion on ${target.name}: +${out.amount} HP`);
      hasActed = true;
      refreshHud();
      if (!autoEndIfDone()) showActionMenu();
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

  const color = ab.type === 'magical' ? COLOR_MAGIC : COLOR_ATTACK;
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
      } else {
        applyInstantAbility(unit, ab, target);
      }

      hasActed = true;
      refreshHud();
      if (!autoEndIfDone()) showActionMenu();
    },
  });
}

function applyInstantAbility(actor: Unit, ab: Ability, target: Unit) {
  const eff = ab.effect;
  if (eff.kind === 'debuff') {
    const out = applyBreak(actor, target, eff.stat, eff.amount);
    const statLabel = out.stat.toUpperCase();
    hud.log(`${actor.name} ${ab.name} on ${target.name}: ${statLabel} -${out.amount}`);
  } else if (eff.kind === 'magic-damage') {
    const out = resolveSpell(actor, target, eff.spellPower);
    hud.log(`${ab.name}: ${actor.name} → ${target.name} for ${out.damage} dmg`);
    playSpellHitVisual(target);
  } else if (eff.kind === 'inflict-status') {
    target.addStatus(eff.statusId);
    const def = STATUS_DEFS[eff.statusId];
    hud.log(`${ab.name}: ${target.name} is now ${def.name}`);
  }
}

function resolveScheduledSpell(spell: PendingSpell) {
  const ab = ABILITIES[spell.abilityId];
  if (!ab) return;
  if (!spell.caster.isAlive) {
    hud.log(`${ab.name} fizzles — caster fell.`);
    return;
  }
  const target = unitAt(units, spell.target.x, spell.target.z);
  if (!target) {
    hud.log(`${ab.name} hits empty ground at (${spell.target.x},${spell.target.z}).`);
    return;
  }
  const eff = ab.effect;
  if (eff.kind === 'magic-damage') {
    const out = resolveSpell(spell.caster, target, eff.spellPower);
    hud.log(
      `${ab.name}: ${spell.caster.name} → ${target.name} for ${out.damage} dmg` +
      (target.hp <= 0 ? ` — ${target.name} KO'd` : ''),
    );
    playSpellHitVisual(target);
  } else if (eff.kind === 'inflict-status') {
    target.addStatus(eff.statusId);
    const def = STATUS_DEFS[eff.statusId];
    hud.log(`${ab.name}: ${target.name} is now ${def.name}`);
  }
}

function logAttack(out: AttackOutcome) {
  hud.log(
    `${out.attacker.name} → ${out.target.name}: ${out.damage} dmg ` +
    `(${out.facing}, h${out.heightDiff >= 0 ? '+' : ''}${out.heightDiff})` +
    (out.target.hp <= 0 ? ` — ${out.target.name} KO'd` : ''),
  );
  if (out.counter) {
    const c = out.counter;
    hud.log(
      `  ↳ ${c.counterer.name} counters ${c.victim.name} for ${c.damage} ` +
      `(${c.facing})` +
      (c.victim.hp <= 0 ? ` — ${c.victim.name} KO'd by counter` : ''),
    );
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
  // them mid-attack) — there's no one to choose for.
  if (!actor.isAlive) { finalize(); return; }

  promptFacing(actor, finalize);
}

/**
 * FFT-style end-of-turn facing pick. Highlights the 4 in-bounds neighbors;
 * the player clicks one to face that way, or right-clicks to keep the
 * current facing.
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

  hud.clearActionMenu();
  hud.setStatus(`${unit.name}: click an adjacent tile to set facing — right-click to keep current`);
  input.beginPick({
    tiles,
    color: COLOR_FACING,
    onPick: (x, z) => {
      unit.facing = facingTowards(unit.x, unit.z, x, z);
      onDone();
    },
    onCancel: () => onDone(),
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
          applyInstantAbility(actor, ab, target);
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
