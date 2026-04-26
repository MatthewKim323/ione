import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { authedFetch, readApiError } from "../../lib/api";
import { MarginCollapsible } from "./MarginCollapsible";

/**
 * KGReceipts — proof that the agents are reading from a real, grounded
 * knowledge graph and not vibes. Renders the compiled StruggleProfile (the
 * exact summary the Intervention Agent reads as part of its prompt) on top,
 * and a tiny stack of cited claims underneath. Each claim row IS a receipt:
 *   "weak_at_topic: factoring"   ◀ ExamReader · alg2_midterm.pdf
 * No source = no receipt — we just don't render it. That's the same
 * grounded-by-construction rule from migrations/0002.
 *
 * Fetches once on mount + on `refreshKey` change. There's no realtime stream
 * yet — when the dashboard ingests a new file the user has to either reload
 * or end the session for fresh data, which is fine because the KG only
 * really updates outside the per-cycle loop.
 */

type Receipt = {
  id: string;
  predicate: string;
  object_label: string | null;
  confidence: number;
  status: "confirmed" | "pending" | "rejected" | "superseded";
  reasoning: string | null;
  extracted_by: string;
  created_at: string;
  source: {
    id: string;
    filename: string;
    title: string | null;
    kind: string;
  } | null;
};

type StruggleProfile = {
  pattern_summary: string;
  error_type: string;
  frequency: "frequent" | "occasional" | "rare" | "none";
  examples: Array<{ problem: string; date: string; what_went_wrong: string }>;
  tutor_notes: string;
};

type StrugglePayload = {
  profile: StruggleProfile | null;
  receipts: Receipt[];
  totals: { claims: number; sources: number };
};

export function KGReceipts({
  refreshKey = 0,
  className,
}: {
  /** Bump this number to refetch (e.g. after session end). */
  refreshKey?: number;
  className?: string;
}) {
  const [data, setData] = useState<StrugglePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await authedFetch("/api/me/struggle", { method: "GET" });
        if (!res.ok) {
          const err = await readApiError(res);
          throw err;
        }
        const json = (await res.json()) as StrugglePayload;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "could not load knowledge graph";
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <div className={["flex flex-col gap-4", className ?? ""].join(" ")}>
      <div>
        <div className="section-label-light">knowledge graph · receipts</div>
        <h3
          className="text-ink-deep text-[15px] mt-1.5 leading-snug"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
        >
          what ione actually knows about you.
        </h3>
      </div>

      {loading && <ReceiptsSkeleton />}
      {error && !loading && (
        <div
          className="text-rust text-[12px] leading-snug border-l-2 border-rust/50 pl-3 py-1"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
        >
          {error}
        </div>
      )}
      {!loading && !error && data && (
        <ReceiptsBody data={data} />
      )}
    </div>
  );
}

// ─── body ────────────────────────────────────────────────────────────────

