/**
 * MemoryFeed — live ticker of "what ione just learned about you".
 *
 * Phase 3 / F6 — proves the realtime pipeline end-to-end. The full
 * MemoryInspector lands in Phase 4 / G1; this component is intentionally
 * minimal: a chronological list of recent claim_proposed/claim_confirmed
 * events with the predicate, source, and a relative timestamp.
 *
 * Design intent: lives in the margin of the dashboard, not the center.
 * Reads as a lab notebook side-column, not a notifications panel.
 */
import { useGraphEvents } from "../lib/graph/realtime";

const KIND_LABEL: Record<string, string> = {
  source_uploaded: "uploaded",
  claim_proposed: "proposed",
  claim_confirmed: "confirmed",
  claim_rejected: "rejected",
  extractor_completed: "read",
  extractor_failed: "stalled",
  tutor_hint_surfaced: "spoke",
  tutor_hint_suppressed: "held back",
};

const KIND_ACCENT: Record<string, string> = {
  source_uploaded: "text-brass",
  claim_proposed: "text-paper-mute",
  claim_confirmed: "text-moss",
  claim_rejected: "text-red-pencil",
  extractor_completed: "text-moss",
  extractor_failed: "text-red-pencil",
  tutor_hint_surfaced: "text-paper",
  tutor_hint_suppressed: "text-paper-mute",
};

export function MemoryFeed({ bufferSize = 12 }: { bufferSize?: number }) {
  const { events, isReady } = useGraphEvents({
    bufferSize,
    kinds: [
      "source_uploaded",
      "claim_proposed",
      "claim_confirmed",
      "claim_rejected",
      "extractor_completed",
      "extractor_failed",
    ],
  });

  return (
    <div className="border border-ink-line bg-ink-raise/40 p-6 sm:p-7">
      <div className="flex items-baseline justify-between mb-5">
        <div className="section-label">© ione — memory feed</div>
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-faint">
          live
        </span>
      </div>

      {!isReady && (
        <p className="font-mono text-[11px] tracking-wide text-paper-mute">
          listening for the graph…
        </p>
      )}

      {isReady && events.length === 0 && (
        <p className="font-mono text-[11px] leading-relaxed text-paper-mute">
          nothing yet — when ione reads a source or proposes a claim, it
          shows up here.
        </p>
      )}

      {events.length > 0 && (
        <ul className="space-y-2.5">
          {events.map((e) => {
            const label = KIND_LABEL[e.kind] ?? e.kind;
            const accent = KIND_ACCENT[e.kind] ?? "text-paper-mute";
            const headline = headlineFor(e.kind, e.payload);
            return (
              <li
                key={e.id}
                className="flex items-baseline gap-3 text-sm leading-snug"
              >
                <span
                  className={`font-mono text-[9px] tracking-[0.22em] uppercase shrink-0 w-[5.5rem] ${accent}`}
                >
                  {label}
                </span>
                <span className="text-paper-dim flex-1 min-w-0 truncate">
                  {headline}
                </span>
                <span className="font-mono text-[9px] tracking-wide text-paper-faint shrink-0">
                  {timeAgo(e.created_at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Best-effort one-line summary for an event payload. Falls back to the
 * raw kind if we don't know the shape — events are intentionally
 * loosely typed so we degrade gracefully.
 */
function headlineFor(
  kind: string,
  payload: Record<string, unknown>,
): string {
  if (kind === "claim_proposed" || kind === "claim_confirmed" || kind === "claim_rejected") {
    const predicate = typeof payload.predicate === "string" ? payload.predicate : "claim";
    const conf = typeof payload.confidence === "number" ? payload.confidence : null;
    return conf != null ? `${predicate} · ${(conf * 100).toFixed(0)}%` : predicate;
  }
  if (kind === "source_uploaded") {
    const filename =
      typeof payload.filename === "string" ? payload.filename : "a source";
    const sk =
      typeof payload.source_kind === "string" ? payload.source_kind : "";
    return sk ? `${filename} (${sk})` : filename;
  }
  if (kind === "extractor_completed" || kind === "extractor_failed") {
    const ex =
      typeof payload.extractor === "string" ? payload.extractor : "extractor";
    const n =
      typeof payload.claim_count === "number" ? payload.claim_count : null;
    return n != null ? `${ex} → ${n} claim${n === 1 ? "" : "s"}` : ex;
  }
  return kind;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}
