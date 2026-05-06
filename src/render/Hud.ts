import { Unit } from '../battle/Unit';
import { STATUS_DEFS } from '../data/statuses';

const JOB_LABEL: Record<string, string> = {
  squire: 'S', chemist: 'C', knight: 'K', black_mage: 'M',
  time_mage: 'T', oracle: 'O',
};

function hexToCss(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

export interface ActionMenuOpts {
  canMove: boolean;
  canAct: boolean;
  /**
   * Skill commands grouped by source — primary job first, then optional
   * secondary (FFT's Secondary Command). Each group renders under a small
   * heading so the player can see *why* an ability is on offer.
   */
  skillGroups: SkillGroup[];
  onMove: () => void;
  onAttack: () => void;
  onItem: () => void;
  onWait: () => void;
}

export interface SkillGroup {
  label: string;          // e.g. "Knight (primary)" or "Black Magic (secondary)"
  skills: SkillEntry[];
}

export interface SkillEntry {
  id: string;
  label: string;          // e.g. "Fire (6 MP)"
  enabled: boolean;       // false if not enough MP, etc.
  onPick: () => void;
}

export class Hud {
  private readonly turnStripEl: HTMLDivElement;
  private readonly statusEl: HTMLDivElement;
  private readonly logEl: HTMLDivElement;
  private readonly awardsEl: HTMLDivElement;
  private actionMenuEl: HTMLDivElement | null = null;

  constructor() {
    const root = document.getElementById('hud');
    if (!root) throw new Error('#hud not found');

    this.turnStripEl = makePanel({
      top: '16px', left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: '6px',
    });
    root.appendChild(this.turnStripEl);

    this.statusEl = makePanel({
      bottom: '16px', left: '16px',
    });
    root.appendChild(this.statusEl);

    this.logEl = makePanel({
      top: '16px', right: '16px',
      width: '260px', maxHeight: '180px', overflowY: 'auto',
      display: 'flex', flexDirection: 'column', gap: '2px',
    });
    root.appendChild(this.logEl);

    this.awardsEl = document.createElement('div');
    Object.assign(this.awardsEl.style, {
      position: 'absolute',
      top: '90px', left: '50%', transform: 'translateX(-50%)',
      display: 'flex', flexDirection: 'column', gap: '4px',
      alignItems: 'center', pointerEvents: 'none',
    });
    root.appendChild(this.awardsEl);

    if (!document.getElementById('hud-award-anim')) {
      const sty = document.createElement('style');
      sty.id = 'hud-award-anim';
      sty.textContent = `
        @keyframes hudAwardRise {
          0%   { opacity: 0; transform: translateY(8px); }
          15%  { opacity: 1; transform: translateY(0); }
          80%  { opacity: 1; transform: translateY(-4px); }
          100% { opacity: 0; transform: translateY(-12px); }
        }`;
      document.head.appendChild(sty);
    }
  }

  setTurnOrder(upcoming: Unit[], currentId: string | null): void {
    this.turnStripEl.innerHTML = '';
    upcoming.forEach((u, idx) => {
      const isCurrent = idx === 0 && u.id === currentId;
      const teamColor = u.team === 'player' ? '#5b8def' : '#d96363';
      const cell = document.createElement('div');
      cell.style.cssText = `
        min-width: 48px;
        padding: 4px 6px;
        background: ${teamColor};
        color: #fff;
        border: 2px solid ${isCurrent ? '#ffe14a' : 'rgba(0,0,0,0.25)'};
        border-radius: 4px;
        text-align: center;
        font-weight: ${isCurrent ? 700 : 400};
        opacity: ${isCurrent ? 1 : 0.85};
      `;
      const name = document.createElement('div');
      const jobLetter = JOB_LABEL[u.jobId] ?? '?';
      name.textContent = `${u.name}·${jobLetter}`;
      const sub = document.createElement('div');
      sub.style.cssText = 'font-size: 10px; opacity: 0.85;';
      sub.textContent = `${u.hp}hp ${u.mp}mp`;
      cell.appendChild(name);
      cell.appendChild(sub);

      if (u.statuses.length > 0) {
        const badges = document.createElement('div');
        badges.style.cssText = 'display: flex; gap: 2px; justify-content: center; margin-top: 2px;';
        for (const s of u.statuses) {
          const def = STATUS_DEFS[s.id];
          const chip = document.createElement('div');
          chip.style.cssText = `
            font-size: 9px;
            font-weight: 700;
            padding: 1px 3px;
            background: ${hexToCss(def.color)};
            color: #fff;
            border-radius: 2px;
            line-height: 1;
          `;
          chip.textContent = def.short;
          chip.title = def.name + (s.remainingTicks > 0 ? ` (${s.remainingTicks})` : '');
          badges.appendChild(chip);
        }
        cell.appendChild(badges);
      }

      this.turnStripEl.appendChild(cell);
    });
  }

  setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  log(message: string): void {
    const line = document.createElement('div');
    line.textContent = message;
    line.style.cssText = 'border-bottom: 1px solid rgba(255,255,255,0.08); padding: 2px 0;';
    this.logEl.appendChild(line);
    while (this.logEl.children.length > 12) this.logEl.removeChild(this.logEl.firstChild!);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  showActionMenu(opts: ActionMenuOpts): void {
    this.clearActionMenu();
    const root = document.getElementById('hud')!;
    const menu = makePanel({
      bottom: '16px', right: '16px',
      display: 'flex', flexDirection: 'column', gap: '4px',
      minWidth: '160px',
    });
    menu.appendChild(makeButton('Move',   opts.canMove, opts.onMove));
    menu.appendChild(makeButton('Attack', opts.canAct,  opts.onAttack));
    const nonEmptyGroups = opts.skillGroups.filter(g => g.skills.length > 0);
    if (nonEmptyGroups.length > 0) {
      const sepTop = document.createElement('div');
      sepTop.style.cssText = 'height: 1px; background: rgba(255,255,255,0.15); margin: 2px 0;';
      menu.appendChild(sepTop);
      nonEmptyGroups.forEach((group, i) => {
        const heading = document.createElement('div');
        heading.textContent = group.label;
        heading.style.cssText = 'font-size: 10px; letter-spacing: 1px; opacity: 0.55; padding: 2px 4px;';
        menu.appendChild(heading);
        for (const s of group.skills) {
          menu.appendChild(makeButton(s.label, opts.canAct && s.enabled, s.onPick));
        }
        if (i < nonEmptyGroups.length - 1) {
          const inner = document.createElement('div');
          inner.style.cssText = 'height: 1px; background: rgba(255,255,255,0.08); margin: 2px 0;';
          menu.appendChild(inner);
        }
      });
      const sepBot = document.createElement('div');
      sepBot.style.cssText = 'height: 1px; background: rgba(255,255,255,0.15); margin: 2px 0;';
      menu.appendChild(sepBot);
    }
    menu.appendChild(makeButton('Item',   opts.canAct,  opts.onItem));
    menu.appendChild(makeButton('Wait',   true,         opts.onWait));
    root.appendChild(menu);
    this.actionMenuEl = menu;
  }

  clearActionMenu(): void {
    if (this.actionMenuEl) {
      this.actionMenuEl.remove();
      this.actionMenuEl = null;
    }
  }

  /**
   * Stacks one or more floating "+10 JP / +10 EXP / Level Up!" lines anchored
   * over the action area for ~2.2s, then auto-fades. The unit is included so a
   * future iteration can anchor to the unit's projected screen position; for
   * now lines are center-stacked above the action menu.
   */
  showFloatingAward(unit: Unit, lines: string[]): void {
    if (lines.length === 0) return;
    const block = document.createElement('div');
    Object.assign(block.style, {
      padding: '4px 8px',
      background: 'rgba(10, 10, 20, 0.78)',
      border: '1px solid rgba(255, 225, 74, 0.55)',
      borderRadius: '4px',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: '12px',
      color: '#ffe14a',
      textAlign: 'center',
      animation: 'hudAwardRise 2.2s ease-out forwards',
    });
    const head = document.createElement('div');
    head.textContent = unit.name;
    head.style.cssText = 'font-weight: 700; font-size: 11px; color: #fff; opacity: 0.85;';
    block.appendChild(head);
    for (const line of lines) {
      const row = document.createElement('div');
      row.textContent = line;
      block.appendChild(row);
    }
    this.awardsEl.appendChild(block);
    setTimeout(() => block.remove(), 2300);
  }

  /** A muted-red MISS toast on a unit, sharing the floating-award rise/fade. */
  showFloatingMiss(target: Unit): void {
    const block = document.createElement('div');
    Object.assign(block.style, {
      padding: '4px 8px',
      background: 'rgba(10, 10, 20, 0.78)',
      border: '1px solid rgba(217, 99, 99, 0.55)',
      borderRadius: '4px',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: '12px',
      color: '#d96363',
      textAlign: 'center',
      animation: 'hudAwardRise 1.6s ease-out forwards',
    });
    const head = document.createElement('div');
    head.textContent = target.name;
    head.style.cssText = 'font-weight: 700; font-size: 11px; color: #fff; opacity: 0.85;';
    const line = document.createElement('div');
    line.textContent = 'MISS';
    block.appendChild(head);
    block.appendChild(line);
    this.awardsEl.appendChild(block);
    setTimeout(() => block.remove(), 1700);
  }

  showResult(winner: 'player' | 'enemy', onContinue: () => void): void {
    const root = document.getElementById('hud')!;
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'absolute',
      inset: '0',
      background: 'rgba(0, 0, 0, 0.65)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      color: '#fff',
    });

    const title = document.createElement('div');
    title.textContent = winner === 'player' ? 'VICTORY' : 'DEFEAT';
    Object.assign(title.style, {
      fontSize: '72px',
      fontWeight: '900',
      letterSpacing: '4px',
      color: winner === 'player' ? '#ffe14a' : '#d96363',
      textShadow: '0 4px 12px rgba(0,0,0,0.6)',
    });
    overlay.appendChild(title);

    const sub = document.createElement('div');
    sub.textContent = winner === 'player'
      ? 'Your party holds the field.'
      : 'Your party has fallen.';
    sub.style.fontSize = '16px';
    overlay.appendChild(sub);

    const cont = document.createElement('button');
    cont.textContent = 'Continue';
    Object.assign(cont.style, {
      padding: '10px 18px',
      fontSize: '14px',
      color: '#fff',
      background: '#243c66',
      border: '1px solid #5b8def',
      borderRadius: '4px',
      cursor: 'pointer',
      fontFamily: 'inherit',
    });
    cont.addEventListener('click', () => {
      overlay.remove();
      onContinue();
    });
    overlay.appendChild(cont);

    root.appendChild(overlay);
  }
}

function makePanel(extraStyle: Record<string, string>): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'absolute',
    padding: '8px 10px',
    background: 'rgba(10, 10, 20, 0.72)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    borderRadius: '6px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '12px',
    color: '#fff',
  });
  Object.assign(el.style, extraStyle);
  return el;
}

function makeButton(label: string, enabled: boolean, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.disabled = !enabled;
  btn.style.cssText = `
    padding: 6px 10px;
    font-family: inherit;
    font-size: 13px;
    color: ${enabled ? '#fff' : '#888'};
    background: ${enabled ? '#243c66' : '#1a1a26'};
    border: 1px solid ${enabled ? '#5b8def' : '#333'};
    border-radius: 4px;
    cursor: ${enabled ? 'pointer' : 'not-allowed'};
    text-align: left;
  `;
  if (enabled) btn.addEventListener('click', onClick);
  return btn;
}
