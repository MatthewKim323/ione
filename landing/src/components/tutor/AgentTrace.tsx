import { useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Math as KaTeXMath } from "../design/Math";
import type { CycleEvent } from "../../lib/tutor/cycleClient";

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
 * The events the wire actually carries are { ocr, confidence, hint, done },
 * and that's enough to reconstruct the full chain because each event has a
 * forced-after-its-stage emit point in orchestrator.ts. Reading order:
 *
 *   • `ocr` arrives  → OCR done, has confidence/page_state
 *   • `confidence` arrives → Reasoning + Predictive + Policy all complete
 *   • `hint` arrives  → Intervention also fired and produced a hint
 *   • `done` arrives  → cycle finished, has total_ms + total_cost
 *
 * If `hint` never arrived but `confidence` did, Intervention was *skipped*
 * (policy decided silence) — we show that as "— silent" with the policy
 * reason, which is exactly how the hand-pencil ribbon decides.
 */

export type CycleLog = {
  /** Index in the session, monotonic from 0. */
  index: number;
  /** Cycle id once `done` lands; until then a synthetic `pending-<idx>`. */
  id: string;
  startedAt: number;
  finishedAt: number | null;
  /** Per-stage outputs we plucked from CycleEvents. Null = not seen yet. */
  ocr:
    | {
        confidence: number;
        pageState: "fresh_problem" | "in_progress" | "near_complete" | "stalled_or_stuck";
        currentStepLatex: string | null;
        problemText: string | null;
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
        type: "error_callout" | "scaffolding_question" | "encouragement" | "redirect";
        predicted: boolean;
        severity?: 1 | 2 | 3 | 4 | 5;
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
    case "ocr":
      return {
        ...prev,
        ocr: {
          confidence: evt.confidence,
          pageState: evt.page_state,
          currentStepLatex: evt.current_step_latex,
          problemText: evt.problem_text,
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
    ocr: null,
    confidence: null,
    hint: null,
    costUsd: null,
    ms: null,
  };
}

// ─── stage status derivation ──────────────────────────────────────────────

type StageId =
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
          These are the "agentic thought processes" and the closest thing the
          per-cycle stream has to KG citations: each line points at the agent
          that produced it. */}
      {(cycle.ocr || cycle.confidence || cycle.hint) && (
        <div className="mt-3 space-y-1.5 pl-1">
          {cycle.ocr?.currentStepLatex && (
            <Receipt
              from="ocr"
              tone="paper-mute"
              body={
                <span className="text-paper-faint">
                  read{" "}
                  <span className="text-ink-deep">
                    <KaTeXMath tex={cycle.ocr.currentStepLatex} />
                  </span>
                </span>
              }
            />
          )}
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
              from="intervention"
              tone={cycle.hint.type === "error_callout" ? "red-pencil" : "brass"}
              body={
                <span className="text-ink-deep">
                  {cycle.hint.predicted && (
                    <span className="text-brass">[predicted] </span>
                  )}
                  <span style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}>
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
