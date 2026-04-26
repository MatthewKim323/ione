import { useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Math as KaTeXMath } from "../design/Math";
import type { CycleEvent, KgReference } from "../../lib/tutor/cycleClient";

/**
 * AgentTrace — live, per-cycle timeline of which orchestrator agents ran,
 * what they decided, and how much they cost. The whole point is to make
 * the multi-agent pipeline visible to the user (and demo audience):
 * "this isn't one big black box; OCR, Reasoning, Predictive, Policy and
 * Intervention all just argued about your work."
 *
 * We *derive* per-stage status from existing CycleEvents — see sse.ts for
 * the union — without extending the SSE schema. The orchestrator runs:
 *
 *     OCR  ──┐
 *            ├─→  Reasoning ∥ Predictive  ─→  Policy  ─→  (Intervention)  ─→  Done
 *
 * The events the wire actually carries are { kg_lookup, ocr, confidence,
 * hint, done }, and that's enough to reconstruct the full chain because
 * each event has a forced-after-its-stage emit point in routes/cycle.ts +
 * orchestrator.ts. Reading order:
 *
 *   • `kg_lookup` arrives → struggle profile + claim references loaded
 *   • `ocr` arrives  → OCR done, has confidence/page_state
 *   • `confidence` arrives → Reasoning + Predictive + Policy all complete
 *   • `hint` arrives  → Intervention also fired and produced a hint
 *   • `done` arrives  → cycle finished, has total_ms + total_cost
 *
 * If `hint` never arrived but `confidence` did, Intervention was *skipped*
 * (policy decided silence) — we show that as "— silent" with the policy
 * reason, which is exactly how the hand-pencil ribbon decides.
 *
 * The kg_lookup event is what makes the longitudinal knowledge graph
 * VISIBLE in the cycle: we render a "memory" stage chip that fires before
 * OCR and surfaces every claim that fed into Predictive/Intervention. This
 * is how the demo audience sees that the tutor isn't running cold — it's
 * referencing the user's actual ingested files.
 */

export type CycleLog = {
  /** Index in the session, monotonic from 0. */
  index: number;
  /** Cycle id once `done` lands; until then a synthetic `pending-<idx>`. */
  id: string;
  startedAt: number;
  finishedAt: number | null;
  /**
   * Knowledge-graph snapshot consulted at the start of the cycle. Null until
   * the `kg_lookup` event lands. Populated even on cold-start (had_profile=
   * false, references empty) so we can show the difference between "we
   * looked, found nothing yet" and "we haven't looked yet".
   */
  kg:
    | {
        hadProfile: boolean;
        claimCount: number;
        patternSummary: string | null;
        dominantError: string | null;
        frequency: string | null;
        references: KgReference[];
      }
    | null;
  /** Per-stage outputs we plucked from CycleEvents. Null = not seen yet. */
  ocr:
    | {
        confidence: number;
        pageState: "fresh_problem" | "in_progress" | "near_complete" | "stalled_or_stuck";
        currentStepLatex: string | null;
        /**
         * Every prior line of work the OCR pipeline saw, in order. We render
         * these alongside the current step so the trace shows the full chain
         * of equations the student wrote — not just the one Sonnet picked.
         */
        completedStepsLatex: string[];
        problemText: string | null;
        /**
         * Raw Mathpix transcription for the whole frame. Surfaced as a
         * receipt so the user can confirm OCR caught everything on the page,
         * even if Sonnet didn't lift any of it into current_step_latex.
         */
        mathpixLatex: string | null;
        mathpixConfidence: number | null;
      }
    | null;
  confidence:
    | {
        level: "moss" | "graphite" | "sienna_soft" | "sienna";
        reason: string;
      }
    | null;
  hint:
    | {
        text: string;
        type:
          | "error_callout"
          | "scaffolding_question"
          | "encouragement"
          | "redirect"
          /**
           * Only present when the student pressed "I need help" — the
           * intervention agent ran in EXPLAIN mode (full walkthrough,
           * names the rule, may give the answer). The trace renders this
           * with a "you asked" tag so it's visibly distinct from autonomous
           * hints.
           */
          | "explanation";
        predicted: boolean;
        severity?: 1 | 2 | 3 | 4 | 5;
        /**
         * Mirrors `assistance` from the SSE hint event. When "explain", we
         * know this hint was a direct user request, not an autonomous
         * intervention — used to badge the intervention chip + receipt.
         */
        assistance?: "explain";
      }
    | null;
  costUsd: number | null;
  ms: number | null;
};

