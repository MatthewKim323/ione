/**
 * Shared agent types. The Sonnet schemas in agents/prompts.ts must produce
 * objects shaped exactly like these. Tests pin the schema; if Sonnet drifts,
 * we add fence-stripping or schema repair, never loosen the types.
 */

import type { ConfidenceLevel, HintType } from "../lib/sse.js";

export type PageState =
  | "fresh_problem"
  | "in_progress"
  | "near_complete"
  | "stalled_or_stuck";

export type StepStatus =
  | "correct"
  | "minor_error"
  | "major_error"
  | "stalled"
  | "off_track"
  | "complete";

export type ErrorType =
  | "sign_error"
  | "arithmetic"
  | "algebra"
  | "wrong_formula"
  | "wrong_rule"
  | "setup"
  | "approach"
  | "computation";

export type Severity = 1 | 2 | 3 | 4 | 5;

export type OcrOutput = {
  problem_text: string | null;
  current_step_latex: string | null;
  completed_steps_latex: string[];
  is_blank_page: boolean;
  has_diagram: boolean;
  scratch_work_present: boolean;
  page_state: PageState;
  confidence: number;
};

export type CanonicalSolutionStep = {
  step: string;
  reasoning: string;
  common_errors: string[];
};

export type CanonicalSolution = {
  final_answer: string;
  solution_steps: CanonicalSolutionStep[];
  topic: string;
  alternate_approaches: string[];
  difficulty: "easy" | "medium" | "hard";
};

export type ReasoningOutput = {
  step_status: StepStatus;
  error_type: ErrorType | null;
  error_location: string | null;
  severity: Severity;
  what_they_should_do_next: string;
  scaffolding_question: string | null;
  matches_known_error_pattern: boolean;
};

export type PredictiveOutput = {
  predicted_error: {
    type: string;
    basis: string;
    confidence: number;
  };
  recommend_intervene: boolean;
  reasoning: string;
};

export type InterventionOutput = {
  should_speak: boolean;
  hint_text: string | null;
  hint_type: HintType | null;
  memory_to_write: string | null;
  reasoning_for_decision: string;
};

/** One row of the rolling 5-frame trajectory the client maintains. */
export type TrajectoryFrame = {
  cycle_index: number;
  client_ts: string; // ISO
  page_state: PageState;
  current_step_latex: string | null;
  completed_steps_count: number;
  step_status: StepStatus | null;
  is_stalled: boolean;
  seconds_since_last_change: number;
  spoke: boolean;
  hint_text: string | null;
};

/** Shape produced by lib/graph/memory.ts (Phase 3 / F1). */
export type StruggleProfile = {
  pattern_summary: string;
  error_type: string;
  frequency: string;
  examples: Array<{
    problem: string;
    date: string;
    what_went_wrong: string;
  }>;
  tutor_notes: string;
};

/**
 * Maps a StepStatus + Severity to one of the four hand-pencil ribbon
 * confidence colors. Pure derivation — no heuristics in the UI.
 *
 *   moss        → "all good, keep going"
 *   graphite    → "thinking, neutral"
 *   sienna_soft → "minor concern, watch closely"
 *   sienna      → "real problem, almost certainly intervening"
 */
export function deriveConfidenceLevel(
  status: StepStatus | null,
  severity: Severity | null,
): ConfidenceLevel {
  if (status === "correct" || status === "complete") return "moss";
  if (status === "stalled") return "sienna_soft";
  if (status === "off_track") return "sienna";
  if (status === "major_error") return "sienna";
  if (status === "minor_error") {
    return (severity ?? 1) >= 3 ? "sienna_soft" : "graphite";
  }
  return "graphite";
}