function ReceiptsBody({ data }: { data: StrugglePayload }) {
  const hasProfile = !!data.profile && data.profile.pattern_summary !== "No prior pattern observed yet.";
  const hasReceipts = data.receipts.length > 0;

  if (!hasProfile && !hasReceipts) {
    return (
      <div
        className="text-paper-faint text-[12px] leading-relaxed select-none border-l border-dashed border-paper-faint/40 pl-3 py-1"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
      >
        no claims yet. upload a failed exam or transcript on the dashboard
        and the extractors will index it. claims will show up here as
        receipts.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <MarginCollapsible title="overview · profile" defaultOpen>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 text-[10px] tracking-[0.18em] uppercase">
            <CountTile label="claims" value={data.totals.claims} />
            <CountTile label="sources" value={data.totals.sources} />
          </div>
          {data.profile && <ProfileSummary profile={data.profile} />}
        </div>
      </MarginCollapsible>

      {hasReceipts && (
        <MarginCollapsible title="recent claims" defaultOpen>
          <div className="flex flex-col gap-2.5">
            <AnimatePresence initial={false}>
              {data.receipts.map((r, i) => (
                <ReceiptRow key={r.id} receipt={r} delay={i * 0.04} />
              ))}
            </AnimatePresence>
          </div>
        </MarginCollapsible>
      )}
    </div>
  );
}

// ─── sub-components ──────────────────────────────────────────────────────

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-y border-line py-2">
      <div className="meta-label">{label}</div>
      <div
        className="text-ink-deep text-[18px] leading-tight mt-0.5"
        style={{
          fontFamily: "var(--font-mono)",
          fontFeatureSettings: "'tnum'",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ProfileSummary({ profile }: { profile: StruggleProfile }) {
  const dominantTone = useMemo(() => {
    switch (profile.frequency) {
      case "frequent":
        return "red-pencil";
      case "occasional":
        return "rust";
      case "rare":
        return "brass";
      default:
        return "paper-mute";
    }
  }, [profile.frequency]);

  return (
    <div className="flex flex-col gap-2.5 border-l-2 pl-3 py-1" style={{ borderColor: `var(--color-${dominantTone})` }}>
      <div>
        <div
          className="text-[10px] tracking-[0.18em] uppercase"
          style={{
            fontFamily: "var(--font-mono)",
            color: `var(--color-${dominantTone})`,
          }}
        >
          dominant pattern · {profile.frequency}
        </div>
        <div
          className="text-ink-deep text-[14px] leading-snug mt-0.5"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
        >
          {profile.error_type === "none observed"
            ? "no dominant error pattern yet."
            : profile.error_type}
        </div>
      </div>
      <p
        className="text-paper-faint text-[12px] leading-relaxed"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {profile.pattern_summary}
      </p>
      {profile.tutor_notes && (
        <p
          className="text-paper-mute text-[11px] leading-relaxed italic"
          style={{ fontFamily: "var(--font-display)" }}
        >
          ione's note to itself: {profile.tutor_notes.toLowerCase()}
        </p>
      )}
    </div>
  );
}

function ReceiptRow({ receipt, delay }: { receipt: Receipt; delay: number }) {
  const tone = predicateTone(receipt.predicate);
  const stripeColor = `var(--color-${tone})`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-start gap-2 text-[12px] leading-snug"
    >
      <div
        className="self-stretch w-px shrink-0 mt-1"
        style={{ backgroundColor: stripeColor, opacity: 0.7 }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span
            className="text-[10px] tracking-[0.16em] uppercase"
            style={{ fontFamily: "var(--font-mono)", color: stripeColor, opacity: 0.95 }}
          >
            {humanizePredicate(receipt.predicate)}
          </span>
          {receipt.status === "pending" && (
            <span
              className="text-[9px] tracking-[0.18em] uppercase text-paper-faint"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              · pending
            </span>
          )}
        </div>

        {receipt.object_label && (
          <div className="text-ink-deep text-[13px] mt-0.5" style={{ fontFamily: "var(--font-display)" }}>
            {receipt.object_label}
          </div>
        )}

        {receipt.reasoning && (
          <div
            className="text-paper-faint text-[11.5px] mt-0.5 italic line-clamp-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            "{receipt.reasoning}"
          </div>
        )}

        <SourceLine receipt={receipt} />
      </div>
    </motion.div>
  );
}

function SourceLine({ receipt }: { receipt: Receipt }) {
  // The source is the actual receipt — proof the claim is grounded in
  // something the user uploaded. Render extractor + filename in mono.
  if (!receipt.source) {
    return (
      <div className="mt-1 text-paper-faint text-[10px] tracking-[0.14em] uppercase"
           style={{ fontFamily: "var(--font-mono)" }}>
        ◀ {humanizeExtractor(receipt.extracted_by)}
      </div>
    );
  }
  const label = receipt.source.title || receipt.source.filename;
  return (
    <div className="mt-1 flex items-baseline gap-1.5 text-[10px] tracking-[0.14em] uppercase text-paper-faint"
         style={{ fontFamily: "var(--font-mono)" }}>
      <span>◀</span>
      <span className="text-paper-mute">{humanizeExtractor(receipt.extracted_by)}</span>
      <span>·</span>
      <span className="truncate text-paper-faint">{label}</span>
    </div>
  );
}

function ReceiptsSkeleton() {
  // Three faint pulsing bars matching the receipt layout.
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="flex items-start gap-2"
          animate={{ opacity: [0.35, 0.65, 0.35] }}
          transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
        >
          <div className="self-stretch w-px shrink-0 mt-1 bg-paper-faint/40" />
          <div className="flex-1 space-y-1">
            <div className="h-2 w-20 bg-paper-faint/30" />
            <div className="h-3 w-32 bg-paper-faint/20" />
            <div className="h-2 w-24 bg-paper-faint/15" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── label helpers ────────────────────────────────────────────────────────

function humanizePredicate(p: string): string {
  // The predicate vocabulary is snake_cased on the wire (see
  // landing/src/lib/graph/predicates.ts) — we render it as a short label.
  const overrides: Record<string, string> = {
    weak_at_topic: "weak at",
    strong_at_topic: "strong at",
    unfamiliar_with_topic: "unfamiliar",
    needs_review_on: "needs review",
    mastered_topic: "mastered",
    made_sign_error: "sign error",
    made_arithmetic_error: "arithmetic slip",
    made_concept_gap: "concept gap",
    skipped_step: "skipped step",
    misread_problem: "misread",
    ran_out_of_time: "time pressure",
    enrolled_in_class: "enrolled",
    grade_in_class: "grade",
    current_unit: "current unit",
    test_score: "test score",
    teacher_is: "teacher",
    scored_on_exam: "exam score",
    missed_problem_on: "missed",
    correct_problem_on: "correct",
    low_score_in_subject: "low score",
    high_score_in_subject: "high score",
    weak_at_writing_skill: "weak writing",
    essay_word_count: "essay length",
    essay_theme: "essay theme",
    wants_to_improve_at: "wants to improve",
    target_class: "target class",
    target_test: "target test",
    prefers_explanation_style: "prefers style",
    available_study_hours_per_week: "study hours",
  };
  return overrides[p] ?? p.replace(/_/g, " ");
}

function humanizeExtractor(e: string): string {
  // Extractor names like 'TranscriptReader' and 'ExamReader' aren't pretty.
  return e
    .replace(/Reader$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

function predicateTone(
  p: string,
): "moss" | "paper-mute" | "rust" | "red-pencil" | "brass" {
  if (
    p.startsWith("made_") ||
    p === "skipped_step" ||
    p === "misread_problem" ||
    p === "missed_problem_on" ||
    p === "low_score_in_subject"
  ) {
    return "red-pencil";
  }
  if (
    p === "weak_at_topic" ||
    p === "weak_at_writing_skill" ||
    p === "unfamiliar_with_topic" ||
    p === "needs_review_on" ||
    p === "ran_out_of_time"
  ) {
    return "rust";
  }
  if (
    p === "strong_at_topic" ||
    p === "mastered_topic" ||
    p === "high_score_in_subject" ||
    p === "correct_problem_on"
  ) {
    return "moss";
  }
  if (p === "wants_to_improve_at" || p === "target_class" || p === "target_test") {
    return "brass";
  }
  return "paper-mute";
}
