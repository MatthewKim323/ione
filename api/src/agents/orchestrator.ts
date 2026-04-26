/**
 * Orchestrator — the per-cycle agent pipeline.
 *
 *   OCR → (Reasoning ∥ Predictive) → Policy → (Intervention?)
 *
 * Stateless module. Takes everything the routes/cycle.ts handler hands it
 * (session row, frame, trajectory, recent hints, struggle profile) and
 * returns an ordered list of `CycleEvent`s plus a `persist` payload so the
 * route can write tutor_cycles + tutor_hints + cost rollups.
 *
 * Key invariants:
 *   1. We never throw on a malformed agent response — caught upstream and
 *      surfaced as `{type: "error"}` so the UI stays responsive.
 *   2. Predictive runs IN PARALLEL with Reasoning (fan-out, then policy
 *      collects both). This is the demo-critical latency optimization.
 *   3. The canonical solution is computed once per session and reused —
 *      route caches it on `tutor_sessions.canonical_solution_json`.
 *   4. If OCR reports is_blank_page=true, we short-circuit before paying
 *      for any other agent calls. Just emit a graphite confidence ribbon.
 */

import { runOcrAgent } from "./ocr.js";
import {
  canonicalSolution as generateCanonicalSolution,
  evaluateStudent,
} from "./reasoning.js";
import {
  runPredictiveAgent,
  DEFAULT_PREDICTIVE_THRESHOLD,
} from "./predictive.js";
import { runInterventionAgent } from "./intervention.js";
import {
  decidePolicy,
  isDuplicateHint,
  ribbonForVerdict,
  DEFAULT_COOLDOWN_MS,
} from "./policy.js";
import type {
  CanonicalSolution,
  OcrOutput,
  ReasoningOutput,
  PredictiveOutput,
  InterventionOutput,
  TrajectoryFrame,
  StruggleProfile,
} from "./types.js";
import { deriveConfidenceLevel } from "./types.js";
import type { CycleEvent } from "../lib/sse.js";
import { CycleCost } from "../lib/cost.js";
import { logger } from "../lib/logger.js";
import { isAppError } from "../lib/errors.js";

export type OrchestratorInput = {
  /** WebP image, base64-encoded (no data: prefix). */
  frameWebpBase64: string;
  /** Server-issued cycle id; reused for the SSE `done` event + persistence. */
  cycleId: string;
  /** Existing session row context. */
  session: {
    id: string;
    user_id: string;
    canonical_solution: CanonicalSolution | null;
    problem_text: string | null;
    /**
     * Optional rehearsed-problem identifier. Used by Phase 5 / R4 so demo_mode
     * only lowers the predictive threshold for `demo_neg3_distrib` and not for
     * arbitrary problems a presenter happens to switch to mid-demo.
     */
    problem_id: string | null;
    demo_mode: boolean;
    started_at_ms: number;
  };
  /** Capture-side telemetry. */
  isStalled: boolean;
  secondsSinceLastChange: number;
  /** Last 5 frames per the stateless API contract. */
  trajectory: TrajectoryFrame[];
  /** Hints surfaced earlier in this session (oldest → newest). */
  recentHints: { text: string; createdAt: number }[];
  /** Phase 3 will load a real profile; Phase 1 passes null. */
  struggleProfile: StruggleProfile | null;
};