/**
 * Pure reducer: take a partial CycleLog + a new CycleEvent and return the
 * updated log. TutorWorkspace owns the array of CycleLogs and calls this on
 * each event, so AgentTrace stays a thin renderer.
 */
export function applyCycleEvent(prev: CycleLog, evt: CycleEvent): CycleLog {
  switch (evt.type) {
    case "kg_lookup":
      return {
        ...prev,
        kg: {
          hadProfile: evt.had_profile,
          claimCount: evt.claim_count,
          patternSummary: evt.pattern_summary,
          dominantError: evt.dominant_error,
          frequency: evt.frequency,
          references: evt.references,
        },
      };
    case "ocr":
      return {
        ...prev,
        ocr: {
          confidence: evt.confidence,
          pageState: evt.page_state,
          currentStepLatex: evt.current_step_latex,
          completedStepsLatex: evt.completed_steps_latex,
          problemText: evt.problem_text,
          mathpixLatex: evt.mathpix_latex,
          mathpixConfidence: evt.mathpix_confidence,
        },
      };
    case "confidence":
      return {
        ...prev,
        confidence: { level: evt.level, reason: evt.reason },
      };
    case "hint":
      return {
        ...prev,
        hint: {
          text: evt.text,
          type: evt.hint_type,
          predicted: evt.predicted,
          severity: evt.severity,
          assistance: evt.assistance,
        },
      };
    case "done":
      return {
        ...prev,
        id: evt.cycle_id,
        finishedAt: Date.now(),
        costUsd: evt.cost_usd,
        ms: evt.ms,
      };
    case "error":
      // Mark the cycle finished but keep partial state visible.
      return { ...prev, finishedAt: Date.now() };
  }
  return prev;
}

export function newCycleLog(index: number): CycleLog {
  return {
    index,
    id: `pending-${index}`,
    startedAt: Date.now(),
    finishedAt: null,
    kg: null,
    ocr: null,
    confidence: null,
    hint: null,
    costUsd: null,
    ms: null,
  };
}

// ─── stage status derivation ──────────────────────────────────────────────

type StageId =
  | "memory"
  | "ocr"
  | "reasoning"
  | "predictive"
  | "policy"
  | "intervention";

type StageStatus = "pending" | "running" | "done" | "skipped";

type Stage = {
  id: StageId;
  label: string;
  /** Two-letter monogram used inline in the stage row. */
  monogram: string;
  status: StageStatus;
  /** Single-line headline — what this agent contributed. */
  detail: string | null;
};

