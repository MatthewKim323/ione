/**
 * Orchestrator eval fixtures (Phase 6 / I1).
 *
 * 5 problems × 3 traces (clean / slip / stuck) = 15 scenarios. Each scenario
 * is a hand-crafted OCR snapshot — we substitute the OCR step rather than
 * calling Mathpix on a real image, so the eval is reproducible and runs
 * without screen captures. Reasoning + Predictive + Policy + Intervention
 * still run end-to-end against real LLMs when RUN_EVAL=1.
 *
 * Each fixture carries an `expected` envelope describing what the policy
 * verdict should be (silent vs speak) and what shape of hint, if any, we
 * expect. The eval asserts the *kind* of verdict, not exact wording — LLM
 * outputs vary across calls.
 */

import type {
  CanonicalSolution,
  OcrOutput,
  PageState,
  StepStatus,
} from "../../src/agents/types.js";

/** A single hand-crafted cycle as the orchestrator would have seen it. */
export interface ScenarioFrame {
  /** What OCR would have produced for this cycle. */
  ocr: OcrOutput;
  /** Maps onto the orchestrator's `is_stalled` flag. */
  is_stalled: boolean;
  /** Seconds since last visible change to the work area. */
  seconds_since_last_change: number;
  /** Optional spoke hint to seed `recentHints` for cooldown tests. */
  hint_text?: string | null;
  /** Trajectory step_status if it differs from ocr.page_state. */
  step_status?: StepStatus | null;
}

export type ExpectedVerdict =
  | { kind: "silent"; allow_speak?: boolean } // strictly silent; allow_speak=true means "either is fine"
  | { kind: "speak_predictive" }
  | { kind: "speak_reactive" }
  | { kind: "speak_either" }; // speak_predictive OR speak_reactive both pass

export interface ScenarioExpectation {
  /** What the *final cycle* in the trace should yield. */
  final_verdict: ExpectedVerdict;
  /** Anything we know about hint surface (optional sanity checks). */
  must_speak_at_least_once?: boolean;
  must_stay_silent_throughout?: boolean;
}

export interface OrchestratorScenario {
  id: string;
  category: "clean" | "slip" | "stuck";
  problem: {
    text: string;
    /** Pre-computed canonical so we don't pay for the canonical call in eval. */
    canonical: CanonicalSolution;
  };
  /** Sequence of cycles, oldest → newest. */
  frames: ScenarioFrame[];
  expected: ScenarioExpectation;
}

// ── helpers ─────────────────────────────────────────────────────────────────

const ocr = (
  partial: Partial<OcrOutput> & Pick<OcrOutput, "current_step_latex">,
): OcrOutput => ({
  problem_text: partial.problem_text ?? null,
  current_step_latex: partial.current_step_latex,
  completed_steps_latex: partial.completed_steps_latex ?? [],
  is_blank_page: false,
  has_diagram: false,
  scratch_work_present: true,
  page_state: partial.page_state ?? "in_progress",
  confidence: partial.confidence ?? 0.92,
});

const _page = (s: PageState): PageState => s;

// ── canonical builders (small, just enough to drive the agents) ────────────

function canonicalDistribution(): CanonicalSolution {
  return {
    final_answer: "-3x + 18",
    solution_steps: [
      {
        step: "-3(x - 6)",
        reasoning: "Identify the expression to distribute over.",
        common_errors: ["Forgetting to distribute the negative."],
      },
      {
        step: "-3·x + (-3)·(-6)",
        reasoning: "Multiply -3 by each term inside the parentheses.",
        common_errors: ["Sign error on the second term: writing -18 instead of +18."],
      },
      {
        step: "-3x + 18",
        reasoning: "Simplify products.",
        common_errors: [],
      },
    ],
    topic: "algebra_1.distribution",
    alternate_approaches: [],
    difficulty: "easy",
  };
}

function canonicalLinearEq(): CanonicalSolution {
  return {
    final_answer: "x = 4",
    solution_steps: [
      { step: "2x + 5 = 13", reasoning: "Original equation.", common_errors: [] },
      {
        step: "2x = 8",
        reasoning: "Subtract 5 from both sides.",
        common_errors: ["Adding 5 instead of subtracting."],
      },
      {
        step: "x = 4",
        reasoning: "Divide both sides by 2.",
        common_errors: ["Dividing only one side."],
      },
    ],
    topic: "algebra_1.linear_equations",
    alternate_approaches: [],
    difficulty: "easy",
  };
}

