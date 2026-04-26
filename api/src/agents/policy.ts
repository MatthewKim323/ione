/**
 * Policy module — the decision tree that decides whether the Intervention
 * Agent runs at all, and whether what it produces gets surfaced.
 *
 * Pure TypeScript, NO LLM CALLS. Every branch here is unit-tested in
 * api/tests/policy.test.ts. The LLM-side rules in INTERVENTION_AGENT_SYSTEM
 * mirror these — when they conflict, this file wins, because it runs first
 * (cheap gate) and again on the model's output (sanity check).
 *
 * Why a separate gate before the LLM?
 *   • If we already know we'll suppress, don't pay for the call.
 *   • Cooldown + dedup are deterministic; LLMs occasionally drift on them.
 */

import type { ReasoningOutput, PredictiveOutput, StepStatus } from "./types.js";

export type PolicyInputs = {
  reasoning: ReasoningOutput | null;
  predictive: PredictiveOutput | null;
  recentHints: { text: string; createdAt: number }[]; // ms epoch
  isStalled: boolean;
  /** ms — since last spoken hint, used for cooldown gating. */
  cooldownMs: number;
  /** Phase 5 / R4 toggle; default 0.7. */
  predictiveThreshold?: number;
  /** Phase 1 baseline cooldown (60_000 per AGENT_PROMPTS §3 rule 2). */
  cooldownWindowMs?: number;
};

export type PolicyVerdict =
  | { kind: "speak_predictive"; reason: string }
  | { kind: "speak_reactive"; reason: string }
  | { kind: "silent"; reason: string };

export const DEFAULT_COOLDOWN_MS = 60_000;
export const DEFAULT_PREDICTIVE_THRESHOLD = 0.7;

/**
 * Decide whether to invoke the Intervention Agent.
 *
 * Returns one of three verdicts:
 *   • speak_predictive — predictive agent crossed threshold AND reasoning
 *     hasn't yet caught a post-commit error this cycle. Pre-commit moment.
 *   • speak_reactive  — reasoning saw a real problem (severity ≥3, or stall,
 *     or major_error / off_track).
 *   • silent          — neither path qualifies. Suppress.
 */
export function decidePolicy(inputs: PolicyInputs): PolicyVerdict {
  const cooldownWindow = inputs.cooldownWindowMs ?? DEFAULT_COOLDOWN_MS;
  const cooldownActive = inputs.cooldownMs >= 0 && inputs.cooldownMs < cooldownWindow;
  const threshold = inputs.predictiveThreshold ?? DEFAULT_PREDICTIVE_THRESHOLD;

  const status: StepStatus | null = inputs.reasoning?.step_status ?? null;
  const severity = inputs.reasoning?.severity ?? 1;

  // Rule 0 — never speak when reasoning says correct/complete unless it's
  // the "you just landed the final answer" exit beat. The intervention agent
  // is responsible for the actual congratulation; we just allow the call.
  if (status === "complete") {
    return { kind: "speak_reactive", reason: "completed final answer (allow brief acknowledgement)" };
  }
  if (status === "correct") {
    return { kind: "silent", reason: "step_status correct — silence" };
  }

  // Rule 1 — predictive precedence. If predictive crossed threshold AND we
  // are NOT in cooldown, speak predictive. This is THE wow moment.
  if (
    inputs.predictive &&
    inputs.predictive.recommend_intervene &&
    inputs.predictive.predicted_error.confidence >= threshold &&
    !cooldownActive
  ) {
    return {
      kind: "speak_predictive",
      reason: `predictive at ${inputs.predictive.predicted_error.confidence.toFixed(
        2,
      )} ≥ ${threshold} & no cooldown`,
    };
  }

  // Rule 2 — stall + is_stalled → speak (scaffolding question).
  if (status === "stalled" && inputs.isStalled) {
    return { kind: "speak_reactive", reason: "student stalled — scaffolding allowed" };
  }

  // Rule 3 — major_error / off_track → always speak (immediate).
  if (status === "major_error" || status === "off_track") {
    if (cooldownActive && severity < 5) {
      return {
        kind: "silent",
        reason: `major_error within cooldown and severity ${severity}<5`,
      };
    }
    return { kind: "speak_reactive", reason: `${status} — speak` };
  }

  // Rule 4 — severity 3 minor_error: speak ONCE briefly.
  if (status === "minor_error") {
    if (severity >= 3 && !cooldownActive) {
      return { kind: "speak_reactive", reason: "minor_error severity ≥3" };
    }
    return {
      kind: "silent",
      reason: `minor_error severity ${severity} — let student self-correct`,
    };
  }

  // Default — silent.
  return { kind: "silent", reason: "no rule fired" };
}

/**
 * Cheap dedup check used by both the orchestrator (after the model returns)
 * and the eval harness. Normalizes whitespace + case before comparing.
 */
export function isDuplicateHint(
  candidate: string,
  recent: { text: string }[],
  windowSize = 5,
): boolean {
  if (!candidate) return true;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const c = norm(candidate);
  const last = recent.slice(-windowSize);
  return last.some((h) => norm(h.text) === c);
}

/**
 * Severity → ConfidenceRibbon color mapping. Used by orchestrator to pick
 * what color the ribbon shows alongside any hint event. Distinct from
 * deriveConfidenceLevel in types.ts — this one is post-policy and accounts
 * for predictive risk in addition to reasoning.
 */
export function ribbonForVerdict(
  verdict: PolicyVerdict,
  reasoning: ReasoningOutput | null,
  predictive: PredictiveOutput | null,
): "moss" | "graphite" | "sienna_soft" | "sienna" {
  if (verdict.kind === "speak_predictive") {
    if (predictive && predictive.predicted_error.confidence >= 0.85) return "sienna";
    return "sienna_soft";
  }
  if (verdict.kind === "speak_reactive") {
    const sev = reasoning?.severity ?? 1;
    if (sev >= 4) return "sienna";
    if (sev >= 3) return "sienna_soft";
    if (reasoning?.step_status === "complete") return "moss";
    return "graphite";
  }
  // silent
  if (reasoning?.step_status === "correct" || reasoning?.step_status === "complete") {
    return "moss";
  }
  return "graphite";
}
