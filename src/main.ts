import * as THREE from 'three';
import { BattleMap, MapData } from './battle/Map';
import { Unit, UnitDef, UnitStats, FACING_E, FACING_W, Team } from './battle/Unit';
import { TurnSystem, PendingSpell } from './battle/TurnSystem';
import { MovePlan } from './battle/Movement';
import { meleeAttackTargets, potionTargets, abilityTargets, unitAt } from './battle/Targeting';
import {
  resolveAttack, resolvePotion, resolveSpell, applyBreak, facingTowards,
} from './battle/ActionResolver';
import { HeuristicAi, EnemyController } from './battle/Ai';
import { ABILITIES, Ability } from './data/abilities';
import { JOB_DEFS } from './data/jobs';
import { MapRenderer } from './render/MapRenderer';
import { UnitRenderer } from './render/UnitRenderer';
import { CameraController } from './render/CameraController';
import { Cursor } from './render/Cursor';
import { Hud, SkillEntry } from './render/Hud';
import { InputController } from './input/InputController';
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

function buildUnit(seed: UnitSeed): Unit {
  const job = JOB_DEFS[seed.jobId];
  if (!job) throw new Error(`unknown jobId: ${seed.jobId}`);
  const def: UnitDef = {
    id: seed.id, name: seed.name, team: seed.team,
    jobId: seed.jobId, level: 1, stats: { ...job.baseStats } as UnitStats,
  };
  const facing = seed.team === 'player' ? FACING_E : FACING_W;
  return new Unit(def, seed.x, seed.z, facing);
}

const playerSpawns = map.spawns.player;
const enemySpawns  = map.spawns.enemy;
const playerJobs   = ['knight', 'squire', 'chemist', 'black_mage', 'squire'];
const enemyJobs    = ['knight', 'knight', 'knight',  'knight',     'knight'];

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

const input = new InputController(
  renderer.domElement,
  cam.camera,
  map,
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
    // Instant magic isn't currently used (all spells are charged) but handle for completeness.
    const out = resolveSpell(actor, target, eff.spellPower);
    hud.log(`${ab.name}: ${actor.name} → ${target.name} for ${out.damage} dmg`);
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
  if (ab.effect.kind !== 'magic-damage') return;
  const out = resolveSpell(spell.caster, target, ab.effect.spellPower);
  hud.log(
    `${ab.name}: ${spell.caster.name} → ${target.name} for ${out.damage} dmg` +
    (target.hp <= 0 ? ` — ${target.name} KO'd` : ''),
  );
}

function logAttack(out: ReturnType<typeof resolveAttack>) {
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
}

function autoEndIfDone(): boolean {
  if (hasMoved && hasActed) { endTurn(); return true; }
  return false;
}

function endTurn() {
  if (!currentActor) return;
  turns.endTurn(currentActor, { moved: hasMoved, acted: hasActed });
  activateNext();
}

function enemyAutoTurn(actor: Unit) {
  const decision = ai.decide(actor, map, units);

  const finishTurn = () => {
    if (decision.attack) {
      const target = units.find(u => u.id === decision.attack!.targetId);
      if (target && target.isAlive) {
        actor.facing = facingTowards(actor.x, actor.z, target.x, target.z);
        const out = resolveAttack(actor, target, map);
        logAttack(out);
      }
    }
    turns.endTurn(actor, {
      moved: decision.movePath.length >= 2,
      acted: !!decision.attack,
    });
    refreshHud();
    activateNext();
  };

  if (decision.movePath.length >= 2) {
    input.setAnimating(true);
    unitRenderer.startMove(actor, decision.movePath, () => {
      input.setAnimating(false);
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

activateNext();