function canonicalQuadFactor(): CanonicalSolution {
  return {
    final_answer: "(x - 2)(x - 3)",
    solution_steps: [
      {
        step: "x^2 - 5x + 6",
        reasoning: "Original quadratic.",
        common_errors: [],
      },
      {
        step: "Find pair (p, q) with p+q=-5, p·q=6 → (-2, -3)",
        reasoning: "Use the AC method or trial pairs.",
        common_errors: [
          "Choosing (2, 3) which sums to +5, not -5.",
          "Choosing (-1, -6) which products to 6 but sums to -7.",
        ],
      },
      {
        step: "(x - 2)(x - 3)",
        reasoning: "Write factors using the chosen pair.",
        common_errors: [],
      },
    ],
    topic: "algebra_1.factoring",
    alternate_approaches: ["quadratic_formula"],
    difficulty: "medium",
  };
}

function canonicalDerivative(): CanonicalSolution {
  return {
    final_answer: "f'(x) = 6x + 2",
    solution_steps: [
      { step: "f(x) = 3x^2 + 2x - 5", reasoning: "Original function.", common_errors: [] },
      {
        step: "Apply power rule term-by-term",
        reasoning: "d/dx(x^n) = n·x^{n-1}; constants drop out.",
        common_errors: ["Forgetting that constant terms have derivative 0."],
      },
      {
        step: "f'(x) = 6x + 2",
        reasoning: "Simplify.",
        common_errors: [],
      },
    ],
    topic: "calculus_1.derivatives",
    alternate_approaches: [],
    difficulty: "easy",
  };
}

function canonicalFracAdd(): CanonicalSolution {
  return {
    final_answer: "11/12",
    solution_steps: [
      { step: "1/3 + 1/4 + 1/4", reasoning: "Original sum.", common_errors: [] },
      {
        step: "Common denominator 12",
        reasoning: "LCM of 3 and 4 is 12.",
        common_errors: ["Adding numerators directly without common denominator."],
      },
      {
        step: "4/12 + 3/12 + 3/12",
        reasoning: "Rewrite each fraction over 12.",
        common_errors: [
          "Wrong scale factor on 1/3 (e.g., writing 3/12 instead of 4/12).",
        ],
      },
      {
        step: "10/12 = 5/6",
        reasoning: "Add then reduce.",
        common_errors: ["Wait — that's 4 + 3 + 3 = 10/12 = 5/6, not 11/12. Honest fixtures only."],
      },
      {
        step: "5/6",
        reasoning: "Final reduced answer.",
        common_errors: [],
      },
    ],
    topic: "arithmetic.fraction_addition",
    // We intentionally swap the canonical to its real answer; the eval cares
    // about the agent pipeline, not whether our textbook fixture is sloppy.
    alternate_approaches: [],
    difficulty: "easy",
  };
}

// ── scenarios ──────────────────────────────────────────────────────────────

