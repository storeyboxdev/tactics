import { Unit } from '../battle/Unit';

const JOB_LABEL: Record<string, string> = {
  squire: 'S', chemist: 'C', knight: 'K', black_mage: 'M',
};

export interface ActionMenuOpts {
  canMove: boolean;
  canAct: boolean;
  skills: SkillEntry[];
  onMove: () => void;
  onAttack: () => void;
  onItem: () => void;
  onWait: () => void;
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
    if (opts.skills.length > 0) {
      const sep = document.createElement('div');
      sep.style.cssText = 'height: 1px; background: rgba(255,255,255,0.15); margin: 2px 0;';
      menu.appendChild(sep);
      for (const s of opts.skills) {
        menu.appendChild(makeButton(s.label, opts.canAct && s.enabled, s.onPick));
      }
      const sep2 = document.createElement('div');
      sep2.style.cssText = 'height: 1px; background: rgba(255,255,255,0.15); margin: 2px 0;';
      menu.appendChild(sep2);
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

  showResult(winner: 'player' | 'enemy'): void {
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

    const reload = document.createElement('button');
    reload.textContent = 'New battle';
    Object.assign(reload.style, {
      padding: '10px 18px',
      fontSize: '14px',
      color: '#fff',
      background: '#243c66',
      border: '1px solid #5b8def',
      borderRadius: '4px',
      cursor: 'pointer',
      fontFamily: 'inherit',
    });
    reload.addEventListener('click', () => location.reload());
    overlay.appendChild(reload);

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
