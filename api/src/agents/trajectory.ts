/**
 * Trajectory utility — pure TypeScript, no LLM. The browser keeps a rolling
 * 5-frame buffer locally (so the API can be stateless) and ships it on every
 * /api/cycle request. This module owns the canonical shape & the
 * per-trajectory derived signals (velocity, recent activity).
 */

import type { TrajectoryFrame, StepStatus } from "./types.js";

/** Default buffer size — keep tight; 5 frames * ~8s = ~40s of context. */
export const TRAJECTORY_MAX_FRAMES = 5;

/** Append a frame, dropping the oldest when over capacity. Pure / immutable. */
export function appendFrame(
  prev: TrajectoryFrame[],
  next: TrajectoryFrame,
): TrajectoryFrame[] {
  const merged = [...prev, next];
  return merged.slice(Math.max(0, merged.length - TRAJECTORY_MAX_FRAMES));
}

/** True when zero frames in the trajectory differ from the most recent one. */
export function isStaticTrajectory(frames: TrajectoryFrame[]): boolean {
  if (frames.length < 2) return false;
  const last = frames[frames.length - 1]!;
  return frames.every(
    (f) =>
      f.current_step_latex === last.current_step_latex &&
      f.completed_steps_count === last.completed_steps_count,
  );
}

/** Did the student commit a new completed step in the last `windowMs`? */
export function recentCommitWithin(
  frames: TrajectoryFrame[],
  windowMs: number,
): boolean {
  if (frames.length < 2) return false;
  const last = frames[frames.length - 1]!;
  const lastTs = Date.parse(last.client_ts);
  for (let i = frames.length - 2; i >= 0; i--) {
    const f = frames[i]!;
    const ts = Date.parse(f.client_ts);
    if (Number.isNaN(ts) || lastTs - ts > windowMs) break;
    if (f.completed_steps_count < last.completed_steps_count) return true;
  }
  return false;
}

/**
 * Coarse "velocity" signal — completed steps per minute over the trajectory.
 * Used by the ribbon's slow-tempo cue and the predictive agent's prompt.
 */
export function stepsPerMinute(frames: TrajectoryFrame[]): number {
  if (frames.length < 2) return 0;
  const first = frames[0]!;
  const last = frames[frames.length - 1]!;
  const dtMin = (Date.parse(last.client_ts) - Date.parse(first.client_ts)) / 60000;
  if (!isFinite(dtMin) || dtMin <= 0) return 0;
  const dSteps = last.completed_steps_count - first.completed_steps_count;
  return Math.max(0, dSteps) / dtMin;
}

/** Most recent reasoning-agent verdict, or null if the buffer is empty. */
export function lastStepStatus(
  frames: TrajectoryFrame[],
): StepStatus | null {
  if (!frames.length) return null;
  return frames[frames.length - 1]!.step_status;
}

/**
 * Serialize a trajectory into the `Trajectory` block that the predictive
 * agent's prompt expects. Maps our schema → the predictive prompt's schema
 * (stage, student_work_so_far_latex, current_partial_step, etc.).
 */
export function serializePredictiveTrajectory(opts: {
  frames: TrajectoryFrame[];
  timeOnProblemSeconds: number;
}): {
  stage: "stage_1" | "stage_2" | "stage_3";
  student_work_so_far_latex: string[];
  current_partial_step: string;
  time_on_problem_seconds: number;
  behavioral_indicators: {
    pen_lifted_seconds: number;
    looking_at_problem: boolean;
    wrote_anything_in_last_8s: boolean;
  };
} {
  const last = opts.frames[opts.frames.length - 1];
  if (!last) {
    return {
      stage: "stage_1",
      student_work_so_far_latex: [],
      current_partial_step: "",
      time_on_problem_seconds: opts.timeOnProblemSeconds,
      behavioral_indicators: {
        pen_lifted_seconds: 0,
        looking_at_problem: true,
        wrote_anything_in_last_8s: false,
      },
    };
  }

  const completedCount = last.completed_steps_count;
  const stage: "stage_1" | "stage_2" | "stage_3" =
    completedCount === 0 && (last.current_step_latex ?? "") === ""
      ? "stage_1"
      : completedCount > 0
        ? "stage_3"
        : "stage_2";

  const wroteRecently =
    !last.is_stalled && last.seconds_since_last_change <= 8;

  return {
    stage,
    student_work_so_far_latex: [], // owned by the orchestrator from the OCR result
    current_partial_step: last.current_step_latex ?? "",
    time_on_problem_seconds: opts.timeOnProblemSeconds,
    behavioral_indicators: {
      pen_lifted_seconds: last.seconds_since_last_change,
      looking_at_problem: true,
      wrote_anything_in_last_8s: wroteRecently,
    },
  };
}

/**
 * The prediction window is "open" when the student has not yet committed the
 * about-to-be-wrong step. We close it as soon as the trajectory shows a step
 * of `step_status` minor/major/off_track — at that point reasoning owns it.
 */
export function isPredictionWindowOpen(frames: TrajectoryFrame[]): boolean {
  if (!frames.length) return true;
  const last = frames[frames.length - 1]!;
  const closed =
    last.step_status === "minor_error" ||
    last.step_status === "major_error" ||
    last.step_status === "off_track" ||
    last.step_status === "complete";
  return !closed;
}
