/**
 * Between-battles shop overlay. Spends gil on loot-tier (stat-bonus)
 * gear; a purchase commits straight to the save via `buyGear` +
 * `writeSave`, so it survives even if the player doesn't start the next
 * battle. Sits on top of the roster screen; `onClose` rebuilds that
 * screen so freshly-bought gear shows up in its equip dropdowns.
 */

import { WEAPONS, BONUS_WEAPON_IDS, GearBonuses } from '../data/weapons';
import { ARMOR, BONUS_ARMOR_IDS } from '../data/armor';
import { loadSave, writeSave, buyGear } from '../core/Save';

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

function gearLine(id: string): { name: string; desc: string; price: number; isWeapon: boolean } {
  const w = WEAPONS[id];
  if (w) {
    return {
      name: w.name,
      desc: `WP ${w.weaponPower}${bonusLabel(w.bonuses)}`,
      price: w.price ?? 0,
      isWeapon: true,
    };
  }
  const a = ARMOR[id];
  const pct = (f: number) => `${Math.round((1 - f) * 100)}%`;
  return {
    name: a.name,
    desc: `Phys -${pct(a.physicalFactor)} / Magic -${pct(a.magicalFactor)}${bonusLabel(a.bonuses)}`,
    price: a.price ?? 0,
    isWeapon: false,
  };
}

export function showShopScreen(onClose: () => void): void {
  const root = document.getElementById('hud');
  if (!root) return;

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: absolute; inset: 0;
    background: rgba(0, 0, 0, 0.92);
    display: flex; flex-direction: column;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: #fff; overflow: auto; padding: 24px; gap: 14px;
    box-sizing: border-box; z-index: 20;
  `;

  function render(): void {
    overlay.innerHTML = '';
    const save = loadSave();
    const gil = save?.gil ?? 0;
    const owned = save?.foundGear ?? { weapons: [], armors: [] };

    const heading = document.createElement('div');
    heading.textContent = 'SHOP';
    heading.style.cssText = 'font-size:20px;font-weight:900;letter-spacing:2px;color:#ffe14a;text-align:center;';
    overlay.appendChild(heading);

    const gilLine = document.createElement('div');
    gilLine.textContent = `Gil: ${gil}`;
    gilLine.style.cssText = 'text-align:center;color:#ffe14a;font-size:14px;';
    overlay.appendChild(gilLine);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:10px;';
    overlay.appendChild(grid);

    for (const id of [...BONUS_WEAPON_IDS, ...BONUS_ARMOR_IDS]) {
      const g = gearLine(id);
      const isOwned = (g.isWeapon ? owned.weapons : owned.armors).includes(id);
      const affordable = gil >= g.price;

      const panel = document.createElement('div');
      panel.style.cssText = `
        background: rgba(20, 25, 40, 0.92);
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 6px; padding: 10px;
        display: flex; align-items: center; gap: 10px; font-size: 12px;
      `;

      const info = document.createElement('div');
      info.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:2px;';
      info.innerHTML =
        `<span style="font-weight:700;color:#ffe14a;">${g.name}</span>` +
        `<span style="opacity:0.8;">${g.desc}</span>` +
        `<span style="opacity:0.8;">${g.price} gil</span>`;
      panel.appendChild(info);

      const btn = document.createElement('button');
      if (isOwned) {
        btn.textContent = 'Owned';
        btn.disabled = true;
      } else {
        btn.textContent = 'Buy';
        btn.disabled = !affordable;
        if (affordable) btn.addEventListener('click', () => {
          const s = loadSave();
          if (!s) return;
          const result = buyGear(s, id);
          if (result) { writeSave(result); render(); }
        });
      }
      const usable = !btn.disabled;
      btn.style.cssText = `
        padding: 6px 14px; font-family: inherit; font-size: 12px;
        color: ${usable ? '#fff' : '#888'};
        background: ${usable ? '#243c66' : '#1a1a26'};
        border: 1px solid ${usable ? '#5b8def' : '#333'};
        border-radius: 3px; cursor: ${usable ? 'pointer' : 'not-allowed'};
      `;
      panel.appendChild(btn);
      grid.appendChild(panel);
    }

    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;justify-content:center;margin-top:8px;';
    const close = document.createElement('button');
    close.textContent = 'Close';
    close.style.cssText = `
      padding: 10px 20px; font-size: 14px; font-family: inherit; color: #fff;
      background: #243c66; border: 1px solid #5b8def; border-radius: 4px; cursor: pointer;
    `;
    close.addEventListener('click', () => { overlay.remove(); onClose(); });
    footer.appendChild(close);
    overlay.appendChild(footer);
  }

  render();
  root.appendChild(overlay);
}
