/**
 * Runtime custom-map layer. Maps authored in the in-app editor live in
 * localStorage (key `tactics-custom-maps`); the battle bootstrap mixes
 * them into its random pick, and the editor can flag a specific map for
 * the next battle ("Test"). Maps can also be exported to / imported from
 * JSON files for sharing or committing to the repo.
 *
 * Validation mirrors `Save.ts`: anything malformed is dropped, never
 * crashes the caller.
 */

import { MapData } from '../battle/Map';

const STORE_KEY = 'tactics-custom-maps';
const SELECTED_KEY = 'tactics-selected-map';
const EDITOR_TEST_KEY = 'tactics-editor-test-map';

/** Validate an unknown value as `MapData`. Returns a clean copy or null. */
export function validateMapData(raw: unknown): MapData | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.name !== 'string' || m.name.length === 0) return null;
  if (!Number.isInteger(m.width) || !Number.isInteger(m.height)) return null;
  const w = m.width as number;
  const h = m.height as number;
  if (w < 1 || h < 1) return null;

  const heights = validateGrid(m.heights, w, h, v => typeof v === 'number');
  if (!heights) return null;

  let terrains: string[][] | undefined;
  if (m.terrains !== undefined) {
    const t = validateGrid(m.terrains, w, h, v => typeof v === 'string');
    if (!t) return null;
    terrains = t as string[][];
  }

  const spawns = validateSpawns(m.spawns, w, h);
  if (!spawns) return null;

  const out: MapData = { name: m.name, width: w, height: h, heights: heights as number[][], spawns };
  if (terrains) out.terrains = terrains;
  return out;
}

function validateGrid(raw: unknown, w: number, h: number, ok: (v: unknown) => boolean): unknown[][] | null {
  if (!Array.isArray(raw) || raw.length !== h) return null;
  const rows: unknown[][] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length !== w || !row.every(ok)) return null;
    rows.push([...row]);
  }
  return rows;
}

function validateSpawns(raw: unknown, w: number, h: number): MapData['spawns'] | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const player = validateSpawnList(s.player, w, h);
  const enemy = validateSpawnList(s.enemy, w, h);
  return player && enemy ? { player, enemy } : null;
}

function validateSpawnList(raw: unknown, w: number, h: number): [number, number][] | null {
  if (!Array.isArray(raw)) return null;
  const out: [number, number][] = [];
  for (const pair of raw) {
    if (!Array.isArray(pair) || pair.length !== 2) return null;
    const [x, z] = pair;
    if (!Number.isInteger(x) || !Number.isInteger(z)) return null;
    if (x < 0 || z < 0 || x >= w || z >= h) return null;
    out.push([x, z]);
  }
  return out;
}

/** Every custom map in the browser store; malformed entries are dropped. */
export function loadCustomMaps(): MapData[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(validateMapData).filter((m): m is MapData => m !== null);
  } catch {
    return [];
  }
}

/** Save a custom map, replacing any existing custom map of the same name. */
export function saveCustomMap(map: MapData): void {
  writeCustomMaps([...loadCustomMaps().filter(m => m.name !== map.name), map]);
}

export function deleteCustomMap(name: string): void {
  writeCustomMaps(loadCustomMaps().filter(m => m.name !== name));
}

function writeCustomMaps(maps: MapData[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(maps));
  } catch {
    // QuotaExceededError or similar — drop silently.
  }
}

/** Flag a map for the next battle — the editor's "Test" action. One-shot:
 *  `resolveBattleMap` consumes it, so the battle after reverts to random. */
export function selectMapForBattle(map: MapData): void {
  try { sessionStorage.setItem(SELECTED_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

/**
 * The map the next battle should use: a one-shot editor selection if one
 * is pending (consumed here), else a random pick from the built-in maps
 * unioned with the custom store.
 */
export function resolveBattleMap(builtIn: MapData[]): MapData {
  try {
    const sel = sessionStorage.getItem(SELECTED_KEY);
    if (sel) {
      sessionStorage.removeItem(SELECTED_KEY);
      const m = validateMapData(JSON.parse(sel));
      if (m) return m;
    }
  } catch {
    // fall through to a random pick
  }
  const pool = [...builtIn, ...loadCustomMaps()];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Editor "Test" round-trip ────────────────────────────────────────────────
// When the map editor's Test launches a battle it records the map name here,
// so the post-battle roster screen can offer a route back to the editor and
// the editor can reopen on that map.

/** Record that the next battle is an editor test of `mapName`. */
export function setEditorTestMap(mapName: string): void {
  try { sessionStorage.setItem(EDITOR_TEST_KEY, mapName); } catch { /* ignore */ }
}

/** The name of the map being editor-tested, or null. Does not clear it. */
export function peekEditorTestMap(): string | null {
  try { return sessionStorage.getItem(EDITOR_TEST_KEY); } catch { return null; }
}

export function clearEditorTestMap(): void {
  try { sessionStorage.removeItem(EDITOR_TEST_KEY); } catch { /* ignore */ }
}

/** Read the editor-test map name and clear it (the editor consumes it). */
export function takeEditorTestMap(): string | null {
  const name = peekEditorTestMap();
  clearEditorTestMap();
  return name;
}

/** Find a map by `MapData.name` across the built-in and custom maps. */
export function mapByName(name: string, builtIn: MapData[]): MapData | undefined {
  return [...builtIn, ...loadCustomMaps()].find(m => m.name === name);
}

/** Download a map as a JSON file. */
export function exportMap(map: MapData): void {
  const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${map.name.replace(/[^a-z0-9_-]+/gi, '_') || 'map'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse an uploaded JSON file into a `MapData`, or null if invalid. */
export async function importMap(file: File): Promise<MapData | null> {
  try {
    return validateMapData(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}
