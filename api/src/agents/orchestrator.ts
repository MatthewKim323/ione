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
import { cacheHintForAudio } from "../lib/hintCache.js";
import { elevenLabsConfigured } from "../integrations/elevenlabs.js";
import { env } from "../env.js";

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
  /**
   * Marks the cycle as student-initiated rather than from the autonomous
   * capture loop. Both modes:
   *   - bypass the policy gate (always speak)
   *   - bypass the cooldown (the user asked, this isn't ione nagging)
   *   - bypass the duplicate-hint check (a fuller walkthrough is the
   *     entire point of asking again)
   *   - swap the intervention agent into walkthrough mode (drops the
   *     Socratic rule, walks through the actual method)
   *
   *   - "explain" — pressed the "I need help" button on /tutor.
   *   - "voice"   — held push-to-talk and asked a verbal question; the
   *                 transcribed text is also passed via `studentQuestion`.
   *
   * Tagged on the emitted hint event as `assistance: "explain" | "voice"`
   * so the UI can render it distinctly (badges, the student's question
   * shown above the answer, etc).
   */
  assistanceMode?: "explain" | "voice";
  /**
   * Verbatim transcript of the student's spoken question — only set when
   * `assistanceMode === "voice"`. Threaded into the intervention agent's
   * user payload so the answer actually addresses what was asked, and
   * surfaced on the SSE hint event so the AgentTrace + HintCard can show
   * "you asked: '...'" above the answer.
   */
  studentQuestion?: string;
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

  // ── Step 0: voice transcript (push-to-talk) ───────────────────────────
  // Surface the student's question BEFORE any agent runs so the trace shows
  // "voice asked: '...'" as the first thing the audience sees, before OCR
  // starts. Only emitted when the cycle was triggered by push-to-talk.
  const isVoiceMode =
    input.assistanceMode === "voice" &&
    typeof input.studentQuestion === "string" &&
    input.studentQuestion.trim().length > 0;
  if (isVoiceMode) {
    events.push({
      type: "voice_question",
      text: input.studentQuestion!.trim(),
      language_code: null,
      duration_sec: null,
    });
  }

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
    completed_steps_latex: ocr.completed_steps_latex,
    mathpix_latex: ocrResult.mathpix.latex,
    mathpix_confidence: ocrResult.mathpix.confidence,
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
  // problem_text resolution. Three layers:
  //   1. session.problem_text — set explicitly by /api/sessions for rehearsed demos.
  //   2. ocr.problem_text     — Sonnet pulled it off the page.
  //   3. synthesized          — student is doing freestyle derivative practice
  //      with no explicit prompt (just `y = 3x², dy/dx = ...` pairs). Without
  //      this fallback the orchestrator bails with "still reading the
  //      problem" and reasoning never runs, so the page silently goes
  //      unflagged. Symptom in the wild: writing four wrong derivatives in a
  //      row and ione never speaks. We detect derivative-pair patterns in
  //      completed_steps + current_step and synthesize a generic prompt so
  //      canonical generation + the evaluator can both run.
  const synthesized = !input.session.problem_text && !ocr.problem_text;
  const problemText =
    input.session.problem_text ??
    ocr.problem_text ??
    synthesizeProblemTextFromOcr(ocr);
  // When we're on a synthesized derivative-practice page we DON'T reuse
  // the cached canonical — the student may add a new `y = ...` line on
  // any cycle, and a stale canonical for problem #1 confuses the
  // evaluator when they're now working on problem #3. Canonical
  // generation costs one Sonnet call (~$0.01) and avoids that whole
  // category of stale-context bug. For real session-scoped problems
  // (problem_text set explicitly), we keep the cache hot.
  let canonical: CanonicalSolution | null = synthesized
    ? null
    : input.session.canonical_solution;
  let canonicalToCache: CanonicalSolution | null = null;

  if (!canonical && problemText) {
    try {
      const { solution } = await generateCanonicalSolution({
        problemText,
        cost,
      });
      canonical = solution;
      // Only cache real problem canonicals. Synthesized ones change
      // shape every cycle and would just bloat the session row.
      if (!synthesized) canonicalToCache = solution;
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
  // Override-able cooldown window. Production: 60s (don't be Clippy). Demo
  // recordings: 0 via POLICY_COOLDOWN_MS=0 in .env.local. See env.ts.
  const cooldownWindowMs = env.POLICY_COOLDOWN_MS;
  const isExplainMode = input.assistanceMode === "explain";
  // Voice questions and explicit "I need help" share the same bypass path
  // (always speak, ignore cooldown/dedup, walkthrough mode). The only
  // diffs are (a) we feed the spoken question into the intervention
  // prompt so the answer actually addresses it, and (b) the surfaced
  // hint event is tagged "voice" instead of "explain".
  const isAssistedMode = isExplainMode || isVoiceMode;
  const verdict = decidePolicy({
    reasoning,
    predictive,
    recentHints: input.recentHints,
    isStalled: input.isStalled,
    cooldownMs,
    cooldownWindowMs,
    predictiveThreshold,
  });

  // Always emit a confidence event derived from the policy verdict.
  // Assisted modes still surface a ribbon — the user pressed help / asked
  // a question, and the trace should still show what the agents
  // collectively thought before the walkthrough.
  events.push({
    type: "confidence",
    level: ribbonForVerdict(verdict, reasoning, predictive),
    reason: isVoiceMode
      ? "answering the student's question"
      : isExplainMode
        ? "user requested help — explaining the next step"
        : verdict.reason,
  });

  // ── Step 5: Intervention ────────────────────────────────────────────────
  // Two paths:
  //   1. Autonomous loop: only run if policy says speak, dedup, and
  //      respect the cooldown.
  //   2. Assisted (explain | voice): ALWAYS run, ignore policy/cooldown/
  //      dedup. The student asked — we owe them a teach.
  let intervention: InterventionOutput | null = null;
  let interventionRaw = "";
  let suppressionReason: string | null = isAssistedMode
    ? null
    : verdict.kind === "silent"
      ? verdict.reason
      : null;
  let spoke = false;
  let surfacedHint: OrchestratorPersist["hint"] = null;

  const shouldRunIntervention =
    reasoning && (isAssistedMode || verdict.kind !== "silent");

  if (shouldRunIntervention) {
    try {
      const r = await runInterventionAgent({
        reasoning: reasoning!,
        recentHints: input.recentHints.map((h) => h.text),
        cooldownActive:
          !isAssistedMode && cooldownMs >= 0 && cooldownMs < cooldownWindowMs,
        isStalled: input.isStalled,
        struggleProfile: input.struggleProfile,
        cost,
        assistanceMode: isAssistedMode
          ? isVoiceMode
            ? "voice"
            : "explain"
          : undefined,
        studentQuestion: isVoiceMode ? input.studentQuestion : undefined,
      });
      intervention = r.output;
      interventionRaw = r.raw;
    } catch (e) {
      logger.warn(
        {
          err: errMsg(e),
          cycle: input.cycleId,
          explain: isExplainMode,
          voice: isVoiceMode,
        },
        "intervention agent failed — staying silent",
      );
      suppressionReason = isVoiceMode
        ? "voice_error"
        : isExplainMode
          ? "explain_error"
          : "intervention_error";
    }

    if (
      intervention &&
      intervention.should_speak &&
      intervention.hint_text &&
      intervention.hint_type
    ) {
      // Dedup applies only to autonomous hints. In assisted modes, the
      // student already heard the dedup'd hint and still couldn't move
      // — repeating with a fuller walkthrough is the entire point.
      const dup =
        !isAssistedMode &&
        isDuplicateHint(intervention.hint_text, input.recentHints);
      if (dup) {
        suppressionReason = "duplicate";
      } else {
        spoke = true;
        const predicted = !isAssistedMode && verdict.kind === "speak_predictive";
        const severity = reasoning!.severity ?? null;
        // Phase 2 / E7 — only advertise audio if the TTS provider is wired
        // up. The frontend's audioStream.ts treats a truthy `audio_url` as
        // "fetch /api/audio/<id>", so we keep this null when ElevenLabs is
        // disabled to avoid useless 4xx fetches in dev.
        const audioUrl = elevenLabsConfigured()
          ? `/api/audio/${input.cycleId}`
          : null;
        if (audioUrl) {
          // Stash the text BEFORE the SSE event leaves so the audio fetch
          // (which can race the SSE roundtrip on fast networks) always
          // finds something to synthesize.
          cacheHintForAudio({
            hintId: input.cycleId,
            text: intervention.hint_text,
            cycleId: input.cycleId,
            sessionId: input.session.id,
          });
        }
        events.push({
          type: "hint",
          id: input.cycleId,
          text: intervention.hint_text,
          hint_type: intervention.hint_type,
          audio_url: audioUrl,
          predicted,
          severity: severity as 1 | 2 | 3 | 4 | 5 | undefined,
          ...(isVoiceMode
            ? {
                assistance: "voice" as const,
                student_question: input.studentQuestion!.trim(),
              }
            : isExplainMode
              ? { assistance: "explain" as const }
              : {}),
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

/**
 * Detect derivative practice pages (worksheets where the student writes
 * their own `y = expr` and then `dy/dx = ...`) and synthesize a problem
 * statement so the canonical solver can run.
 *
 * Returns `null` when the page has no recognizable derivative pairs —
 * we fall back to the existing "still reading the problem" path in
 * that case rather than fabricate a problem out of nothing.
 *
 * Heuristic: scan completed_steps + current_step for lines that look
 * like `y = <expr>` / `f(x) = <expr>`. If we find at least one, build
 * a generic prompt that names every base function we saw. The
 * downstream reasoning agent will then audit each pair on its own.
 */
function synthesizeProblemTextFromOcr(ocr: OcrOutput): string | null {
  const steps = [
    ...(ocr.completed_steps_latex ?? []),
    ...(ocr.current_step_latex ? [ocr.current_step_latex] : []),
  ];
  // Match `y = ...`, `f(x) = ...`, `g(x) = ...`. We stop at the first =
  // so we can keep just the function definition for the synthesized
  // prompt. Strip surrounding LaTeX whitespace.
  const baseFnRe = /^\s*(?:y|f\(x\)|g\(x\)|h\(x\))\s*=\s*(.+?)\s*$/i;
  const fns: string[] = [];
  for (const raw of steps) {
    if (typeof raw !== "string") continue;
    const m = baseFnRe.exec(raw);
    if (!m) continue;
    const expr = m[1]!.trim();
    if (!expr) continue; // student just wrote "y =" with no rhs yet
    if (fns.includes(expr)) continue; // dedup
    fns.push(expr);
  }
  if (fns.length === 0) return null;
  // Single function → focused prompt; multiple → "for each of the
  // following". Either way the canonical agent can produce usable
  // common_errors and the evaluator can audit each pair.
  if (fns.length === 1) {
    return `Find dy/dx for y = ${fns[0]}.`;
  }
  const list = fns.map((f) => `y = ${f}`).join("; ");
  return `Find dy/dx for each of the following: ${list}.`;
}

// Eslint sanity — keep the `deriveConfidenceLevel` import alive for callers
// that want raw status→ribbon mapping outside the orchestrator (UI tests
// reuse it).
export { deriveConfidenceLevel };