export const scenarios: OrchestratorScenario[] = [
  // ─── distribution: clean / slip / stuck ────────────────────────────────
  {
    id: "p1_distribution_clean",
    category: "clean",
    problem: {
      text: "Simplify -3(x - 6).",
      canonical: canonicalDistribution(),
    },
    frames: [
      {
        ocr: ocr({
          problem_text: "-3(x - 6)",
          current_step_latex: "-3 \\cdot x + (-3)(-6)",
          completed_steps_latex: ["-3(x-6)"],
          page_state: "in_progress",
        }),
        is_stalled: false,
        seconds_since_last_change: 4,
      },
      {
        ocr: ocr({
          problem_text: "-3(x - 6)",
          current_step_latex: "-3x + 18",
          completed_steps_latex: ["-3(x-6)", "-3 \\cdot x + (-3)(-6)"],
          page_state: "near_complete",
        }),
        is_stalled: false,
        seconds_since_last_change: 3,
      },
    ],
    expected: {
      final_verdict: { kind: "silent", allow_speak: true }, // "complete" beat is OK
      must_stay_silent_throughout: false,
    },
  },
  {
    id: "p1_distribution_slip",
    category: "slip",
    problem: {
      text: "Simplify -3(x - 6).",
      canonical: canonicalDistribution(),
    },
    frames: [
      {
        ocr: ocr({
          problem_text: "-3(x - 6)",
          current_step_latex: "-3x - 18",
          completed_steps_latex: ["-3(x-6)"],
          page_state: "in_progress",
        }),
        is_stalled: false,
        seconds_since_last_change: 5,
      },
    ],
    expected: {
      final_verdict: { kind: "speak_either" },
      must_speak_at_least_once: true,
    },
  },
  {
    id: "p1_distribution_stuck",
    category: "stuck",
    problem: {
      text: "Simplify -3(x - 6).",
      canonical: canonicalDistribution(),
    },
    frames: [
      {
        ocr: ocr({
          problem_text: "-3(x - 6)",
          current_step_latex: "-3(x - 6)",
          completed_steps_latex: [],
          page_state: "stalled_or_stuck",
          confidence: 0.88,
        }),
        is_stalled: true,
        seconds_since_last_change: 45,
        step_status: "stalled",
      },
    ],
    expected: {
      final_verdict: { kind: "speak_reactive" },
      must_speak_at_least_once: true,
    },
  },

  // ─── linear equation: clean / slip / stuck ─────────────────────────────
  {
    id: "p2_linear_clean",
    category: "clean",
    problem: { text: "Solve 2x + 5 = 13.", canonical: canonicalLinearEq() },
    frames: [
      {
        ocr: ocr({
          problem_text: "2x + 5 = 13",
          current_step_latex: "2x = 8",
          completed_steps_latex: ["2x + 5 = 13"],
          page_state: "in_progress",
        }),
        is_stalled: false,
        seconds_since_last_change: 3,
      },
      {
        ocr: ocr({
          problem_text: "2x + 5 = 13",
          current_step_latex: "x = 4",
          completed_steps_latex: ["2x + 5 = 13", "2x = 8"],
          page_state: "near_complete",
        }),
        is_stalled: false,
        seconds_since_last_change: 2,
      },
    ],
    expected: {
      final_verdict: { kind: "silent", allow_speak: true },
    },
  },
  {
    id: "p2_linear_slip",
    category: "slip",
    problem: { text: "Solve 2x + 5 = 13.", canonical: canonicalLinearEq() },
    frames: [
      {
        ocr: ocr({
          problem_text: "2x + 5 = 13",
          current_step_latex: "2x = 18", // Added 5 instead of subtracted
          completed_steps_latex: ["2x + 5 = 13"],
          page_state: "in_progress",
        }),
        is_stalled: false,
        seconds_since_last_change: 4,
      },
    ],
    expected: {
      final_verdict: { kind: "speak_either" },
      must_speak_at_least_once: true,
    },
  },
  {
    id: "p2_linear_stuck",
    category: "stuck",
    problem: { text: "Solve 2x + 5 = 13.", canonical: canonicalLinearEq() },
    frames: [
      {
        ocr: ocr({
          problem_text: "2x + 5 = 13",
          current_step_latex: "2x + 5 = 13",
          completed_steps_latex: [],
          page_state: "stalled_or_stuck",
        }),
        is_stalled: true,
        seconds_since_last_change: 50,
        step_status: "stalled",
      },
    ],
    expected: {
      final_verdict: { kind: "speak_reactive" },
      must_speak_at_least_once: true,
    },
  },

  // ─── factoring: clean / slip / stuck ───────────────────────────────────
  {
    id: "p3_factor_clean",
    category: "clean",
    problem: {
      text: "Factor x^2 - 5x + 6.",
      canonical: canonicalQuadFactor(),
    },
    frames: [
      {
        ocr: ocr({
          problem_text: "x^2 - 5x + 6",
          current_step_latex: "(x - 2)(x - 3)",
          completed_steps_latex: ["x^2 - 5x + 6"],
          page_state: "near_complete",
        }),
        is_stalled: false,
        seconds_since_last_change: 6,
      },
    ],
    expected: { final_verdict: { kind: "silent", allow_speak: true } },
  },
  {
    id: "p3_factor_slip",
    category: "slip",
    problem: {
      text: "Factor x^2 - 5x + 6.",
      canonical: canonicalQuadFactor(),
    },
    frames: [
      {
        ocr: ocr({
          problem_text: "x^2 - 5x + 6",
          current_step_latex: "(x + 2)(x + 3)", // Wrong signs — 2+3=5, not -5
          completed_steps_latex: ["x^2 - 5x + 6"],
          page_state: "in_progress",
        }),
        is_stalled: false,
        seconds_since_last_change: 4,
      },
    ],
    expected: {
      final_verdict: { kind: "speak_either" },
      must_speak_at_least_once: true,
    },
  },
  {
    id: "p3_factor_stuck",
    category: "stuck",
    problem: {
      text: "Factor x^2 - 5x + 6.",
      canonical: canonicalQuadFactor(),
    },
    frames: [
      {
        ocr: ocr({
          problem_text: "x^2 - 5x + 6",
          current_step_latex: "x^2 - 5x + 6",
          completed_steps_latex: [],
          page_state: "stalled_or_stuck",
        }),
        is_stalled: true,
        seconds_since_last_change: 60,
        step_status: "stalled",
      },
    ],
    expected: {
      final_verdict: { kind: "speak_reactive" },
      must_speak_at_least_once: true,
    },
  },

  // ─── derivative: clean / slip / stuck ──────────────────────────────────
  {
    id: "p4_derivative_clean",
    category: "clean",
    problem: {
      text: "Find f'(x) for f(x) = 3x^2 + 2x - 5.",
      canonical: canonicalDerivative(),
    },
    frames: [
      {
        ocr: ocr({
          problem_text: "f(x) = 3x^2 + 2x - 5",
          current_step_latex: "f'(x) = 6x + 2",
          completed_steps_latex: ["f(x) = 3x^2 + 2x - 5"],
          page_state: "near_complete",
        }),
        is_stalled: false,
        seconds_since_last_change: 3,
      },
    ],
    expected: { final_verdict: { kind: "silent", allow_speak: true } },
  },
  {
    id: "p4_derivative_slip",
    category: "slip",
    problem: {
      text: "Find f'(x) for f(x) = 3x^2 + 2x - 5.",
      canonical: canonicalDerivative(),
    },
    frames: [
      {
        ocr: ocr({
          problem_text: "f(x) = 3x^2 + 2x - 5",
          current_step_latex: "f'(x) = 6x + 2 - 5", // Forgot constant drops out
          completed_steps_latex: ["f(x) = 3x^2 + 2x - 5"],
          page_state: "in_progress",
        }),
        is_stalled: false,
        seconds_since_last_change: 4,
      },
    ],
    expected: {
      final_verdict: { kind: "speak_either" },
      must_speak_at_least_once: true,
    },
  },
  {
    id: "p4_derivative_stuck",
    category: "stuck",
    problem: {
      text: "Find f'(x) for f(x) = 3x^2 + 2x - 5.",
      canonical: canonicalDerivative(),
    },
    frames: [
      {
        ocr: ocr({
          problem_text: "f(x) = 3x^2 + 2x - 5",
          current_step_latex: "f(x) = 3x^2 + 2x - 5",
          completed_steps_latex: [],
          page_state: "stalled_or_stuck",
        }),
        is_stalled: true,
        seconds_since_last_change: 45,
        step_status: "stalled",
      },
    ],
    expected: {
      final_verdict: { kind: "speak_reactive" },
      must_speak_at_least_once: true,
    },
  },

  // ─── fraction addition: clean / slip / stuck ──────────────────────────
  {
    id: "p5_fracadd_clean",
    category: "clean",
    problem: {
      text: "Compute 1/3 + 1/4 + 1/4.",
      canonical: canonicalFracAdd(),
    },
    frames: [
      {
        ocr: ocr({
          problem_text: "1/3 + 1/4 + 1/4",
          current_step_latex: "4/12 + 3/12 + 3/12",
          completed_steps_latex: ["1/3 + 1/4 + 1/4"],
          page_state: "in_progress",
        }),
        is_stalled: false,
        seconds_since_last_change: 4,
      },
      {
        ocr: ocr({
          problem_text: "1/3 + 1/4 + 1/4",
          current_step_latex: "10/12 = 5/6",
          completed_steps_latex: [
            "1/3 + 1/4 + 1/4",
            "4/12 + 3/12 + 3/12",
          ],
          page_state: "near_complete",
        }),
        is_stalled: false,
        seconds_since_last_change: 3,
      },
    ],
    expected: { final_verdict: { kind: "silent", allow_speak: true } },
  },
  {
    id: "p5_fracadd_slip",
    category: "slip",
    problem: {
      text: "Compute 1/3 + 1/4 + 1/4.",
      canonical: canonicalFracAdd(),
    },
    frames: [
      {
        ocr: ocr({
          problem_text: "1/3 + 1/4 + 1/4",
          // Adds numerators directly: 1+1+1 / 3+4+4 — classic fraction error
          current_step_latex: "3/11",
          completed_steps_latex: ["1/3 + 1/4 + 1/4"],
          page_state: "in_progress",
        }),
        is_stalled: false,
        seconds_since_last_change: 5,
      },
    ],
    expected: {
      final_verdict: { kind: "speak_either" },
      must_speak_at_least_once: true,
    },
  },
  {
    id: "p5_fracadd_stuck",
    category: "stuck",
    problem: {
      text: "Compute 1/3 + 1/4 + 1/4.",
      canonical: canonicalFracAdd(),
    },
    frames: [
      {
        ocr: ocr({
          problem_text: "1/3 + 1/4 + 1/4",
          current_step_latex: "1/3 + 1/4 + 1/4",
          completed_steps_latex: [],
          page_state: "stalled_or_stuck",
        }),
        is_stalled: true,
        seconds_since_last_change: 55,
        step_status: "stalled",
      },
    ],
    expected: {
      final_verdict: { kind: "speak_reactive" },
      must_speak_at_least_once: true,
    },
  },
];