export type OrchestratorPersist = {
  cycle: {
    cycle_id: string;
    diff_pct: number | null;
    is_stalled: boolean;
    seconds_since_last_change: number;

    ocr_problem_text: string | null;
    ocr_current_step_latex: string | null;
    ocr_completed_steps_latex: string[];
    ocr_page_state: OcrOutput["page_state"] | null;
    ocr_confidence: number | null;
    ocr_is_blank: boolean;
    mathpix_latex: string | null;
    mathpix_confidence: number | null;

    step_status: ReasoningOutput["step_status"] | null;
    error_type: ReasoningOutput["error_type"];
    error_location: string | null;
    severity: number | null;
    what_they_should_do_next: string | null;
    scaffolding_question: string | null;
    matches_known_error_pattern: boolean | null;

    predicted_error_type: string | null;
    predicted_error_basis: string | null;
    predicted_confidence: number | null;
    predicted_recommend_intervene: boolean | null;

    spoke: boolean;
    suppression_reason: string | null;

    cost_usd: number;
    latency_ms: number;
    tokens_input: number;
    tokens_output: number;

    ocr_json: unknown;
    reasoning_json: unknown;
    predictive_json: unknown;
    intervention_json: unknown;
  };
  hint: null | {
    hint_type: NonNullable<InterventionOutput["hint_type"]>;
    text: string;
    predicted: boolean;
    severity: number | null;
    reasoning_for_decision: string;
  };
  /** Updated canonical solution to cache on the session row (first cycle only). */
  canonicalToCache: CanonicalSolution | null;
};

export type OrchestratorResult = {
  events: CycleEvent[];
  persist: OrchestratorPersist;
};

