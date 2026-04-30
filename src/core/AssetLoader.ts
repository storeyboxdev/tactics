import * as THREE from 'three';

/**
 * Texture cache. Loads PNGs once, returns clones for per-instance UV state.
 *
 * Clones share the underlying GPU image but have independent
 * `offset`/`repeat`/`wrap` so two sprites pointing at the same sheet can show
 * different cells. Returns `null` on load failure (404, parse error) so
 * callers can fall back to programmatic placeholders without crashing.
 */
export class AssetLoader {
  private readonly cache = new Map<string, THREE.Texture | null>();
  private readonly inflight = new Map<string, Promise<THREE.Texture | null>>();
  private readonly loader = new THREE.TextureLoader();

  /**
   * Load a pixel-art PNG with crisp filtering and correct color space.
   * Returns a fresh clone — safe to mutate `offset`/`repeat`/`wrap` on the
   * caller's side without affecting other consumers.
   */
  async load(url: string): Promise<THREE.Texture | null> {
    if (this.cache.has(url)) {
      const cached = this.cache.get(url)!;
      return cached ? cached.clone() : null;
    }
    if (this.inflight.has(url)) {
      const tex = await this.inflight.get(url)!;
      return tex ? tex.clone() : null;
    }
    const promise = this.fetch(url);
    this.inflight.set(url, promise);
    const tex = await promise;
    this.inflight.delete(url);
    this.cache.set(url, tex);
    return tex ? tex.clone() : null;
  }

  /** Convenience: preload many URLs in parallel; results are returned in order. */
  async loadAll(urls: readonly string[]): Promise<(THREE.Texture | null)[]> {
    return Promise.all(urls.map(u => this.load(u)));
  }

  private fetch(url: string): Promise<THREE.Texture | null> {
    return new Promise(resolve => {
      this.loader.load(
        url,
        tex => {
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.generateMipmaps = false;
          resolve(tex);
        },
        undefined,
        err => {
          console.warn(`[AssetLoader] failed to load ${url}:`, err);
          resolve(null);
        },
      );
    });
  }
}
