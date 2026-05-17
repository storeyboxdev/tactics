/**
 * Runtime custom-sprite layer. Unit sheets authored in the in-app
 * sprite editor live in localStorage (key `tactics-custom-sprites`) as
 * data-URL PNGs keyed by `${jobId}_${team}`; `UnitRenderer` loads a
 * custom sheet in preference to the built-in `public/sprites/units/`
 * PNG. Sheets can also be exported to / imported from PNG files.
 *
 * Mirrors `CustomMaps.ts` — anything malformed is dropped, never crashes.
 */

import { SHEET_LAYOUT } from '../data/sprites';

const STORE_KEY = 'tactics-custom-sprites';

/** A unit sheet is a 14×4 grid of 32×48 cells. */
export const SHEET_WIDTH = SHEET_LAYOUT.cellW * SHEET_LAYOUT.cols;
export const SHEET_HEIGHT = SHEET_LAYOUT.cellH * SHEET_LAYOUT.rows;

function spriteKey(jobId: string, team: string): string {
  return `${jobId}_${team}`;
}

function readStore(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, string>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // QuotaExceededError or similar — drop silently.
  }
}

/** The custom sheet data-URL for a job/team, or null. */
export function loadCustomSprite(jobId: string, team: string): string | null {
  const v = readStore()[spriteKey(jobId, team)];
  return typeof v === 'string' ? v : null;
}

export function saveCustomSprite(jobId: string, team: string, dataUrl: string): void {
  const store = readStore();
  store[spriteKey(jobId, team)] = dataUrl;
  writeStore(store);
}

export function deleteCustomSprite(jobId: string, team: string): void {
  const store = readStore();
  delete store[spriteKey(jobId, team)];
  writeStore(store);
}

/** The `${jobId}_${team}` keys that have a custom sheet. */
export function customSpriteKeys(): string[] {
  return Object.keys(readStore());
}

/** Download a sheet as a PNG file (the data-URL is already a PNG). */
export function exportSpritePng(filename: string, dataUrl: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${filename.replace(/[^a-z0-9_-]+/gi, '_') || 'sprite'}.png`;
  a.click();
}

/**
 * Read an uploaded PNG into a data-URL, or null if it isn't a valid
 * image at the expected sheet dimensions.
 */
export function importSprite(file: File): Promise<string | null> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== 'string') { resolve(null); return; }
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => resolve(
        img.naturalWidth === SHEET_WIDTH && img.naturalHeight === SHEET_HEIGHT
          ? dataUrl : null,
      );
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
