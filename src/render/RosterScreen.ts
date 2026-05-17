/**
 * Between-battles overlay. Lets the player spend earned JP, switch the
 * unit's current job, and equip a learned reaction/support/movement.
 *
 * Mutates the supplied `Unit[]` in-place: `jobId`, `reaction`, `support`,
 * `movement`, and `progression.jobs[*].learnedAbilities`. "Start Next Battle"
 * persists those mutations via `saveRoster()` and reloads — the next battle
 * will call `refreshStatsFromProgression()` per unit to re-derive display
 * stats from the new job's `mult`.
 */

import { Unit } from '../battle/Unit';
import { JOB_DEFS } from '../data/jobs';
import { WEAPONS, GearBonuses } from '../data/weapons';
import { ARMOR, ArmorDef } from '../data/armor';
import { ABILITIES, Ability, AbilityKind } from '../data/abilities';
import {
  jobLevelFor, jpToNextJobLevel, learn, canLearn, allLearnedPassives,
  eligibleEquipment, ensureJobProgress, MAX_OVERALL_LEVEL, EXP_PER_LEVEL,
} from '../battle/Progression';
import { computeDisplayStats } from '../battle/Stats';
import { loadSave, saveRoster, wipeSave, gilFromBattle } from '../core/Save';
import { showShopScreen } from './ShopScreen';
import { goToScreen } from '../core/Screen';

export function showRosterScreen(units: Unit[], won: boolean): void {
  const root = document.getElementById('hud');
  if (!root) return;

  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'absolute', inset: '0',
    background: 'rgba(0, 0, 0, 0.82)',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    color: '#fff',
    overflow: 'auto',
    padding: '24px',
    gap: '16px',
    boxSizing: 'border-box',
  });

  const heading = document.createElement('div');
  heading.textContent = 'BETWEEN BATTLES — Roster';
  Object.assign(heading.style, {
    fontSize: '20px', fontWeight: '900', letterSpacing: '2px',
    color: '#ffe14a', textAlign: 'center',
  });
  overlay.appendChild(heading);

  const gilLine = document.createElement('div');
  gilLine.textContent = `Gil: ${loadSave()?.gil ?? 0}`
    + (won ? `  (+${gilFromBattle(units)} this battle)` : '');
  Object.assign(gilLine.style, { textAlign: 'center', color: '#ffe14a', fontSize: '13px' });
  overlay.appendChild(gilLine);

  const grid = document.createElement('div');
  Object.assign(grid.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    gap: '12px',
  });
  overlay.appendChild(grid);

  const players = units.filter(u => u.team === 'player' && u.progression);
  for (const u of players) {
    const panel = document.createElement('div');
    panel.style.cssText = `
      background: rgba(20, 25, 40, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 6px;
      padding: 10px;
      display: flex; flex-direction: column; gap: 8px;
      font-size: 12px;
    `;
    renderUnitPanel(panel, u);
    grid.appendChild(panel);
  }

  const footer = document.createElement('div');
  Object.assign(footer.style, {
    display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '8px',
  });
  footer.appendChild(footerButton('Start Next Battle', '#243c66', '#5b8def', () => {
    // Gil and loot were committed at victory by recordBattleRewards; this
    // just persists the roster edits and advances the battle counter.
    saveRoster(units);
    location.reload();
  }));
  footer.appendChild(footerButton('Shop', '#1f4a2e', '#4fe07a', () => {
    // The shop overlays the roster screen; on close, rebuild the roster
    // screen so freshly-bought gear shows in the equip dropdowns.
    showShopScreen(() => { overlay.remove(); showRosterScreen(units, won); });
  }));
  footer.appendChild(footerButton('Wipe Save', '#5a1f1f', '#d96363', () => {
    if (!confirm('Wipe save and start fresh?')) return;
    wipeSave();
    location.reload();
  }));
  footer.appendChild(footerButton('Main Menu', '#2a2a36', '#9a9aa0', () => goToScreen('menu')));
  overlay.appendChild(footer);

  root.appendChild(overlay);
}

// ─── Panel render ───────────────────────────────────────────────────────────

