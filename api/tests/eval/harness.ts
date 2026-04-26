/**
 * Orchestrator eval harness (Phase 6 / I1).
 *
 * Replays a `OrchestratorScenario` through the post-OCR portion of the agent
 * pipeline:
 *
 *   evaluateStudent  ∥  runPredictiveAgent
 *                     ↓
 *                  decidePolicy
 *                     ↓
 *               (intervention?)
 *
 * We deliberately skip Mathpix + the OCR Sonnet call — the fixtures already
 * encode what OCR would have produced. Everything downstream is hit by real
 * Anthropic calls when RUN_EVAL=1, which is the whole point of the harness.
 *
 * Returns a `TraceResult` per scenario containing the policy verdict, hint
 * (if any), latency, and accumulated USD. The summarizer over in
 * orchestrator.test.ts uses these to assert structural invariants and to
 * print a small report.
 */

import { evaluateStudent } from "../../src/agents/reasoning.js";
import { runPredictiveAgent } from "../../src/agents/predictive.js";
import { runInterventionAgent } from "../../src/agents/intervention.js";
import {
  decidePolicy,
  isDuplicateHint,
  ribbonForVerdict,
  DEFAULT_PREDICTIVE_THRESHOLD,
  DEFAULT_COOLDOWN_MS,
  type PolicyVerdict,
} from "../../src/agents/policy.js";
import { CycleCost } from "../../src/lib/cost.js";
import type {
  ReasoningOutput,
  PredictiveOutput,
  InterventionOutput,
  TrajectoryFrame,
} from "../../src/agents/types.js";

import type { OrchestratorScenario, ScenarioFrame } from "./fixtures.js";

export interface CycleTrace {
  index: number;
  reasoning: ReasoningOutput | null;
  predictive: PredictiveOutput | null;
  verdict: PolicyVerdict;
  ribbon: ReturnType<typeof ribbonForVerdict>;
  intervention: InterventionOutput | null;
  spoke: boolean;
  ms: number;
  usd: number;
}

export interface TraceResult {
  scenarioId: string;
  category: OrchestratorScenario["category"];
  cycles: CycleTrace[];
  totalUsd: number;
  totalMs: number;
}

/** Build a TrajectoryFrame from a ScenarioFrame at a given index. */
function frameToTrajectory(
  frame: ScenarioFrame,
  index: number,
  prevSpoke: boolean,
  prevHint: string | null,
): TrajectoryFrame {
  return {
    cycle_index: index,
    client_ts: new Date(Date.now() - (1000 * (10 - index))).toISOString(),
    page_state: frame.ocr.page_state,
    current_step_latex: frame.ocr.current_step_latex,
    completed_steps_count: frame.ocr.completed_steps_latex.length,
    step_status: frame.step_status ?? null,
    is_stalled: frame.is_stalled,
    seconds_since_last_change: frame.seconds_since_last_change,
    spoke: prevSpoke,
    hint_text: prevHint,
  };
}

export interface RunOptions {
  /** Throttle: ms between agent calls within one scenario. Avoids RL bursts. */
  betweenCallsMs?: number;
  /** Lower predictive threshold for demo-mode parity tests. */
  predictiveThreshold?: number;
}

/**
 * Replay a single scenario and return the per-cycle trace.
 *
 * Real LLM calls happen inside `evaluateStudent`, `runPredictiveAgent`, and
 * `runInterventionAgent`. RUN_EVAL=1 is the only thing standing between this
 * and a real Anthropic bill — the test runner enforces that gate.
 */
export async function runScenario(
  scenario: OrchestratorScenario,
  opts: RunOptions = {},
): Promise<TraceResult> {
  const t0 = performance.now();
  const cycles: CycleTrace[] = [];
  const trajectory: TrajectoryFrame[] = [];
  const recentHints: { text: string; createdAt: number }[] = [];

  let prevSpoke = false;
  let prevHint: string | null = null;
  let totalUsd = 0;
  const threshold = opts.predictiveThreshold ?? DEFAULT_PREDICTIVE_THRESHOLD;

  for (let i = 0; i < scenario.frames.length; i++) {
    const frame = scenario.frames[i]!;

    const trajectoryFrame = frameToTrajectory(frame, i, prevSpoke, prevHint);
    trajectory.push(trajectoryFrame);
    if (trajectory.length > 5) trajectory.shift();

    const cycleStart = performance.now();
    const cycleCost = new CycleCost();

    // Reasoning + Predictive in parallel — same pattern as orchestrator.
    const [rSettled, pSettled] = await Promise.allSettled([
      evaluateStudent({
        problemText: scenario.problem.text,
        canonical: scenario.problem.canonical,
        ocr: frame.ocr,
        isStalled: frame.is_stalled,
        cost: cycleCost,
      }),
      runPredictiveAgent(
        {
          problemText: scenario.problem.text,
          canonical: scenario.problem.canonical,
          struggleProfile: null,
          trajectory,
          timeOnProblemSeconds: i * 8,
          cost: cycleCost,
        },
        { threshold },
      ),
    ]);

    const reasoning = rSettled.status === "fulfilled" ? rSettled.value.output : null;
    const predictive = pSettled.status === "fulfilled" ? pSettled.value.output : null;

    const cooldownMs =
      recentHints.length > 0
        ? Math.max(0, Date.now() - recentHints[recentHints.length - 1]!.createdAt)
        : Number.MAX_SAFE_INTEGER;

    const verdict = decidePolicy({
      reasoning,
      predictive,
      recentHints,
      isStalled: frame.is_stalled,
      cooldownMs,
      predictiveThreshold: threshold,
    });

    let intervention: InterventionOutput | null = null;
    let spoke = false;

    if (verdict.kind !== "silent" && reasoning) {
      try {
        const r = await runInterventionAgent({
          reasoning,
          recentHints: recentHints.map((h) => h.text),
          cooldownActive: cooldownMs >= 0 && cooldownMs < DEFAULT_COOLDOWN_MS,
          isStalled: frame.is_stalled,
          struggleProfile: null,
          cost: cycleCost,
        });
        intervention = r.output;
      } catch (e) {
        // Mirror the orchestrator: swallow and stay silent.
        intervention = null;
      }

      if (
        intervention &&
        intervention.should_speak &&
        intervention.hint_text &&
        intervention.hint_type
      ) {
        const dup = isDuplicateHint(intervention.hint_text, recentHints);
        if (!dup) {
          spoke = true;
          recentHints.push({
            text: intervention.hint_text,
            createdAt: Date.now(),
          });
          prevHint = intervention.hint_text;
        }
      }
    }
    prevSpoke = spoke;

    const ribbon = ribbonForVerdict(verdict, reasoning, predictive);

    cycles.push({
      index: i,
      reasoning,
      predictive,
      verdict,
      ribbon,
      intervention,
      spoke,
      ms: Math.round(performance.now() - cycleStart),
      usd: cycleCost.total(),
    });
    totalUsd += cycleCost.total();

    if (opts.betweenCallsMs && i < scenario.frames.length - 1) {
      await sleep(opts.betweenCallsMs);
    }
  }

  return {
    scenarioId: scenario.id,
    category: scenario.category,
    cycles,
    totalUsd,
    totalMs: Math.round(performance.now() - t0),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
