/**
 * In-memory hint→text cache for the `/api/audio/:hintId` route.
 *
 * Why this exists, instead of looking up `tutor_hints`:
 *   The orchestrator's SSE `hint` event uses `cycleId` as the hint id, but
 *   the persisted `tutor_hints` row gets its own DB-generated UUID, AND
 *   `persistCycle()` runs *after* the SSE stream finishes — it's fired with
 *   `.catch()` and not awaited. Looking up the hint by cycleId from the
 *   audio route is a race: the row may not exist yet by the time the
 *   browser opens the audio fetch (≈ tens of ms after receiving the SSE
 *   `hint` event).
 *
 *   So instead we stash the hint text right when the orchestrator emits
 *   the SSE event, keyed by the same id the frontend will request. The
 *   audio route reads from this cache, then evicts on first read (audio
 *   is single-use; replaying a hint replays from a fresh cycle).
 *
 *   TTL is generous (10 min) because:
 *     1. The browser may delay opening audio fetch if the user is muted.
 *     2. We don't want to evict mid-network-fetch on a slow connection.
 *
 * Memory bound: at ~512 bytes per entry × max ~200 entries before the
 * sweep, this is ≤100KB — fine for a single API instance. If we ever
 * scale horizontally, swap this for Redis with the same surface area.
 */

type CachedHint = {
  text: string;
  expiresAt: number;
  /** Source cycle id, for logging / audit. */
  cycleId: string;
  /** Used to bill cost back to the right session if we ever care. */
  sessionId: string;
};

const cache = new Map<string, CachedHint>();
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 256;

export function cacheHintForAudio(opts: {
  hintId: string;
  text: string;
  cycleId: string;
  sessionId: string;
}): void {
  // Soft GC: if we're over the cap, evict the 32 oldest entries. This is
  // O(n) but n is bounded so it stays cheap. Avoids dragging in an LRU dep.
  if (cache.size >= MAX_ENTRIES) {
    const sorted = [...cache.entries()].sort(
      (a, b) => a[1].expiresAt - b[1].expiresAt,
    );
    for (let i = 0; i < 32 && i < sorted.length; i++) {
      cache.delete(sorted[i]![0]);
    }
  }
  cache.set(opts.hintId, {
    text: opts.text,
    expiresAt: Date.now() + TTL_MS,
    cycleId: opts.cycleId,
    sessionId: opts.sessionId,
  });
}

/** Reads (and evicts) the cached hint. Returns null if missing or expired. */
export function consumeHintForAudio(hintId: string): CachedHint | null {
  const hit = cache.get(hintId);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(hintId);
    return null;
  }
  // Note: we *don't* evict on read — a fast reload could re-fetch the same
  // audio. We rely on TTL to age these out. ElevenLabs charge is paid each
  // synthesis, but that's cheap (~$0.005/hint) and replays are rare.
  return hit;
}

/** Drop everything (used by tests). */
export function clearHintCache(): void {
  cache.clear();
}

export function hintCacheDebug(): { size: number; max: number; ttlMs: number } {
  return { size: cache.size, max: MAX_ENTRIES, ttlMs: TTL_MS };
}