function renderUnitPanel(panel: HTMLDivElement, u: Unit): void {
  panel.innerHTML = '';
  const p = u.progression!;
  const job = JOB_DEFS[u.jobId];
  const stats = computeDisplayStats(p, u.jobId);

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
  const title = document.createElement('div');
  title.style.cssText = 'display: flex; gap: 8px; align-items: baseline;';
  title.innerHTML = `<span style="font-weight:700;font-size:14px;color:#ffe14a;">${u.name}</span>` +
    `<span style="opacity:0.85;">${job.name}</span>` +
    `<span style="margin-left:auto;opacity:0.85;">Lv ${p.totalLevel}</span>`;
  header.appendChild(title);

  const expRow = document.createElement('div');
  expRow.appendChild(progressBar(
    p.totalLevel >= MAX_OVERALL_LEVEL ? 'EXP MAX' : `EXP ${p.exp}/${EXP_PER_LEVEL}`,
    p.totalLevel >= MAX_OVERALL_LEVEL ? 1 : p.exp / EXP_PER_LEVEL,
    '#5b8def',
  ));
  header.appendChild(expRow);

  const jpInfo = jpToNextJobLevel(p.jobs[u.jobId]?.jp ?? 0);
  const jl = jobLevelFor(p.jobs[u.jobId]?.jp ?? 0);
  const jpRow = document.createElement('div');
  if (jpInfo) {
    const span = jpInfo.next - jpInfo.current;
    const filled = span - jpInfo.remaining;
    jpRow.appendChild(progressBar(
      `JL ${jl} — JP ${p.jobs[u.jobId]?.jp ?? 0} (${jpInfo.remaining} to JL ${jl + 1})`,
      filled / span, '#ffe14a',
    ));
  } else {
    jpRow.appendChild(progressBar(`JL ${jl} (max) — JP ${p.jobs[u.jobId]?.jp ?? 0}`, 1, '#ffe14a'));
  }
  header.appendChild(jpRow);

  const statRow = document.createElement('div');
  statRow.style.cssText = 'opacity: 0.85; font-size: 11px;';
  statRow.textContent =
    `HP ${stats.hp}  MP ${stats.mp}  PA ${stats.pa}  MA ${stats.ma}  ` +
    `SP ${stats.speed}  Mv ${stats.move}  Jp ${stats.jump}  ` +
    `Fa ${stats.faith}  Br ${stats.bravery}`;
  header.appendChild(statRow);

  panel.appendChild(header);

  // Learn-abilities list (current job's learnables)
  const learnSection = document.createElement('div');
  learnSection.appendChild(sectionLabel('Learn (current job)'));
  const learnables = collectLearnables(u.jobId);
  if (learnables.length === 0) {
    learnSection.appendChild(plainLine('— no learnables defined yet —'));
  }
  for (const ab of learnables) {
    learnSection.appendChild(learnRow(u, ab, () => {
      renderUnitPanel(panel, u);
    }));
  }
  panel.appendChild(learnSection);

  // Change Job
  const jobSection = document.createElement('div');
  jobSection.appendChild(sectionLabel('Change Job'));
  const unlocked = Object.entries(p.jobs)
    .filter(([, prog]) => prog.unlocked)
    .map(([id]) => id)
    .sort();
  const jobSelect = document.createElement('select');
  jobSelect.style.cssText = selectCss();
  for (const id of unlocked) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = JOB_DEFS[id]?.name ?? id;
    if (id === u.jobId) opt.selected = true;
    jobSelect.appendChild(opt);
  }
  jobSelect.addEventListener('change', () => {
    u.jobId = jobSelect.value;
    // Make sure the job has a progress entry — it does (it's already unlocked),
    // but ensure() is idempotent and keeps the type contract simple.
    ensureJobProgress(p, u.jobId);
    // Auto-clear secondary when it would duplicate the primary — FFT canon,
    // and the action menu would dedupe-skip the second group anyway.
    if (u.secondaryJobId === u.jobId) u.secondaryJobId = null;
    // Validate equipped passives are still legal under the new mix of unlocked
    // jobs — they should remain since we don't lock anything. Strip any equip
    // that references an ability we no longer have.
    pruneEquipsAgainstLearned(u);
    renderUnitPanel(panel, u);
  });
  jobSection.appendChild(jobSelect);
  panel.appendChild(jobSection);

  // Secondary Command — a second job's learned actives appear in battle.
  // Only unlocked jobs that are NOT the current primary are eligible.
  const secondarySection = document.createElement('div');
  secondarySection.appendChild(sectionLabel('Secondary Command'));
  const secondaryOptions = unlocked.filter(id => id !== u.jobId);
  const secondarySelect = document.createElement('select');
  secondarySelect.style.cssText = selectCss();
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = '— none —';
  if (!u.secondaryJobId) noneOpt.selected = true;
  secondarySelect.appendChild(noneOpt);
  for (const id of secondaryOptions) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = JOB_DEFS[id]?.name ?? id;
    if (id === u.secondaryJobId) opt.selected = true;
    secondarySelect.appendChild(opt);
  }
  secondarySelect.addEventListener('change', () => {
    u.secondaryJobId = secondarySelect.value === '' ? null : secondarySelect.value;
    renderUnitPanel(panel, u);
  });
  secondarySection.appendChild(secondarySelect);
  panel.appendChild(secondarySection);

  // Equip slots — pulled from learned passives across all unlocked jobs.
  const learned = allLearnedPassives(p);
  panel.appendChild(equipSelect('Reaction', learned.reactions, u.reaction, (id) => { u.reaction = id; }));
  panel.appendChild(equipSelect('Support',  learned.supports,  u.support,  (id) => { u.support  = id; }));
  panel.appendChild(equipSelect('Movement', learned.movements, u.movement, (id) => { u.movement = id; }));

  // Gear slots — weapon/armor a unit may equip is the signature gear of
  // every unlocked job plus whatever has been looted. "Auto" tracks the
  // current job's signature.
  const found = loadSave()?.foundGear ?? { weapons: [], armors: [] };
  const { weapons, armors } = eligibleEquipment(p, found);
  panel.appendChild(gearSelect(
    'Weapon',
    `Auto (${WEAPONS[job.weapon]?.name ?? '—'})`,
    weapons.map(id => ({ id, text: `${WEAPONS[id]?.name ?? id} (WP ${WEAPONS[id]?.weaponPower ?? '?'}${elementLabel(WEAPONS[id]?.element)}${bonusLabel(WEAPONS[id]?.bonuses)})` })),
    u.weaponId, (id) => { u.weaponId = id; },
  ));
  panel.appendChild(gearSelect(
    'Armor',
    `Auto (${ARMOR[job.armor]?.name ?? '—'})`,
    armors.map(id => ({ id, text: `${ARMOR[id]?.name ?? id} (${armorLabel(ARMOR[id])}${bonusLabel(ARMOR[id]?.bonuses)}${resistLabel(ARMOR[id]?.resists)})` })),
    u.armorId, (id) => { u.armorId = id; },
  ));
}

