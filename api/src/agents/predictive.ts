/**
 * Predictive Risk Agent. Ports scripts/test-predictive.mjs into the API.
 *
 * Predicts the NEXT error a student is about to commit — before they commit
 * it — using their longitudinal struggle profile + the live trajectory.
 *
 * Bias hard toward silence (recommend_intervene=false). The reasoning agent
 * owns post-commit error catching. This agent earns its keep on the
 * pre-commit case where stopping the wrong stroke before it lands is the
 * "wow" moment.
 */

import { sonnetJson } from "../integrations/anthropic.js";
import { PREDICTIVE_AGENT_SYSTEM } from "./prompts.js";
import type {
  PredictiveOutput,
  StruggleProfile,
  CanonicalSolution,
} from "./types.js";
import { logger } from "../lib/logger.js";
import { AppError } from "../lib/errors.js";
import type { CycleCost } from "../lib/cost.js";
import {
  isPredictionWindowOpen,
  serializePredictiveTrajectory,
} from "./trajectory.js";
import type { TrajectoryFrame } from "./types.js";

export type PredictiveAgentInput = {
  problemText: string;
  canonical: CanonicalSolution;
  /** Optional ground-truth answer key for fixtures/eval. NOT shown to model. */
  answerKey?: {
    predicted_failure_step_index: number;
    predicted_failure_description: string;
  };
  struggleProfile: StruggleProfile | null;
  trajectory: TrajectoryFrame[];
  timeOnProblemSeconds: number;
  cost?: CycleCost;
};

export type PredictiveAgentResult = {
  output: PredictiveOutput;
  /** Will be true when window is closed *or* we ran the LLM and got low conf. */
  windowClosed: boolean;
  raw: string;
  usd: number;
  ms: number;
  skipped: boolean;
  skip_reason?: string;
};

/**
 * Default predictive threshold. Phase 5 / R4 (`?mode=demo`) drops this to 0.5
 * for the rehearsed seed problem only; otherwise we keep the strict 0.7 bar.
 */
export const DEFAULT_PREDICTIVE_THRESHOLD = 0.7;

export async function runPredictiveAgent(
  input: PredictiveAgentInput,
  opts?: { threshold?: number },
): Promise<PredictiveAgentResult> {
  const threshold = opts?.threshold ?? DEFAULT_PREDICTIVE_THRESHOLD;

  // Cheap pre-check: don't even pay for the LLM if the window is closed.
  if (!isPredictionWindowOpen(input.trajectory)) {
    return {
      output: {
        predicted_error: {
          type: "none",
          basis:
            "Trajectory shows the student has already committed a step; reasoning agent owns this case.",
          confidence: 0.0,
        },
        recommend_intervene: false,
        reasoning: "Prediction window closed — last frame had a non-pre-commit status.",
      },
      windowClosed: true,
      raw: "",
      usd: 0,
      ms: 0,
      skipped: true,
      skip_reason: "window_closed",
    };
  }

  // Without a struggle profile we cannot ground a prediction in evidence.
  // Per the prompt: "NEVER fabricate a pattern." Skip with low confidence.
  if (!input.struggleProfile) {
    return {
      output: {
        predicted_error: {
          type: "none",
          basis:
            "No struggle profile available; cannot predict THIS student's pattern without prior history.",
          confidence: 0.0,
        },
        recommend_intervene: false,
        reasoning: "No struggle profile — predictive agent recommends silence.",
      },
      windowClosed: false,
      raw: "",
      usd: 0,
      ms: 0,
      skipped: true,
      skip_reason: "no_profile",
    };
  }

  const trajBlock = serializePredictiveTrajectory({
    frames: input.trajectory,
    timeOnProblemSeconds: input.timeOnProblemSeconds,
  });
  const lastFrame = input.trajectory[input.trajectory.length - 1];
  trajBlock.student_work_so_far_latex =
    lastFrame && lastFrame.completed_steps_count
      ? input.canonical.solution_steps
          .slice(0, lastFrame.completed_steps_count)
          .map((s) => s.step)
      : [];

  // The predictive prompt expects the demo-problem JSON shape from the test
  // fixture. We build it from canonical + (optionally) the eval answer key.
  const demoProblem = {
    problem_text: input.problemText,
    canonical_solution_steps_latex: input.canonical.solution_steps.map((s) => s.step),
    canonical_solution_steps_explanation: input.canonical.solution_steps.map(
      (s) => s.reasoning,
    ),
    predicted_failure_step_index: input.answerKey?.predicted_failure_step_index ?? -1,
    predicted_failure_description: input.answerKey?.predicted_failure_description ?? "",
  };

  const userPayload = [
    "## Demo Problem",
    JSON.stringify(demoProblem, null, 2),
    "",
    "## Struggle Profile",
    JSON.stringify(input.struggleProfile, null, 2),
    "",
    "## Trajectory",
    JSON.stringify(trajBlock, null, 2),
  ].join("\n");

  const sonnet = await sonnetJson<PredictiveOutput>({
    system: PREDICTIVE_AGENT_SYSTEM,
    user: userPayload,
    maxTokens: 600,
    cacheSystem: true,
  });
  input.cost?.add("predictive", sonnet.usd);

  if (!sonnet.parsed.ok) {
    logger.warn(
      { raw: sonnet.raw.slice(0, 200), err: sonnet.parsed.error },
      "predictive agent JSON parse failed",
    );
    throw new AppError("agent_parse_error", "predictive JSON parse failed", {
      details: { raw: sonnet.raw.slice(0, 500) },
    });
  }

  const out = normalize(sonnet.parsed.value);

  // Apply our policy threshold over what the model returned. Even if Sonnet
  // says recommend_intervene=true with confidence 0.6, we will reset it to
  // false unless we're at threshold.
  const enforced: PredictiveOutput = {
    ...out,
    recommend_intervene:
      out.recommend_intervene && out.predicted_error.confidence >= threshold,
  };

  return {
    output: enforced,
    windowClosed: false,
    raw: sonnet.raw,
    usd: sonnet.usd,
    ms: sonnet.ms,
    skipped: false,
  };
}

function normalize(raw: Partial<PredictiveOutput>): PredictiveOutput {
  const pe = raw.predicted_error as Partial<PredictiveOutput["predicted_error"]> | undefined;
  return {
    predicted_error: {
      type: typeof pe?.type === "string" ? pe.type : "none",
      basis: typeof pe?.basis === "string" ? pe.basis : "",
      confidence:
        typeof pe?.confidence === "number" && pe.confidence >= 0 && pe.confidence <= 1
          ? pe.confidence
          : 0,
    },
    recommend_intervene: Boolean(raw.recommend_intervene ?? false),
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "",
  };
}
