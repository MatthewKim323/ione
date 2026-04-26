/**
 * Stall detector — independent 1s tick that exposes
 *   { isStalled, secondsSinceLastChange }
 * to the cycle client. Decoupled from the capture loop so the next cycle
 * post sees the latest stall state regardless of when capture decided to
 * encode a frame.
 *
 * Definition (matches plan §11):
 *   • the page "changes" whenever capture reports a diffPct ≥ threshold.
 *   • secondsSinceLastChange = wall clock since the last change.
 *   • isStalled = secondsSinceLastChange ≥ stallThresholdSec (default 60).
 */

export type StallSnapshot = {
  isStalled: boolean;
  secondsSinceLastChange: number;
  lastChangeAt: number | null;
};

export class StallDetector {
  private lastChangeAt: number | null = null;
  private startedAt: number | null = null;
  private stallThresholdSec: number;
  private listeners = new Set<(s: StallSnapshot) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: { stallThresholdSec?: number } = {}) {
    this.stallThresholdSec = opts.stallThresholdSec ?? 60;
  }

  /** Mark a real on-screen change. Called by the capture hook. */
  noteChange(now: number = Date.now()): void {
    this.lastChangeAt = now;
    if (!this.startedAt) this.startedAt = now;
    this.emit();
  }

  /** Begin the 1s tick + emit a fresh snapshot on every tick. */
  start(now: number = Date.now()): void {
    this.startedAt = now;
    this.lastChangeAt ??= now;
    this.stop();
    this.timer = setInterval(() => this.emit(), 1000);
    this.emit();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  reset(): void {
    this.lastChangeAt = null;
    this.startedAt = null;
    this.emit();
  }

  snapshot(now: number = Date.now()): StallSnapshot {
    if (!this.lastChangeAt) {
      return { isStalled: false, secondsSinceLastChange: 0, lastChangeAt: null };
    }
    const seconds = Math.max(0, Math.round((now - this.lastChangeAt) / 1000));
    return {
      isStalled: seconds >= this.stallThresholdSec,
      secondsSinceLastChange: seconds,
      lastChangeAt: this.lastChangeAt,
    };
  }

  subscribe(listener: (s: StallSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const fn of this.listeners) {
      try {
        fn(snap);
      } catch (e) {
        console.warn("[stall] listener threw", e);
      }
    }
  }
}
