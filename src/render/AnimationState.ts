import { SHEET_LAYOUT, AnimStateName } from '../data/sprites';

/**
 * Per-unit animation state machine. Pure logic — no Three.js dependency, easy
 * to test in isolation. The renderer reads `currentColumn()` each frame to
 * pick which cell of the sheet to display.
 *
 * One-shot states (attack, hurt) automatically transition back to idle on
 * completion and fire the optional `onComplete` callback. Looped states (idle,
 * walk, ko) cycle their column list forever.
 */
export class AnimationState {
  private state: AnimStateName = 'idle';
  private frameIdx = 0;
  private elapsed = 0;
  private onComplete: (() => void) | null = null;
  private impactFrame = -1;
  private impactFired = false;
  private onImpact: (() => void) | null = null;

  /** Current state name. */
  get current(): AnimStateName { return this.state; }

  /** Frame index (0-based) within the current state's column list. */
  get frame(): number { return this.frameIdx; }

  /** The column number on the sheet to render right now. */
  currentColumn(): number {
    return SHEET_LAYOUT.states[this.state].cols[this.frameIdx];
  }

  /**
   * Switch to a new state. Looped states play forever; one-shots run to
   * completion and call `onComplete`. `onImpact` (only meaningful for attack)
   * fires when a specific frame index is reached.
   */
  play(state: AnimStateName, opts: { onComplete?: () => void; onImpact?: () => void; impactFrame?: number } = {}): void {
    this.state = state;
    this.frameIdx = 0;
    this.elapsed = 0;
    this.onComplete = opts.onComplete ?? null;
    this.onImpact = opts.onImpact ?? null;
    this.impactFrame = opts.impactFrame ?? -1;
    this.impactFired = false;
  }

  tick(dt: number): void {
    const def = SHEET_LAYOUT.states[this.state];
    this.elapsed += dt;
    while (this.elapsed >= def.frameTime) {
      this.elapsed -= def.frameTime;

      // Fire impact when leaving the impact frame so callers can sync hit FX.
      if (!this.impactFired && this.impactFrame === this.frameIdx && this.onImpact) {
        this.impactFired = true;
        this.onImpact();
      }

      this.frameIdx++;
      if (this.frameIdx >= def.cols.length) {
        if (def.loop) {
          this.frameIdx = 0;
        } else {
          // One-shot complete: snap to last frame, fire callback, drop to idle.
          this.frameIdx = def.cols.length - 1;
          const cb = this.onComplete;
          this.onComplete = null;
          this.onImpact = null;
          this.state = 'idle';
          this.frameIdx = 0;
          this.elapsed = 0;
          cb?.();
          return;
        }
      }
    }
  }
}
