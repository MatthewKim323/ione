/**
 * Realtime subscriptions over the knowledge graph (events + claims tables).
 *
 * Phase 3 / F6.
 *
 * The events table is the canonical broadcast bus: every claim write —
 * whether from a post-upload extractor, the orchestrator predicting an
 * error, or the student confirming a proposal — drops a row. We subscribe
 * to it once, hand callers narrow callbacks.
 *
 * Important: each hook instance must use a **unique** channel name. The
 * Supabase client reuses an existing topic, so a fixed name like `kg-events`
 * would merge MemoryFeed + ProposalReview + MemoryInspector — then
 * `removeChannel` from one surface tears down the others and callbacks fight.
 *
 * Why not subscribe directly to claims?
 *   - claims has high RLS overhead per row insert
 *   - we want one stream per *semantic* event ("a claim was proposed")
 *     not one per low-level mutation ("rows updated")
 *   - the orchestrator already writes to events on every cycle, so we
 *     get tutoring activity for free in the same channel
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import type { GraphEvent } from "../database.types";

export type GraphEventKind =
  | "source_uploaded"
  | "claim_proposed"
  | "claim_confirmed"
  | "claim_rejected"
  | "extractor_completed"
  | "extractor_failed"
  | "tutor_hint_surfaced"
  | "tutor_hint_suppressed"
  | (string & {}); // anything else, future-proofed

export interface GraphEventLite {
  id: string;
  kind: GraphEventKind;
  payload: Record<string, unknown>;
  created_at: string;
}

/**
 * Subscribe to all `events` rows for the current authenticated user.
 * RLS already restricts the channel to rows where `owner = auth.uid()`,
 * so callers don't need to filter.
 *
 * Returns a stable list of the most recent N events (default 50) plus a
 * helper to clear the buffer (e.g. when switching pages).
 */
export function useGraphEvents(opts?: {
  /** Max buffered events. Older ones drop off the back. */
  bufferSize?: number;
  /** Optional kind filter applied client-side (don't worry about it server-side). */
  kinds?: readonly GraphEventKind[];
  /** If true, performs an initial fetch of the last `bufferSize` events. */
  fetchInitial?: boolean;
}): {
  events: GraphEventLite[];
  clear: () => void;
  isReady: boolean;
} {
  const bufferSize = opts?.bufferSize ?? 50;
  const fetchInitial = opts?.fetchInitial ?? true;
  const kinds = opts?.kinds;

  const [events, setEvents] = useState<GraphEventLite[]>([]);
  const [isReady, setIsReady] = useState(false);

  // Stash the kinds filter in a ref so the channel callback closes over the
  // *latest* value without forcing a resubscribe whenever the parent rerenders.
  const kindsRef = useRef(kinds);
  kindsRef.current = kinds;

  const channelNameRef = useRef<string | null>(null);
  if (!channelNameRef.current) {
    channelNameRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `kg-events-${crypto.randomUUID()}`
        : `kg-events-${Math.random().toString(36).slice(2, 11)}`;
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (fetchInitial) {
        const { data, error } = await supabase
          .from("events")
          .select("id, kind, payload, created_at")
          .order("created_at", { ascending: false })
          .limit(bufferSize);
        if (!cancelled && !error && data) {
          const filtered = kindsRef.current
            ? data.filter((e) => kindsRef.current!.includes(e.kind))
            : data;
          setEvents(filtered as GraphEventLite[]);
        }
      }
      setIsReady(true);
    }
    void bootstrap();

    const channel = supabase
      .channel(channelNameRef.current!)
      .on<GraphEvent>(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events" },
        (msg) => {
          const row = msg.new;
          if (!row) return;
          if (kindsRef.current && !kindsRef.current.includes(row.kind)) return;
          setEvents((prev) => {
            // dedup just in case the bootstrap raced the channel
            if (prev.some((e) => e.id === row.id)) return prev;
            const next = [
              {
                id: row.id,
                kind: row.kind,
                payload: row.payload ?? {},
                created_at: row.created_at,
              },
              ...prev,
            ];
            return next.length > bufferSize ? next.slice(0, bufferSize) : next;
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [bufferSize, fetchInitial]);

  return {
    events,
    clear: () => setEvents([]),
    isReady,
  };
}

/**
 * Narrower hook: only emits when a claim is proposed/confirmed/rejected.
 * Useful for the Memory Inspector and ProposalReview surfaces.
 */
export function useClaimEvents(opts?: { bufferSize?: number }): {
  events: GraphEventLite[];
  isReady: boolean;
} {
  const { events, isReady } = useGraphEvents({
    bufferSize: opts?.bufferSize ?? 30,
    kinds: ["claim_proposed", "claim_confirmed", "claim_rejected"],
  });
  return { events, isReady };
}
