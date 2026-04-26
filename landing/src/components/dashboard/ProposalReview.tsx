/**
 * ProposalReview — gate for pending high/medium-sensitivity claims.
 *
 * Phase 4 / G2.
 *
 * Sensitive claims (identity-style, language, demographics) are written
 * with status='pending' regardless of confidence. This panel surfaces
 * exactly those claims, in priority order:
 *
 *   high sensitivity, recent first
 *   medium sensitivity, recent first
 *   low sensitivity but pending (confidence < 0.85), recent first
 *
 * Each row has confirm + reject buttons. Confirm flips status to
 * 'confirmed' and stamps confirmed_at. Reject flips to 'rejected' and
 * drops a `claim_rejected` event so future passes from the same chunk
 * don't immediately re-propose it.
 *
 * Lives inline on /dashboard/memory (above the inventory) when there's
 * anything pending. Otherwise renders nothing.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Claim, Chunk, SourceFile } from "../../lib/database.types";
import { useClaimEvents } from "../../lib/graph/realtime";

type PendingClaim = Claim & {
  chunk: Pick<Chunk, "id" | "text" | "position"> | null;
  sourceFile: Pick<SourceFile, "id" | "filename" | "title" | "kind"> | null;
};

const SENSITIVITY_RANK: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function ProposalReview() {
  const [rows, setRows] = useState<PendingClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { events } = useClaimEvents({ bufferSize: 10 });
  const eventTrigger = events.length > 0 ? events[0].id : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        setRows([]);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("claims")
        .select(
          `
          *,
          chunk:chunks!claims_source_chunk_id_fkey ( id, text, position ),
          sourceFile:source_files!claims_source_file_id_fkey ( id, filename, title, kind )
          `,
        )
        .eq("owner", userData.user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("[ProposalReview] load failed", error);
        setRows([]);
      } else {
        setRows((data ?? []) as unknown as PendingClaim[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventTrigger]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const sa = SENSITIVITY_RANK[a.sensitivity] ?? 9;
      const sb = SENSITIVITY_RANK[b.sensitivity] ?? 9;
      if (sa !== sb) return sa - sb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [rows]);

  async function confirm(claim: PendingClaim) {
    setBusyId(claim.id);
    const { error } = await supabase
      .from("claims")
      .update({
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", claim.id);
    if (error) {
      console.error("[ProposalReview] confirm failed", error);
      setBusyId(null);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== claim.id));
    const { data: u } = await supabase.auth.getUser();
    if (u?.user) {
      await supabase.from("events").insert({
        owner: u.user.id,
        kind: "claim_confirmed",
        payload: {
          claim_id: claim.id,
          predicate: claim.predicate,
          by: "user",
        },
      });
    }
    setBusyId(null);
  }

  async function reject(claim: PendingClaim) {
    setBusyId(claim.id);
    const { error } = await supabase
      .from("claims")
      .update({ status: "rejected" })
      .eq("id", claim.id);
    if (error) {
      console.error("[ProposalReview] reject failed", error);
      setBusyId(null);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== claim.id));
    const { data: u } = await supabase.auth.getUser();
    if (u?.user) {
      await supabase.from("events").insert({
        owner: u.user.id,
        kind: "claim_rejected",
        payload: {
          claim_id: claim.id,
          predicate: claim.predicate,
          by: "user",
        },
      });
    }
    setBusyId(null);
  }

  if (loading) return null;
  if (sorted.length === 0) return null;

  return (
    <section className="mb-14">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="section-label">© ione — proposals</div>
          <h2
            className="h-display text-[1.7rem] sm:text-[2rem] leading-tight mt-1"
            style={{ fontStyle: "italic" }}
          >
            i think — please confirm.
          </h2>
        </div>
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-faint">
          {sorted.length} pending
        </span>
      </div>
      <p className="text-paper-dim text-sm leading-relaxed max-w-[60ch] mb-6">
        these claims are too consequential to act on without your sign-off.
        confirm and ione may use them in future hints. reject and they're
        suppressed permanently from this source.
      </p>
      <ul className="border border-ink-line bg-ink-deep ruled-paper divide-y divide-ink-line">
        {sorted.map((claim) => (
          <ProposalRow
            key={claim.id}
            claim={claim}
            onConfirm={() => confirm(claim)}
            onReject={() => reject(claim)}
            busy={busyId === claim.id}
          />
        ))}
      </ul>
    </section>
  );
}

function ProposalRow({
  claim,
  onConfirm,
  onReject,
  busy,
}: {
  claim: PendingClaim;
  onConfirm: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const isHigh = claim.sensitivity === "high";
  const isMed = claim.sensitivity === "medium";
  return (
    <li className="px-5 sm:px-7 py-5">
      <div className="flex items-baseline gap-3 flex-wrap mb-1.5">
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-red-pencil">
          {claim.predicate}
        </span>
        {(isHigh || isMed) && (
          <span
            className={[
              "font-mono text-[9px] tracking-[0.18em] uppercase px-1.5 py-px border",
              isHigh
                ? "text-red-pencil border-red-pencil/60"
                : "text-brass border-brass/60",
            ].join(" ")}
          >
            {isHigh ? "high sensitivity" : "medium"}
          </span>
        )}
        <span className="font-mono text-[9px] tracking-wide text-paper-mute">
          {(claim.confidence * 100).toFixed(0)}% confidence
        </span>
      </div>
      <p
        className="text-paper text-[16px] leading-snug mb-2"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {renderObject(claim.object)}
      </p>
      {claim.reasoning && (
        <p
          className="text-paper-dim text-sm mb-2 max-w-[68ch] leading-relaxed"
          style={{ fontStyle: "italic" }}
        >
          "{truncate(claim.reasoning, 220)}"
        </p>
      )}
      {claim.sourceFile && (
        <div className="font-mono text-[10px] tracking-wide text-paper-faint mb-3">
          cited from{" "}
          <span className="text-paper-mute">
            {claim.sourceFile.title ?? claim.sourceFile.filename}
          </span>
          {claim.chunk?.position != null && ` · chunk ${claim.chunk.position}`}
        </div>
      )}
      <div className="flex items-center gap-3 mt-1">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="font-mono text-[11px] tracking-[0.18em] uppercase px-3 py-1.5 border border-moss text-moss hover:bg-moss/10 transition-colors disabled:opacity-40"
        >
          confirm
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className="font-mono text-[11px] tracking-[0.18em] uppercase px-3 py-1.5 border border-red-pencil/70 text-red-pencil hover:bg-red-pencil/10 transition-colors disabled:opacity-40"
        >
          reject
        </button>
      </div>
    </li>
  );
}

function renderObject(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
