/**
 * MemoryInspector — the canonical view of "what does ione know about me".
 *
 * Phase 4 / G1.
 *
 * Read every claim for the signed-in user, grouped by predicate category:
 *
 *   academic      enrolled_in / grade / current_unit / GPA / teachers
 *   performance   exam scores / problems missed / subject scores
 *   errors        sign / arithmetic / concept-gap / skipped / misread / time
 *   topics        weak_at / strong_at / mastered / needs_review
 *   writing       essay-only signals
 *   goals         what student wants
 *   identity      sensitive (high) — only confirmed surface here, with badge
 *   meta          Archivist bookkeeping (collapsed by default)
 *
 * Each card cites its source file/chunk and exposes:
 *   - reject (sets status='rejected', surfaces in Patterns later)
 *   - delete (hard delete; also emits a `claim_disputed_by_user` event)
 *
 * Lives behind /dashboard/memory.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import {
  PREDICATES,
  type PredicateCategory,
} from "../../lib/graph/predicates";
import { useClaimEvents } from "../../lib/graph/realtime";
import type { Claim, Chunk, SourceFile } from "../../lib/database.types";

const CATEGORY_ORDER: PredicateCategory[] = [
  "academic",
  "topics",
  "errors",
  "performance",
  "writing",
  "goals",
  "identity",
  "meta",
];

const CATEGORY_LABEL: Record<PredicateCategory, string> = {
  academic: "school + classes",
  topics: "topics — strong + weak",
  errors: "the kinds of mistakes",
  performance: "exams + scores",
  writing: "writing",
  goals: "where you're aiming",
  identity: "sensitive (you confirmed)",
  meta: "bookkeeping",
};

const CATEGORY_BLURB: Record<PredicateCategory, string> = {
  academic: "what classes you're in, your teachers, your unit.",
  topics: "ione's working theory of where you're sharp vs. shaky.",
  errors: "the *kind* of mistake — sign, arithmetic, concept gap, etc.",
  performance: "scores by exam and subject, with citations.",
  writing: "essay-side signals from any writing you've shared.",
  goals: "the destination, not the diagnosis.",
  identity: "high-stakes claims only show after you've explicitly confirmed.",
  meta: "internal bookkeeping. usually safe to ignore.",
};

type ClaimWithSource = Claim & {
  chunk: Pick<Chunk, "id" | "text" | "position"> | null;
  sourceFile: Pick<SourceFile, "id" | "filename" | "title" | "kind"> | null;
};

export function MemoryInspector() {
  const [rows, setRows] = useState<ClaimWithSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showMeta, setShowMeta] = useState(false);

  // Refresh whenever a claim event lands. We don't merge incremental
  // updates because Supabase doesn't carry the joined source row over
  // realtime — re-fetching is cheaper than a second round trip per
  // claim.
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
        .in("status", ["confirmed", "pending"])
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("[MemoryInspector] load failed", error);
        setRows([]);
      } else {
        setRows((data ?? []) as unknown as ClaimWithSource[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventTrigger]);

  // bucket by category
  const buckets = useMemo(() => {
    const out: Record<PredicateCategory, ClaimWithSource[]> = {
      academic: [],
      performance: [],
      errors: [],
      topics: [],
      writing: [],
      goals: [],
      identity: [],
      meta: [],
    };
    for (const row of rows) {
      const meta = (PREDICATES as Record<string, { category: PredicateCategory } | undefined>)[
        row.predicate
      ];
      const cat = meta?.category ?? "meta";
      out[cat].push(row);
    }
    return out;
  }, [rows]);

  async function rejectClaim(id: string) {
    setBusyId(id);
    const { error } = await supabase
      .from("claims")
      .update({ status: "rejected" })
      .eq("id", id);
    if (error) {
      console.error("[MemoryInspector] reject failed", error);
    } else {
      setRows((prev) => prev.filter((r) => r.id !== id));
      // best-effort dispute event for the realtime feed
      const { data: u } = await supabase.auth.getUser();
      if (u?.user) {
        await supabase.from("events").insert({
          owner: u.user.id,
          kind: "claim_rejected",
          payload: { claim_id: id, by: "user" },
        });
      }
    }
    setBusyId(null);
  }

  async function deleteClaim(id: string) {
    if (
      !window.confirm(
        "delete this claim entirely? this is harder to undo than rejecting.",
      )
    )
      return;
    setBusyId(id);
    const { error } = await supabase.from("claims").delete().eq("id", id);
    if (error) {
      console.error("[MemoryInspector] delete failed", error);
    } else {
      setRows((prev) => prev.filter((r) => r.id !== id));
    }
    setBusyId(null);
  }

  return (
    <section>
      <div className="section-label mb-4">© ione — 002 / memory</div>
      <h1
        className="h-display text-[2.5rem] sm:text-[3.5rem] leading-[0.95] mb-4"
        style={{ fontStyle: "italic" }}
      >
        what i think i know.
      </h1>
      <p className="text-paper-dim text-base leading-relaxed max-w-[60ch] mb-12">
        every line below has a citation. if any of it is wrong — too
        confident, oversimplified, or just plain incorrect — reject it.
        ione will stop using it immediately and learn from the dispute.
      </p>

      {loading && (
        <p className="font-mono text-[11px] text-paper-mute">
          loading the file cabinet…
        </p>
      )}

      {!loading && rows.length === 0 && (
        <div className="border border-ink-line bg-ink-deep ruled-paper p-10 sm:p-12">
          <p
            className="text-paper text-lg leading-snug max-w-[44ch] mb-3"
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
          >
            empty cabinet — nothing yet.
          </p>
          <p className="text-paper-dim text-sm leading-relaxed max-w-[60ch]">
            ione builds your memory by reading what you upload (transcripts,
            failed exams, practice work, writing). once it has at least one
            source, this page fills in.
          </p>
          <Link
            to="/dashboard"
            className="inline-block mt-6 font-mono text-[11px] tracking-[0.14em] uppercase pencil-link"
          >
            ← upload a source
          </Link>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="space-y-14">
          {CATEGORY_ORDER.map((cat) => {
            const items = buckets[cat];
            if (items.length === 0) return null;
            if (cat === "meta" && !showMeta) {
              return (
                <div key={cat}>
                  <button
                    type="button"
                    onClick={() => setShowMeta(true)}
                    className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-mute hover:text-paper transition-colors"
                  >
                    show {items.length} bookkeeping claim
                    {items.length === 1 ? "" : "s"} →
                  </button>
                </div>
              );
            }
            return (
              <CategoryGroup
                key={cat}
                category={cat}
                claims={items}
                onReject={rejectClaim}
                onDelete={deleteClaim}
                busyId={busyId}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function CategoryGroup({
  category,
  claims,
  onReject,
  onDelete,
  busyId,
}: {
  category: PredicateCategory;
  claims: readonly ClaimWithSource[];
  onReject: (id: string) => void;
  onDelete: (id: string) => void;
  busyId: string | null;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-1.5">
        <h2
          className="h-display text-[1.6rem] sm:text-[1.95rem] leading-tight"
          style={{ fontStyle: "italic" }}
        >
          {CATEGORY_LABEL[category]}
        </h2>
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-faint">
          {claims.length} {claims.length === 1 ? "claim" : "claims"}
        </span>
      </div>
      <p className="text-paper-mute text-sm mb-6 max-w-[60ch] leading-relaxed">
        {CATEGORY_BLURB[category]}
      </p>
      <div className="border border-ink-line bg-ink-raise/40">
        <ul className="divide-y divide-ink-line">
          {claims.map((c) => (
            <ClaimRow
              key={c.id}
              claim={c}
              onReject={onReject}
              onDelete={onDelete}
              busy={busyId === c.id}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function ClaimRow({
  claim,
  onReject,
  onDelete,
  busy,
}: {
  claim: ClaimWithSource;
  onReject: (id: string) => void;
  onDelete: (id: string) => void;
  busy: boolean;
}) {
  const sens = claim.sensitivity;
  const isHigh = sens === "high";
  const isMed = sens === "medium";
  return (
    <li className="px-5 sm:px-7 py-5 group">
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3 flex-wrap mb-1.5">
            <span
              className={[
                "font-mono text-[10px] tracking-[0.22em] uppercase",
                claim.status === "confirmed"
                  ? "text-moss"
                  : "text-brass",
              ].join(" ")}
            >
              {claim.predicate}
            </span>
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-paper-mute">
              {claim.status}
            </span>
            <ConfidenceBar value={claim.confidence} />
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
          </div>
          <ObjectLine value={claim.object} />
          {claim.reasoning && (
            <p
              className="text-paper-dim text-sm mt-2 max-w-[68ch] leading-relaxed"
              style={{ fontStyle: "italic" }}
            >
              "{truncate(claim.reasoning, 220)}"
            </p>
          )}
          <Citation claim={claim} />
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onReject(claim.id)}
            disabled={busy}
            className="font-mono text-[10px] tracking-[0.18em] uppercase text-paper-mute hover:text-red-pencil transition-colors opacity-60 group-hover:opacity-100 focus:opacity-100 disabled:opacity-30"
          >
            reject
          </button>
          <button
            type="button"
            onClick={() => onDelete(claim.id)}
            disabled={busy}
            className="font-mono text-[10px] tracking-[0.18em] uppercase text-paper-faint hover:text-red-pencil transition-colors opacity-50 group-hover:opacity-100 focus:opacity-100 disabled:opacity-30"
          >
            delete
          </button>
        </div>
      </div>
    </li>
  );
}

function ObjectLine({ value }: { value: unknown }) {
  if (value == null) {
    return (
      <p className="text-paper text-[15px]" style={{ fontFamily: "var(--font-display)" }}>
        <span className="text-paper-mute italic">no value</span>
      </p>
    );
  }
  if (typeof value === "string") {
    return (
      <p
        className="text-paper text-[15px] leading-snug"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </p>
    );
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return (
      <p
        className="text-paper text-[15px]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {String(value)}
      </p>
    );
  }
  // object
  const json = (() => {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  })();
  return (
    <p className="text-paper text-[14px] font-mono leading-snug break-all">
      {truncate(json, 240)}
    </p>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="block w-16 h-px bg-paper-faint relative overflow-hidden">
        <span
          className="absolute inset-y-0 left-0 bg-red-pencil"
          style={{ width: `${pct * 100}%` }}
        />
      </span>
      <span className="font-mono text-[9px] tracking-wide text-paper-mute">
        {(pct * 100).toFixed(0)}%
      </span>
    </span>
  );
}

function Citation({ claim }: { claim: ClaimWithSource }) {
  const sf = claim.sourceFile;
  const ck = claim.chunk;
  if (!sf && !ck && !claim.extracted_by) return null;
  return (
    <div className="mt-3 flex items-baseline gap-2 flex-wrap font-mono text-[10px] tracking-wide text-paper-faint">
      <span className="tracking-[0.18em] uppercase">cited from</span>
      {sf ? (
        <Link
          to={`/dashboard/sources/${sf.id}`}
          className="text-paper-mute hover:text-red-pencil transition-colors"
          title={sf.filename}
        >
          {sf.title ?? sf.filename}
        </Link>
      ) : (
        <span className="text-paper-mute italic">no source</span>
      )}
      {ck && ck.position != null && (
        <span className="text-paper-faint">· chunk {ck.position}</span>
      )}
      <span className="text-paper-faint">
        · by {claim.extracted_by ?? "unknown"}
      </span>
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