/** ", +1 PA" — a gear piece's stat bonus, or "" when it carries none. */
function bonusLabel(b: GearBonuses | undefined): string {
  if (!b) return '';
  const parts: string[] = [];
  if (b.hp) parts.push(`+${b.hp} HP`);
  if (b.mp) parts.push(`+${b.mp} MP`);
  if (b.pa) parts.push(`+${b.pa} PA`);
  if (b.ma) parts.push(`+${b.ma} MA`);
  if (b.speed) parts.push(`+${b.speed} SP`);
  return parts.length ? `, ${parts.join(' ')}` : '';
}

/** ", resist Fire" — an armor's elemental resistance, or "" when it has none. */
function resistLabel(el: string | undefined): string {
  return el ? `, resist ${el[0].toUpperCase()}${el.slice(1)}` : '';
}

/** ", Fire" — a weapon's damage element, or "" when it has none. */
function elementLabel(el: string | undefined): string {
  return el ? `, ${el[0].toUpperCase()}${el.slice(1)}` : '';
}

/** "Phys -22% / Magic -18%" — armor's damage-reduction in plain terms. */
function armorLabel(a: ArmorDef | undefined): string {
  if (!a) return '';
  const pct = (factor: number) => `${Math.round((1 - factor) * 100)}%`;
  return `Phys -${pct(a.physicalFactor)} / Magic -${pct(a.magicalFactor)}`;
}

/** A dropdown for a gear slot — like equipSelect, but the empty value is
 *  an "Auto (job default)" entry rather than "— none —", and each option
 *  carries pre-formatted label text. */
function gearSelect(
  label: string,
  autoLabel: string,
  options: { id: string; text: string }[],
  current: string | null,
  onChange: (id: string | null) => void,
): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';
  wrap.appendChild(sectionLabel(label));
  const sel = document.createElement('select');
  sel.style.cssText = selectCss();
  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = autoLabel;
  if (!current) auto.selected = true;
  sel.appendChild(auto);
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.id;
    o.textContent = opt.text;
    if (opt.id === current) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => onChange(sel.value === '' ? null : sel.value));
  wrap.appendChild(sel);
  return wrap;
}

