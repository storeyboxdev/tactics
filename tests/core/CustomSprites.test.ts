import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadCustomSprite, saveCustomSprite, deleteCustomSprite, customSpriteKeys,
} from '../../src/core/CustomSprites';

// Vitest's node environment has no Web Storage — install an in-memory shim.
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string): string | null { return this.data.get(k) ?? null; }
  setItem(k: string, v: string): void { this.data.set(k, v); }
  removeItem(k: string): void { this.data.delete(k); }
  clear(): void { this.data.clear(); }
}
(globalThis as any).localStorage = new MemoryStorage();

describe('custom sprite store', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a saved sheet', () => {
    saveCustomSprite('knight', 'player', 'data:image/png;base64,AAA');
    expect(loadCustomSprite('knight', 'player')).toBe('data:image/png;base64,AAA');
  });

  it('returns null for a job/team with no custom sheet', () => {
    expect(loadCustomSprite('goblin', 'enemy')).toBeNull();
  });

  it('keys job and team independently', () => {
    saveCustomSprite('knight', 'player', 'P');
    saveCustomSprite('knight', 'enemy', 'E');
    expect(loadCustomSprite('knight', 'player')).toBe('P');
    expect(loadCustomSprite('knight', 'enemy')).toBe('E');
  });

  it('lists and deletes custom sheets', () => {
    saveCustomSprite('knight', 'player', 'P');
    saveCustomSprite('mime', 'enemy', 'M');
    expect(customSpriteKeys().sort()).toEqual(['knight_player', 'mime_enemy']);
    deleteCustomSprite('knight', 'player');
    expect(customSpriteKeys()).toEqual(['mime_enemy']);
  });
});
