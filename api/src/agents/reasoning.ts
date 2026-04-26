/**
 * Reasoning / Solution Agent (AGENT_PROMPTS §2).
 *
 * Two-call pattern:
 *   1. canonicalSolution(problem_text)  — runs ONCE per problem, cached on
 *      tutor_sessions.canonical_solution_json. Returns full reference solution.
 *   2. evaluateStudent(canonical, ocr, ...) — runs every cycle. Compares the
 *      student's current state to the canonical solution and classifies it.
 *
 * The `cacheSystem` flag turns on Anthropic prompt caching for the long
 * evaluator system message — saves ~$0.003/cycle once warm.
 */

import { sonnetJson } from "../integrations/anthropic.js";
import {
  REASONING_CANONICAL_SYSTEM,
  REASONING_EVALUATE_SYSTEM,
} from "./prompts.js";
import type {
  CanonicalSolution,
  OcrOutput,
  ReasoningOutput,
  Severity,
  StepStatus,
  ErrorType,
} from "./types.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { CycleCost } from "../lib/cost.js";

// ──────────────────────────────────────────────────────────────────────────
// Call 1 — canonical solution (cached per problem)

export async function canonicalSolution(opts: {
  problemText: string;
  cost?: CycleCost;
}): Promise<{ solution: CanonicalSolution; raw: string; usd: number; ms: number }> {
  const sonnet = await sonnetJson<CanonicalSolution>({
    system: REASONING_CANONICAL_SYSTEM,
    user: `## Problem\n${opts.problemText}`,
    maxTokens: 1200,
    cacheSystem: true,
  });
  opts.cost?.add("reasoning_canonical", sonnet.usd);

  if (!sonnet.parsed.ok) {
    logger.warn(
      { raw: sonnet.raw.slice(0, 200), err: sonnet.parsed.error },
      "reasoning canonical JSON parse failed",
    );
    throw new AppError(
      "agent_parse_error",
      "reasoning canonical JSON parse failed",
      { details: { raw: sonnet.raw.slice(0, 500) } },
    );
  }

  const sol = normalizeCanonical(sonnet.parsed.value);
  return { solution: sol, raw: sonnet.raw, usd: sonnet.usd, ms: sonnet.ms };
}

function normalizeCanonical(raw: Partial<CanonicalSolution>): CanonicalSolution {
  return {
    final_answer: typeof raw.final_answer === "string" ? raw.final_answer : "",
    solution_steps: Array.isArray(raw.solution_steps)
      ? raw.solution_steps
          .filter((s): s is { step: string; reasoning: string; common_errors: string[] } =>
            !!s && typeof s === "object",
          )
          .map((s) => ({
            step: typeof s.step === "string" ? s.step : "",
            reasoning: typeof s.reasoning === "string" ? s.reasoning : "",
            common_errors: Array.isArray(s.common_errors)
              ? s.common_errors.filter((e): e is string => typeof e === "string")
              : [],
          }))
      : [],
    topic: typeof raw.topic === "string" ? raw.topic : "unknown",
    alternate_approaches: Array.isArray(raw.alternate_approaches)
      ? raw.alternate_approaches.filter((s): s is string => typeof s === "string")
      : [],
    difficulty:
      raw.difficulty === "easy" || raw.difficulty === "medium" || raw.difficulty === "hard"
        ? raw.difficulty
        : "medium",
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Call 2 — evaluate student work (every cycle)

export type EvaluateStudentInput = {
  problemText: string;
  canonical: CanonicalSolution;
  ocr: OcrOutput;
  isStalled: boolean;
  cost?: CycleCost;
};

export async function evaluateStudent(
  input: EvaluateStudentInput,
): Promise<{ output: ReasoningOutput; raw: string; usd: number; ms: number }> {
  const userPayload = JSON.stringify(
    {
      problem: input.problemText,
      canonical_solution: input.canonical,
      student_completed_steps: input.ocr.completed_steps_latex,
      student_current_step: input.ocr.current_step_latex,
      is_stalled: input.isStalled,
    },
    null,
    2,
  );

  const sonnet = await sonnetJson<ReasoningOutput>({
    system: REASONING_EVALUATE_SYSTEM,
    user: userPayload,
    // Evaluator emits several string fields; 600 was truncating mid-value,
    // leaving invalid JSON and "reasoning agent rejected" every cycle.
    maxTokens: 1200,
    cacheSystem: true,
  });
  input.cost?.add("reasoning_evaluate", sonnet.usd);

  if (!sonnet.parsed.ok) {
    logger.warn(
      { raw: sonnet.raw.slice(0, 200), err: sonnet.parsed.error },
      "reasoning evaluator JSON parse failed",
    );
    throw new AppError(
      "agent_parse_error",
      "reasoning evaluator JSON parse failed",
      { details: { raw: sonnet.raw.slice(0, 500) } },
    );
  }

  const output = normalizeReasoning(sonnet.parsed.value);
  return { output, raw: sonnet.raw, usd: sonnet.usd, ms: sonnet.ms };
}

const STEP_STATUSES: StepStatus[] = [
  "correct",
  "minor_error",
  "major_error",
  "stalled",
  "off_track",
  "complete",
];

const ERROR_TYPES: ErrorType[] = [
  "sign_error",
  "arithmetic",
  "algebra",
  "wrong_formula",
  "wrong_rule",
  "setup",
  "approach",
  "computation",
];

function normalizeReasoning(raw: Partial<ReasoningOutput>): ReasoningOutput {
  const status: StepStatus = STEP_STATUSES.includes(raw.step_status as StepStatus)
    ? (raw.step_status as StepStatus)
    : "correct";
  const errorType: ErrorType | null =
    raw.error_type === null || raw.error_type === undefined
      ? null
      : ERROR_TYPES.includes(raw.error_type as ErrorType)
        ? (raw.error_type as ErrorType)
        : null;

  const sevRaw =
    typeof raw.severity === "number" ? Math.round(raw.severity) : 1;
  let severity = (Math.min(5, Math.max(1, sevRaw)) || 1) as Severity;

  // Severity floor: a real major_error / off_track that propagates through
  // the rest of the problem cannot honestly be "trivial" (severity 1) or
  // "minor slip" (severity 2). Sonnet sometimes splits the diff — calls
  // something major_error but then lowballs severity, which then loses to
  // the policy gate. We refuse to ship a major_error below severity 4 so
  // intervention actually fires. This pairs with the prompt rules that
  // explicitly call wrong-derivative / dropped-chain-rule severity≥4.
  if ((status === "major_error" || status === "off_track") && severity < 4) {
    severity = 4 as Severity;
  }

  return {
    step_status: status,
    error_type: errorType,
    error_location:
      typeof raw.error_location === "string" ? raw.error_location : null,
    severity,
    what_they_should_do_next:
      typeof raw.what_they_should_do_next === "string"
        ? raw.what_they_should_do_next
        : "",
    scaffolding_question:
      typeof raw.scaffolding_question === "string"
        ? raw.scaffolding_question
        : null,
    matches_known_error_pattern: Boolean(
      raw.matches_known_error_pattern ?? false,
    ),
  };
}