function learnRow(u: Unit, ab: Ability, onLearned: () => void): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText = 'display: flex; gap: 6px; align-items: center; padding: 2px 0;';
  const learned = u.progression!.jobs[u.jobId]?.learnedAbilities.includes(ab.id) ?? false;
  const usable  = !learned && canLearn(u.progression!, u.jobId, ab.id);
  const label = document.createElement('div');
  label.style.cssText = 'flex: 1;';
  label.textContent = `${ab.name}  (${ab.jpCost} JP, ${kindLabel(ab.type)})`;
  if (learned) label.style.color = '#9be6a8';
  row.appendChild(label);
  const btn = document.createElement('button');
  btn.textContent = learned ? '✓' : 'Learn';
  btn.disabled = !usable;
  btn.style.cssText = `
    padding: 3px 8px; font-family: inherit; font-size: 11px;
    color: ${usable ? '#fff' : '#888'};
    background: ${usable ? '#243c66' : '#1a1a26'};
    border: 1px solid ${usable ? '#5b8def' : '#333'};
    border-radius: 3px;
    cursor: ${usable ? 'pointer' : 'not-allowed'};
  `;
  if (usable) btn.addEventListener('click', () => {
    if (learn(u.progression!, u.jobId, ab.id)) onLearned();
  });
  row.appendChild(btn);
  return row;
}

function equipSelect(
  label: string,
  options: string[],
  current: string | null,
  onChange: (id: string | null) => void,
): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';
  wrap.appendChild(sectionLabel(label));
  const sel = document.createElement('select');
  sel.style.cssText = selectCss();
  const none = document.createElement('option');
  none.value = '';
  none.textContent = '— none —';
  if (!current) none.selected = true;
  sel.appendChild(none);
  for (const id of options) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = ABILITIES[id]?.name ?? id;
    if (id === current) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => onChange(sel.value === '' ? null : sel.value));
  wrap.appendChild(sel);
  return wrap;
}

function pruneEquipsAgainstLearned(u: Unit): void {
  const learned = allLearnedPassives(u.progression!);
  if (u.reaction && !learned.reactions.includes(u.reaction)) u.reaction = null;
  if (u.support  && !learned.supports.includes(u.support))   u.support  = null;
  if (u.movement && !learned.movements.includes(u.movement)) u.movement = null;
}

function collectLearnables(jobId: string): Ability[] {
  const job = JOB_DEFS[jobId];
  if (!job) return [];
  const ids = [
    ...job.learnableActives,
    ...job.learnableReactions,
    ...job.learnableSupports,
    ...job.learnableMovements,
  ];
  return ids.map(id => ABILITIES[id]).filter((x): x is Ability => !!x);
}

function kindLabel(k: AbilityKind): string {
  return k.charAt(0).toUpperCase() + k.slice(1);
}

// ─── HTML helpers ───────────────────────────────────────────────────────────

function sectionLabel(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = 'font-size: 10px; letter-spacing: 1px; opacity: 0.6; margin-top: 4px;';
  return el;
}

function plainLine(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = 'opacity: 0.6; font-size: 11px; padding: 2px 0;';
  return el;
}

function progressBar(label: string, frac: number, color: string): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';
  const txt = document.createElement('div');
  txt.textContent = label;
  txt.style.cssText = 'font-size: 11px; opacity: 0.85;';
  const track = document.createElement('div');
  track.style.cssText = `
    height: 6px; background: rgba(255,255,255,0.12);
    border-radius: 3px; overflow: hidden;
  `;
  const fill = document.createElement('div');
  fill.style.cssText = `
    height: 100%; width: ${Math.max(0, Math.min(1, frac)) * 100}%;
    background: ${color};
  `;
  track.appendChild(fill);
  wrap.appendChild(txt);
  wrap.appendChild(track);
  return wrap;
}

function selectCss(): string {
  return `
    padding: 4px 6px;
    font-family: inherit; font-size: 12px;
    color: #fff; background: #1a1f30;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 3px;
  `;
}

function footerButton(label: string, bg: string, border: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  Object.assign(btn.style, {
    padding: '10px 20px', fontSize: '14px',
    fontFamily: 'inherit', color: '#fff',
    background: bg, border: `1px solid ${border}`,
    borderRadius: '4px', cursor: 'pointer',
  });
  btn.addEventListener('click', onClick);
  return btn;
}