function deriveStages(log: CycleLog, isLive: boolean): Stage[] {
  const memoryDone = log.kg !== null;
  const ocrDone = log.ocr !== null;
  const policyDone = log.confidence !== null;
  const interventionDone = log.hint !== null;
  const cycleFinished = log.finishedAt !== null;
  // Reasoning + Predictive run in parallel after OCR; we know they BOTH
  // resolved iff the policy event fired (orchestrator.ts emits `confidence`
  // only after Promise.allSettled([reasoning, predictive]) returns).
  const fanOutDone = policyDone;

  const liveCursor: StageId | null = !isLive
    ? null
    : !memoryDone
      ? "memory"
      : !ocrDone
        ? "ocr"
        : !fanOutDone
          ? "reasoning" // shows under both reasoning + predictive while we wait
          : !policyDone
            ? "policy"
            : !cycleFinished && !interventionDone
              ? "intervention"
              : null;

  const status = (id: StageId, complete: boolean): StageStatus => {
    if (complete) return "done";
    if (liveCursor === id) return "running";
    return cycleFinished ? "skipped" : "pending";
  };

  // Intervention is special — silent verdicts are 'skipped', not pending.
  const interventionStatus: StageStatus = interventionDone
    ? "done"
    : policyDone
      ? cycleFinished
        ? "skipped"
        : "running"
      : "pending";

  return [
    {
      id: "memory",
      label: "memory",
      monogram: "M",
      status: status("memory", memoryDone),
      detail: log.kg
        ? log.kg.hadProfile
          ? `${log.kg.claimCount} fact${log.kg.claimCount === 1 ? "" : "s"} · ${prettyError(log.kg.dominantError)}`
          : "cold start · no facts yet"
        : null,
    },
    {
      id: "ocr",
      label: "ocr",
      monogram: "O",
      status: status("ocr", ocrDone),
      detail: log.ocr
        ? `${(log.ocr.confidence * 100).toFixed(0)}% · ${prettyPageState(log.ocr.pageState)}`
        : null,
    },
    {
      id: "reasoning",
      label: "reasoning",
      monogram: "R",
      status: status("reasoning", fanOutDone),
      detail: fanOutDone && log.confidence
        ? prettyConfidence(log.confidence.level)
        : null,
    },
    {
      id: "predictive",
      label: "predictive",
      monogram: "P",
      status: status("predictive", fanOutDone),
      detail: fanOutDone
        ? log.hint?.predicted
          ? "flagged a likely error"
          : "no predicted error"
        : null,
    },
    {
      id: "policy",
      label: "policy",
      monogram: "Π",
      status: status("policy", policyDone),
      detail: log.confidence?.reason ?? null,
    },
    {
      id: "intervention",
      label: "intervention",
      monogram: "I",
      status: interventionStatus,
      detail: log.hint
        ? `${HINT_LABEL[log.hint.type]}${
            log.hint.severity ? ` · sev ${log.hint.severity}` : ""
          }`
        : policyDone && cycleFinished
          ? "silent — nothing to say"
          : null,
    },
  ];
}

const HINT_LABEL: Record<NonNullable<CycleLog["hint"]>["type"], string> = {
  error_callout: "error callout",
  scaffolding_question: "scaffolding ?",
  encouragement: "encouragement",
  redirect: "redirect",
  explanation: "explain (user asked)",
};

function prettyPageState(s: NonNullable<CycleLog["ocr"]>["pageState"]): string {
  switch (s) {
    case "fresh_problem":
      return "fresh problem";
    case "in_progress":
      return "in progress";
    case "near_complete":
      return "near complete";
    case "stalled_or_stuck":
      return "stuck";
  }
}

function prettyConfidence(l: NonNullable<CycleLog["confidence"]>["level"]): string {
  switch (l) {
    case "moss":
      return "looks fine";
    case "graphite":
      return "watching";
    case "sienna_soft":
      return "minor concern";
    case "sienna":
      return "real problem";
  }
}

/**
 * Best-effort label for the dominant_error string from the StruggleProfile.
 * The backend writes a small open vocabulary (sign_error, arithmetic_error,
 * concept_gap, …) — we humanize the common ones and fall back to a tidy
 * underscore-stripped form for anything else.
 */
function prettyError(err: string | null | undefined): string {
  if (!err) return "no dominant pattern";
  const map: Record<string, string> = {
    sign_error: "sign errors",
    arithmetic_error: "arithmetic slips",
    concept_gap: "concept gaps",
    skipped_step: "skipped steps",
    misread_problem: "misreads",
  };
  return map[err] ?? err.replace(/_/g, " ");
}

/**
 * Predicate names live in the DB as snake_case strings the extractors emit
 * (weak_at_topic, made_sign_error, …). For receipts we want a label the
 * demo audience can read at a glance; this drops the verb prefix and
 * spaces things out.
 */