export async function runCycle(
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  const t0 = performance.now();
  const cost = new CycleCost();
  const events: CycleEvent[] = [];

  // ── Step 1: OCR ────────────────────────────────────────────────────────
  const ocrResult = await runOcrAgent({
    frameWebpBase64: input.frameWebpBase64,
    cost,
  });
  const ocr = ocrResult.output;

  events.push({
    type: "ocr",
    problem_text: ocr.problem_text,
    current_step_latex: ocr.current_step_latex,
    confidence: ocr.confidence,
    page_state: ocr.page_state,
  });

  // Short-circuit on blank pages — keep the ribbon graphite, no agents pay.
  if (ocr.is_blank_page) {
    events.push({
      type: "confidence",
      level: "graphite",
      reason: "blank page — waiting for the student",
    });
    events.push({
      type: "done",
      cycle_id: input.cycleId,
      cost_usd: cost.total(),
      ms: Math.round(performance.now() - t0),
    });
    return {
      events,
      persist: blankPersist({
        cycleId: input.cycleId,
        ocrResult,
        cost,
        ocr,
        latencyMs: Math.round(performance.now() - t0),
        isStalled: input.isStalled,
        secondsSinceLastChange: input.secondsSinceLastChange,
      }),
    };
  }

  // ── Step 2: Canonical solution (once per session) ─────────────────────
  const problemText = input.session.problem_text ?? ocr.problem_text;
  let canonical: CanonicalSolution | null = input.session.canonical_solution;
  let canonicalToCache: CanonicalSolution | null = null;

  if (!canonical && problemText) {
    try {
      const { solution } = await generateCanonicalSolution({
        problemText,
        cost,
      });
      canonical = solution;
      canonicalToCache = solution;
    } catch (e) {
      logger.warn(
        { err: errMsg(e), session: input.session.id },
        "canonical generation failed — continuing with no canonical",
      );
    }
  }

  // If we still have no canonical (no problem text or the call failed),
  // we cannot evaluate. Emit graphite + done.
  if (!canonical || !problemText) {
    const reason = !problemText
      ? "still reading the problem"
      : "couldn't build canonical — retrying next cycle";
    events.push({ type: "confidence", level: "graphite", reason });
    events.push({
      type: "done",
      cycle_id: input.cycleId,
      cost_usd: cost.total(),
      ms: Math.round(performance.now() - t0),
    });
    return {
      events,
      persist: noCanonicalPersist({
        cycleId: input.cycleId,
        ocrResult,
        cost,
        ocr,
        canonicalToCache,
        latencyMs: Math.round(performance.now() - t0),
        isStalled: input.isStalled,
        secondsSinceLastChange: input.secondsSinceLastChange,
      }),
    };
  }

  // ── Step 3: Reasoning ∥ Predictive (fan-out) ───────────────────────────
  const timeOnProblemSeconds = Math.round(
    (Date.now() - input.session.started_at_ms) / 1000,
  );
  // Phase 5 / R4: demo_mode alone is not enough to lower the threshold.
  // Only the rehearsed seed problem (`demo_neg3_distrib`) gets the relaxed
  // 0.5 floor — otherwise demo presenters could accidentally trigger
  // hair-trigger interventions on unrelated problems they switch to mid-demo.
  const isRehearsedDemoProblem =
    input.session.demo_mode && input.session.problem_id === "demo_neg3_distrib";
  const predictiveThreshold = isRehearsedDemoProblem
    ? 0.5
    : DEFAULT_PREDICTIVE_THRESHOLD;

  const [reasoningSettled, predictiveSettled] = await Promise.allSettled([
    evaluateStudent({
      problemText,
      canonical,
      ocr,
      isStalled: input.isStalled,
      cost,
    }),
    runPredictiveAgent(
      {
        problemText,
        canonical,
        struggleProfile: input.struggleProfile,
        trajectory: input.trajectory,
        timeOnProblemSeconds,
        cost,
      },
      { threshold: predictiveThreshold },
    ),
  ]);

  let reasoning: ReasoningOutput | null = null;
  let reasoningRaw = "";
  if (reasoningSettled.status === "fulfilled") {
    reasoning = reasoningSettled.value.output;
    reasoningRaw = reasoningSettled.value.raw;
  } else {
    logger.warn(
      { err: errMsg(reasoningSettled.reason), cycle: input.cycleId },
      "reasoning agent rejected — continuing without it",
    );
  }

  let predictive: PredictiveOutput | null = null;
  let predictiveRaw = "";
  if (predictiveSettled.status === "fulfilled") {
    predictive = predictiveSettled.value.output;
    predictiveRaw = predictiveSettled.value.raw;
  } else {
    logger.warn(
      { err: errMsg(predictiveSettled.reason), cycle: input.cycleId },
      "predictive agent rejected — continuing without it",
    );
  }

  // ── Step 4: Policy gate ────────────────────────────────────────────────
  const cooldownMs = computeCooldownMs(input.recentHints);
  const verdict = decidePolicy({
    reasoning,
    predictive,
    recentHints: input.recentHints,
    isStalled: input.isStalled,
    cooldownMs,
    predictiveThreshold,
  });

  // Always emit a confidence event derived from the policy verdict.
  events.push({
    type: "confidence",
    level: ribbonForVerdict(verdict, reasoning, predictive),
    reason: verdict.reason,
  });

  // ── Step 5: Intervention (only if policy says speak) ───────────────────
  let intervention: InterventionOutput | null = null;
  let interventionRaw = "";
  let suppressionReason: string | null = verdict.kind === "silent" ? verdict.reason : null;
  let spoke = false;
  let surfacedHint: OrchestratorPersist["hint"] = null;

  if (verdict.kind !== "silent" && reasoning) {
    try {
      const r = await runInterventionAgent({
        reasoning,
        recentHints: input.recentHints.map((h) => h.text),
        cooldownActive: cooldownMs >= 0 && cooldownMs < DEFAULT_COOLDOWN_MS,
        isStalled: input.isStalled,
        struggleProfile: input.struggleProfile,
        cost,
      });
      intervention = r.output;
      interventionRaw = r.raw;
    } catch (e) {
      logger.warn(
        { err: errMsg(e), cycle: input.cycleId },
        "intervention agent failed — staying silent",
      );
      suppressionReason = "intervention_error";
    }

    if (
      intervention &&
      intervention.should_speak &&
      intervention.hint_text &&
      intervention.hint_type
    ) {
      const dup = isDuplicateHint(intervention.hint_text, input.recentHints);
      if (dup) {
        suppressionReason = "duplicate";
      } else {
        spoke = true;
        const predicted = verdict.kind === "speak_predictive";
        const severity = reasoning.severity ?? null;
        events.push({
          type: "hint",
          id: input.cycleId,
          text: intervention.hint_text,
          hint_type: intervention.hint_type,
          audio_url: null, // Phase 2 / E7 wires the audio passthrough
          predicted,
          severity: severity as 1 | 2 | 3 | 4 | 5 | undefined,
        });
        surfacedHint = {
          hint_type: intervention.hint_type,
          text: intervention.hint_text,
          predicted,
          severity,
          reasoning_for_decision: intervention.reasoning_for_decision,
        };
      }
    } else if (intervention && !intervention.should_speak) {
      suppressionReason = "intervention_silent";
    }
  }

  // ── Step 6: Done ────────────────────────────────────────────────────────
  const ms = Math.round(performance.now() - t0);
  events.push({
    type: "done",
    cycle_id: input.cycleId,
    cost_usd: cost.total(),
    ms,
  });

  // ── persistence payload ────────────────────────────────────────────────
  return {
    events,
    persist: {
      cycle: {
        cycle_id: input.cycleId,
        diff_pct: null,
        is_stalled: input.isStalled,
        seconds_since_last_change: input.secondsSinceLastChange,

        ocr_problem_text: ocr.problem_text,
        ocr_current_step_latex: ocr.current_step_latex,
        ocr_completed_steps_latex: ocr.completed_steps_latex,
        ocr_page_state: ocr.page_state,
        ocr_confidence: ocr.confidence,
        ocr_is_blank: ocr.is_blank_page,
        mathpix_latex: ocrResult.mathpix.latex,
        mathpix_confidence: ocrResult.mathpix.confidence,

        step_status: reasoning?.step_status ?? null,
        error_type: reasoning?.error_type ?? null,
        error_location: reasoning?.error_location ?? null,
        severity: reasoning?.severity ?? null,
        what_they_should_do_next: reasoning?.what_they_should_do_next ?? null,
        scaffolding_question: reasoning?.scaffolding_question ?? null,
        matches_known_error_pattern:
          reasoning?.matches_known_error_pattern ?? null,

        predicted_error_type: predictive?.predicted_error.type ?? null,
        predicted_error_basis: predictive?.predicted_error.basis ?? null,
        predicted_confidence: predictive?.predicted_error.confidence ?? null,
        predicted_recommend_intervene:
          predictive?.recommend_intervene ?? null,

        spoke,
        suppression_reason: suppressionReason,

        cost_usd: cost.total(),
        latency_ms: ms,
        tokens_input: ocrResult.sonnet.input_tokens,
        tokens_output: ocrResult.sonnet.output_tokens,

        ocr_json: { ...ocr, raw_sonnet: ocrResult.sonnet.raw },
        reasoning_json: reasoning
          ? { ...reasoning, raw_sonnet: reasoningRaw }
          : { error: "reasoning_failed" },
        predictive_json: predictive
          ? { ...predictive, raw_sonnet: predictiveRaw }
          : { skipped: true },
        intervention_json: intervention
          ? { ...intervention, raw_sonnet: interventionRaw }
          : { ran: false, verdict },
      },
      hint: surfacedHint,
      canonicalToCache,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// helpers

function errMsg(e: unknown): string {
  if (isAppError(e)) return `${e.code}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * Cooldown = ms since the most recent hint. Used by policy + the LLM-side
 * cooldownActive flag passed into the intervention agent.
 */
function computeCooldownMs(
  recent: { text: string; createdAt: number }[],
): number {
  if (!recent.length) return Number.MAX_SAFE_INTEGER;
  const latest = recent[recent.length - 1]!;
  return Math.max(0, Date.now() - latest.createdAt);
}

function blankPersist(opts: {
  cycleId: string;
  ocrResult: Awaited<ReturnType<typeof runOcrAgent>>;
  cost: CycleCost;
  ocr: OcrOutput;
  latencyMs: number;
  isStalled: boolean;
  secondsSinceLastChange: number;
}): OrchestratorPersist {
  return {
    cycle: {
      cycle_id: opts.cycleId,
      diff_pct: null,
      is_stalled: opts.isStalled,
      seconds_since_last_change: opts.secondsSinceLastChange,
      ocr_problem_text: opts.ocr.problem_text,
      ocr_current_step_latex: null,
      ocr_completed_steps_latex: [],
      ocr_page_state: opts.ocr.page_state,
      ocr_confidence: opts.ocr.confidence,
      ocr_is_blank: true,
      mathpix_latex: opts.ocrResult.mathpix.latex,
      mathpix_confidence: opts.ocrResult.mathpix.confidence,
      step_status: null,
      error_type: null,
      error_location: null,
      severity: null,
      what_they_should_do_next: null,
      scaffolding_question: null,
      matches_known_error_pattern: null,
      predicted_error_type: null,
      predicted_error_basis: null,
      predicted_confidence: null,
      predicted_recommend_intervene: null,
      spoke: false,
      suppression_reason: "blank_page",
      cost_usd: opts.cost.total(),
      latency_ms: opts.latencyMs,
      tokens_input: opts.ocrResult.sonnet.input_tokens,
      tokens_output: opts.ocrResult.sonnet.output_tokens,
      ocr_json: { ...opts.ocr, raw_sonnet: opts.ocrResult.sonnet.raw },
      reasoning_json: { skipped: true, reason: "blank_page" },
      predictive_json: { skipped: true, reason: "blank_page" },
      intervention_json: { ran: false, reason: "blank_page" },
    },
    hint: null,
    canonicalToCache: null,
  };
}

function noCanonicalPersist(opts: {
  cycleId: string;
  ocrResult: Awaited<ReturnType<typeof runOcrAgent>>;
  cost: CycleCost;
  ocr: OcrOutput;
  canonicalToCache: CanonicalSolution | null;
  latencyMs: number;
  isStalled: boolean;
  secondsSinceLastChange: number;
}): OrchestratorPersist {
  return {
    cycle: {
      cycle_id: opts.cycleId,
      diff_pct: null,
      is_stalled: opts.isStalled,
      seconds_since_last_change: opts.secondsSinceLastChange,
      ocr_problem_text: opts.ocr.problem_text,
      ocr_current_step_latex: opts.ocr.current_step_latex,
      ocr_completed_steps_latex: opts.ocr.completed_steps_latex,
      ocr_page_state: opts.ocr.page_state,
      ocr_confidence: opts.ocr.confidence,
      ocr_is_blank: false,
      mathpix_latex: opts.ocrResult.mathpix.latex,
      mathpix_confidence: opts.ocrResult.mathpix.confidence,
      step_status: null,
      error_type: null,
      error_location: null,
      severity: null,
      what_they_should_do_next: null,
      scaffolding_question: null,
      matches_known_error_pattern: null,
      predicted_error_type: null,
      predicted_error_basis: null,
      predicted_confidence: null,
      predicted_recommend_intervene: null,
      spoke: false,
      suppression_reason: "no_canonical_yet",
      cost_usd: opts.cost.total(),
      latency_ms: opts.latencyMs,
      tokens_input: opts.ocrResult.sonnet.input_tokens,
      tokens_output: opts.ocrResult.sonnet.output_tokens,
      ocr_json: { ...opts.ocr, raw_sonnet: opts.ocrResult.sonnet.raw },
      reasoning_json: { skipped: true, reason: "no_canonical" },
      predictive_json: { skipped: true, reason: "no_canonical" },
      intervention_json: { ran: false, reason: "no_canonical" },
    },
    hint: null,
    canonicalToCache: opts.canonicalToCache,
  };
}

// Eslint sanity — keep the `deriveConfidenceLevel` import alive for callers
// that want raw status→ribbon mapping outside the orchestrator (UI tests
// reuse it).
export { deriveConfidenceLevel };