function prettyPredicate(p: string): string {
  const map: Record<string, string> = {
    weak_at_topic: "weak at",
    strong_at_topic: "strong at",
    needs_review_on: "needs review",
    made_sign_error: "sign error",
    made_arithmetic_error: "arithmetic error",
    made_concept_gap: "concept gap",
    skipped_step: "skipped step",
    misread_problem: "misread",
    prefers_explanation_style: "prefers",
    mastered_topic: "mastered",
    ran_out_of_time: "time pressure",
    source_file_ingested: "ingested",
    teacher_is: "teacher",
    speaks_language: "speaks",
    essay_theme: "essay theme",
    essay_word_count: "essay length",
    scored_on_exam: "exam score",
  };
  return map[p] ?? p.replace(/_/g, " ");
}

// ─── component ────────────────────────────────────────────────────────────

export function AgentTrace({
  cycles,
  className,
}: {
  /** Most-recent-LAST. We reverse for display so newest is on top. */
  cycles: CycleLog[];
  className?: string;
}) {
  // Reverse without mutating; cap to last 12 so the panel stays readable.
  const ordered = useMemo(() => {
    const tail = cycles.slice(-12);
    return [...tail].reverse();
  }, [cycles]);

  // Derive aggregate session-level stats from what we've seen so far.
  const totals = useMemo(() => {
    const finished = cycles.filter((c) => c.finishedAt);
    const totalMs = finished.reduce((s, c) => s + (c.ms ?? 0), 0);
    const totalCost = finished.reduce((s, c) => s + (c.costUsd ?? 0), 0);
    const hintCount = cycles.filter((c) => c.hint).length;
    return {
      cycles: cycles.length,
      finished: finished.length,
      avgMs: finished.length ? Math.round(totalMs / finished.length) : 0,
      totalCost,
      hintCount,
    };
  }, [cycles]);

  const liveId = cycles.length > 0
    ? cycles[cycles.length - 1]!.finishedAt === null
      ? cycles[cycles.length - 1]!.id
      : null
    : null;

  return (
    <div className={["flex flex-col gap-5", className ?? ""].join(" ")}>
      {/* ── header ─────────────────────────────────────────────────── */}
      <div>
        <div className="section-label-light">orchestration · live</div>
        <h2
          className="text-ink-deep text-[20px] mt-1.5 leading-[1.05]"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
        >
          five agents, taking turns.
        </h2>
        <p
          className="mt-1.5 text-[12px] leading-relaxed text-paper-faint"
          style={{ fontFamily: "var(--font-display)" }}
        >
          ione watches, then five small models argue about what to do.{" "}
          {liveId ? "right now they're talking." : "they wait for a frame."}
        </p>
      </div>

      <SessionTotals totals={totals} live={Boolean(liveId)} />

      {/* ── empty state ────────────────────────────────────────────── */}
      {cycles.length === 0 && (
        <div
          className="text-paper-faint text-[12px] leading-relaxed select-none border-l border-dashed border-paper-faint/40 pl-3 py-1"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
        >
          waiting for the first frame. the moment a captured image
          lands, you'll see five agents take turns.
        </div>
      )}

      {/* ── cycle list ─────────────────────────────────────────────── */}
      <div className="flex flex-col">
        <AnimatePresence initial={false}>
          {ordered.map((cycle, i) => (
            <CycleRow
              key={cycle.id}
              cycle={cycle}
              isLive={cycle.id === liveId}
              isLatest={i === 0}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── session-totals strip ──────────────────────────────────────────────────

function SessionTotals({
  totals,
  live,
}: {
  totals: {
    cycles: number;
    finished: number;
    avgMs: number;
    totalCost: number;
    hintCount: number;
  };
  live: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-2 border-y border-line py-3">
      <Stat label="cycles" value={totals.cycles.toString()} live={live} />
      <Stat label="hints" value={totals.hintCount.toString()} />
      <Stat label="avg ms" value={totals.avgMs ? totals.avgMs.toString() : "—"} />
      <Stat
        label="total"
        value={`$${totals.totalCost.toFixed(4)}`}
        wide
      />
    </div>
  );
}

function Stat({
  label,
  value,
  live = false,
  wide = false,
}: {
  label: string;
  value: string;
  live?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-3" : "col-span-1"}>
      <div className="meta-label flex items-center gap-1.5">
        {live && (
          <motion.span
            className="inline-block w-1 h-1 rounded-full bg-red-pencil"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        {label}
      </div>
      <div
        className="text-ink-deep text-[15px] leading-tight mt-0.5"
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

// ─── per-cycle row ────────────────────────────────────────────────────────

function CycleRow({
  cycle,
  isLive,
  isLatest,
}: {
  cycle: CycleLog;
  isLive: boolean;
  isLatest: boolean;
}) {
  const stages = deriveStages(cycle, isLive);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={[
        "relative pl-4 pr-1 py-3 border-b border-line",
        isLatest ? "border-l border-l-red-pencil/40" : "",
      ].join(" ")}
    >
      {/* index + live marker */}
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <span
            className="text-paper-mute text-[10px] tracking-[0.18em] uppercase"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            cycle{" "}
            <span className="text-paper-faint">
              {String(cycle.index + 1).padStart(2, "0")}
            </span>
          </span>
          {isLive && (
            <motion.span
              className="text-[10px] tracking-[0.16em] uppercase text-red-pencil"
              style={{ fontFamily: "var(--font-mono)" }}
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 1.3, repeat: Infinity }}
            >
              · live
            </motion.span>
          )}
        </div>
        <div
          className="text-paper-faint text-[10px] tracking-[0.14em]"
          style={{
            fontFamily: "var(--font-mono)",
            fontFeatureSettings: "'tnum'",
          }}
        >
          {cycle.ms !== null ? `${cycle.ms}ms` : "…"}
          {cycle.costUsd !== null && (
            <>
              {" · "}${cycle.costUsd.toFixed(4)}
            </>
          )}
        </div>
      </div>

      {/* stage chain — five chips arranged horizontally */}
      <div className="flex items-stretch gap-0">
        {stages.map((stage, i) => (
          <StageChip
            key={stage.id}
            stage={stage}
            connector={i < stages.length - 1}
          />
        ))}
      </div>

      {/* receipts: derived facts from the agents that actually ran.
          These are the "agentic thought processes" plus the actual KG
          citations: every memory receipt points at the source file the
          claim was extracted from, every agent receipt points at the
          agent that produced it. */}
      {(cycle.kg || cycle.ocr || cycle.confidence || cycle.hint) && (
        <div className="mt-3 space-y-1.5 pl-1">
          {cycle.kg && cycle.kg.hadProfile && cycle.kg.patternSummary && (
            <Receipt
              from="memory"
              tone="brass"
              body={
                <span className="text-paper-faint">
                  recalls{" "}
                  <span className="text-ink-deep italic" style={{ fontFamily: "var(--font-display)" }}>
                    "{cycle.kg.patternSummary}"
                  </span>
                  {cycle.kg.frequency ? (
                    <span className="text-paper-faint"> · {cycle.kg.frequency}</span>
                  ) : null}
                </span>
              }
            />
          )}
          {cycle.kg && cycle.kg.references.length > 0 && (
            <KgReferenceList refs={cycle.kg.references} />
          )}
          {cycle.kg && !cycle.kg.hadProfile && (
            <Receipt
              from="memory"
              tone="paper-mute"
              body={
                <span className="text-paper-faint italic" style={{ fontFamily: "var(--font-display)" }}>
                  no prior facts about this student yet — running cold. upload
                  files in the dashboard to give the tutor longitudinal memory.
                </span>
              }
            />
          )}
          {cycle.ocr && <OcrReceipt ocr={cycle.ocr} />}
          {cycle.confidence && (
            <Receipt
              from="policy"
              tone={confidenceTone(cycle.confidence.level)}
              body={
                <span className="text-paper-faint">{cycle.confidence.reason}</span>
              }
            />
          )}
          {cycle.hint && (
            <Receipt
              from={
                cycle.hint.assistance === "explain"
                  ? "intervention · explain"
                  : "intervention"
              }
              tone={cycle.hint.type === "error_callout" ? "red-pencil" : "brass"}
              body={
                <span className="text-ink-deep">
                  {cycle.hint.predicted && (
                    <span className="text-brass">[predicted] </span>
                  )}
                  {cycle.hint.assistance === "explain" && (
                    <span
                      className="text-brass mr-1"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        letterSpacing: "0.06em",
                      }}
                    >
                      [user asked]
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontStyle: "italic",
                      whiteSpace:
                        cycle.hint.assistance === "explain"
                          ? "pre-wrap"
                          : "normal",
                    }}
                  >
                    "{cycle.hint.text}"
                  </span>
                </span>
              }
            />
          )}
        </div>
      )}
    </motion.div>
  );
}

function confidenceTone(
  level: NonNullable<CycleLog["confidence"]>["level"],
): "moss" | "paper-mute" | "rust" | "red-pencil" {
  switch (level) {
    case "moss":
      return "moss";
    case "graphite":
      return "paper-mute";
    case "sienna_soft":
      return "rust";
    case "sienna":
      return "red-pencil";
  }
}

// ─── stage chip ────────────────────────────────────────────────────────────

function StageChip({ stage, connector }: { stage: Stage; connector: boolean }) {
  // Color-encoded status:
  //   pending  → faint paper, no fill
  //   running  → red-pencil ring + pulse
  //   done     → ink-line border, paper monogram
  //   skipped  → dashed border, struck-through monogram
  const isPending = stage.status === "pending";
  const isRunning = stage.status === "running";
  const isDone = stage.status === "done";
  const isSkipped = stage.status === "skipped";

  return (
    <div className="flex items-center min-w-0 first:flex-initial flex-1">
      <div className="flex flex-col items-center min-w-0 flex-shrink-0">
        <motion.div
          animate={
            isRunning
              ? {
                  boxShadow: [
                    "0 0 0 0 rgba(196,48,43,0.0)",
                    "0 0 0 3px rgba(196,48,43,0.18)",
                    "0 0 0 0 rgba(196,48,43,0.0)",
                  ],
                }
              : {}
          }
          transition={
            isRunning ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : {}
          }
          className={[
            "w-7 h-7 grid place-items-center text-[12px]",
            "border",
            isRunning
              ? "border-red-pencil text-ink-deep bg-red-pencil/10"
              : isDone
                ? "border-line text-ink-deep bg-paper-tint"
                : isSkipped
                  ? "border-dashed border-paper-faint text-paper-faint bg-transparent"
                  : "border-line text-paper-mute bg-transparent",
          ].join(" ")}
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            borderRadius: "2px",
          }}
          aria-label={`${stage.label} — ${stage.status}`}
          title={`${stage.label} — ${stage.status}${stage.detail ? ` — ${stage.detail}` : ""}`}
        >
          {isSkipped ? (
            <span style={{ textDecoration: "line-through" }}>{stage.monogram}</span>
          ) : (
            stage.monogram
          )}
        </motion.div>
        <div
          className={[
            "mt-1 text-[8.5px] tracking-[0.16em] uppercase whitespace-nowrap",
            isPending
              ? "text-paper-faint/60"
              : isSkipped
                ? "text-paper-faint"
                : isRunning
                  ? "text-red-pencil"
                  : "text-paper-mute",
          ].join(" ")}
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {stage.label}
        </div>
      </div>

      {/* connector arrow */}
      {connector && (
        <div className="flex-1 px-1 self-start mt-3">
          <div
            className={[
              "h-px",
              isDone || isRunning ? "bg-paper-mute/60" : "bg-paper-faint/40",
            ].join(" ")}
          />
        </div>
      )}
    </div>
  );
}

// ─── receipt — one line, one author ────────────────────────────────────────

/**
 * A compact list of claim receipts pulled from the knowledge graph for
 * THIS cycle. Each row is `predicate · "object" · source.md` so the demo
 * audience can immediately see (a) what fact, (b) the value, (c) which
 * file it was extracted from. Long lists are clipped at 5 visible rows
 * with a "+N more" tail so the trace panel doesn't blow up.
 */
function KgReferenceList({ refs }: { refs: KgReference[] }) {
  const VISIBLE = 5;
  const shown = refs.slice(0, VISIBLE);
  const extra = refs.length - shown.length;
  return (
    <div className="flex items-start gap-2 text-[12.5px] leading-snug">
      <div
        className="self-stretch w-px shrink-0 mt-0.5 mb-0.5"
        style={{ backgroundColor: "var(--color-brass)", opacity: 0.55 }}
        aria-hidden
      />
      <span
        className="text-[9.5px] tracking-[0.18em] uppercase pt-0.5 shrink-0"
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--color-brass)",
          opacity: 0.85,
        }}
      >
        kg
      </span>
      <ul className="min-w-0 flex flex-col gap-0.5">
        {shown.map((ref, i) => (
          <li
            key={`${ref.predicate}-${i}`}
            className="text-paper-faint text-[11.5px] leading-snug truncate"
            style={{ fontFamily: "var(--font-display)" }}
            title={`${ref.predicate} · ${ref.object_label}${ref.source_filename ? ` · ${ref.source_filename}` : ""}`}
          >
            <span className="text-paper-mute">{prettyPredicate(ref.predicate)}</span>
            {ref.object_label ? (
              <>
                {" "}
                <span className="text-ink-deep italic">"{ref.object_label}"</span>
              </>
            ) : null}
            {ref.source_filename ? (
              <span
                className="text-brass/80 ml-1"
                style={{ fontFamily: "var(--font-mono)", fontSize: "10px" }}
              >
                · {ref.source_filename}
              </span>
            ) : null}
          </li>
        ))}
        {extra > 0 && (
          <li
            className="text-paper-faint/70 text-[10.5px] tracking-[0.04em] italic"
            style={{ fontFamily: "var(--font-display)" }}
          >
            + {extra} more fact{extra === 1 ? "" : "s"} indexed for this cycle
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * OCR receipt — shows the full chain of equations the OCR pipeline read,
 * not just the single step Sonnet flagged as "current". This is what
 * actually proves to a demo audience that ione "saw the whole page" —
 * if you wrote out 5 lines and the trace only shows 1, that's a UX bug,
 * not the model failing.
 *
 * Layout:
 *   ─ ocr  read        (1 line, completed step #1)        · 12.3% conf
 *                      (1 line, completed step #2)
 *                      (1 line, current step — bold)
 *                      ▸ raw mathpix transcription (collapsed by default)
 *
 * Long completed-step lists are clipped at 4 visible rows with a "+N
 * earlier steps" tail so the panel stays readable.
 */
function OcrReceipt({ ocr }: { ocr: NonNullable<CycleLog["ocr"]> }) {
  const VISIBLE_PRIOR = 4;
  const completed = ocr.completedStepsLatex ?? [];
  const shownCompleted = completed.slice(-VISIBLE_PRIOR);
  const hidden = completed.length - shownCompleted.length;

  // If neither Sonnet nor Mathpix lifted any LaTeX off the page, don't
  // render an empty receipt — the trace already shows OCR confidence in
  // the stage chip above.
  const hasAnything =
    ocr.currentStepLatex || completed.length > 0 || ocr.mathpixLatex;
  if (!hasAnything) return null;

  return (
    <div className="flex items-start gap-2 text-[12.5px] leading-snug">
      <div
        className="self-stretch w-px shrink-0 mt-0.5 mb-0.5"
        style={{ backgroundColor: "var(--color-paper-mute)", opacity: 0.7 }}
        aria-hidden
      />
      <span
        className="text-[9.5px] tracking-[0.18em] uppercase pt-0.5 shrink-0"
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--color-paper-mute)",
          opacity: 0.85,
        }}
      >
        ocr
      </span>
      <div className="min-w-0 flex flex-col gap-0.5">
        <span
          className="text-paper-faint text-[10px] tracking-[0.06em]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          read{" "}
          <span className="text-paper-mute">
            {completed.length + (ocr.currentStepLatex ? 1 : 0)} line
            {completed.length + (ocr.currentStepLatex ? 1 : 0) === 1 ? "" : "s"}
          </span>
          {ocr.mathpixConfidence !== null && (
            <span className="text-paper-faint">
              {" · "}
              {(ocr.mathpixConfidence * 100).toFixed(0)}% mathpix
            </span>
          )}
        </span>

        {hidden > 0 && (
          <div
            className="text-paper-faint/70 text-[10.5px] italic"
            style={{ fontFamily: "var(--font-display)" }}
          >
            … {hidden} earlier step{hidden === 1 ? "" : "s"}
          </div>
        )}

        {shownCompleted.map((step, i) => (
          <div
            key={`prior-${i}`}
            className="text-paper-mute min-w-0 break-words"
            title={step}
          >
            <KaTeXMath tex={step} />
          </div>
        ))}

        {ocr.currentStepLatex && (
          <div
            className="text-ink-deep min-w-0 break-words"
            title={ocr.currentStepLatex}
          >
            <KaTeXMath tex={ocr.currentStepLatex} />
            <span
              className="ml-2 text-[9px] tracking-[0.16em] uppercase text-red-pencil/70"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              · current
            </span>
          </div>
        )}

        {/* Mathpix raw transcription — only show if it has content that
            Sonnet's structured output didn't capture. This is the
            "raw OCR" receipt — proves ione actually saw the page. */}
        {ocr.mathpixLatex &&
          ocr.mathpixLatex.trim() &&
          ocr.mathpixLatex !== ocr.currentStepLatex && (
            <details className="mt-1 group">
              <summary
                className="text-paper-faint/80 text-[10px] tracking-[0.14em] uppercase cursor-pointer hover:text-paper-mute transition-colors select-none"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                ▸ raw mathpix transcription
              </summary>
              <div
                className="mt-1.5 pl-2 border-l border-line/60 text-paper-mute text-[11px] leading-relaxed whitespace-pre-wrap break-words"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10.5px",
                }}
              >
                {ocr.mathpixLatex}
              </div>
            </details>
          )}
      </div>
    </div>
  );
}

function Receipt({
  from,
  tone,
  body,
}: {
  from: string;
  tone: "moss" | "paper-mute" | "rust" | "red-pencil" | "brass";
  body: React.ReactNode;
}) {
  const stripeColor =
    tone === "moss"
      ? "var(--color-moss)"
      : tone === "rust"
        ? "var(--color-rust)"
        : tone === "red-pencil"
          ? "var(--color-red-pencil)"
          : tone === "brass"
            ? "var(--color-brass)"
            : "var(--color-paper-mute)";

  return (
    <div className="flex items-start gap-2 text-[12.5px] leading-snug">
      <div
        className="self-stretch w-px shrink-0 mt-0.5 mb-0.5"
        style={{ backgroundColor: stripeColor, opacity: 0.7 }}
        aria-hidden
      />
      <span
        className="text-paper-faint text-[9.5px] tracking-[0.18em] uppercase pt-0.5 shrink-0"
        style={{ fontFamily: "var(--font-mono)", color: stripeColor, opacity: 0.85 }}
      >
        {from}
      </span>
      <span className="min-w-0 break-words">{body}</span>
    </div>
  );
}
