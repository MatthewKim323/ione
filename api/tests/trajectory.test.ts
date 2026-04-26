import { describe, it, expect } from "vitest";
import {
  appendFrame,
  isStaticTrajectory,
  recentCommitWithin,
  stepsPerMinute,
  lastStepStatus,
  isPredictionWindowOpen,
  serializePredictiveTrajectory,
  TRAJECTORY_MAX_FRAMES,
} from "../src/agents/trajectory.js";
import type { TrajectoryFrame, StepStatus } from "../src/agents/types.js";

const f = (
  i: number,
  override: Partial<TrajectoryFrame> = {},
): TrajectoryFrame => ({
  cycle_index: i,
  client_ts: new Date(1_700_000_000_000 + i * 8000).toISOString(),
  page_state: "in_progress",
  current_step_latex: null,
  completed_steps_count: 0,
  step_status: "correct",
  is_stalled: false,
  seconds_since_last_change: 0,
  spoke: false,
  hint_text: null,
  ...override,
});

describe("appendFrame", () => {
  it("trims to TRAJECTORY_MAX_FRAMES", () => {
    let frames: TrajectoryFrame[] = [];
    for (let i = 0; i < TRAJECTORY_MAX_FRAMES + 3; i++) {
      frames = appendFrame(frames, f(i));
    }
    expect(frames).toHaveLength(TRAJECTORY_MAX_FRAMES);
    expect(frames[0]!.cycle_index).toBe(3);
    expect(frames[frames.length - 1]!.cycle_index).toBe(
      TRAJECTORY_MAX_FRAMES + 2,
    );
  });

  it("is immutable", () => {
    const a: TrajectoryFrame[] = [f(0)];
    const b = appendFrame(a, f(1));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(2);
  });
});

describe("isStaticTrajectory", () => {
  it("false when fewer than 2 frames", () => {
    expect(isStaticTrajectory([f(0)])).toBe(false);
  });
  it("true when every frame matches the last", () => {
    const frames = [
      f(0, { current_step_latex: "x=1", completed_steps_count: 2 }),
      f(1, { current_step_latex: "x=1", completed_steps_count: 2 }),
      f(2, { current_step_latex: "x=1", completed_steps_count: 2 }),
    ];
    expect(isStaticTrajectory(frames)).toBe(true);
  });
  it("false when current_step_latex changed", () => {
    const frames = [
      f(0, { current_step_latex: "x=1", completed_steps_count: 2 }),
      f(1, { current_step_latex: "x=2", completed_steps_count: 2 }),
    ];
    expect(isStaticTrajectory(frames)).toBe(false);
  });
});

describe("recentCommitWithin", () => {
  it("true when steps committed inside window", () => {
    const frames = [
      f(0, { completed_steps_count: 1 }),
      f(1, { completed_steps_count: 2 }),
    ];
    expect(recentCommitWithin(frames, 30_000)).toBe(true);
  });
  it("false when nothing changed", () => {
    const frames = [
      f(0, { completed_steps_count: 2 }),
      f(1, { completed_steps_count: 2 }),
    ];
    expect(recentCommitWithin(frames, 30_000)).toBe(false);
  });
});

describe("stepsPerMinute", () => {
  it("returns 0 for short trajectories", () => {
    expect(stepsPerMinute([f(0)])).toBe(0);
  });
  it("computes positive rate", () => {
    const frames = [
      f(0, { completed_steps_count: 0 }),
      f(7, { completed_steps_count: 1 }),
    ];
    // 7 cycles * 8s = 56s, 1 step → 1/0.933 ≈ 1.07 step/min
    const r = stepsPerMinute(frames);
    expect(r).toBeGreaterThan(0.9);
    expect(r).toBeLessThan(1.2);
  });
});

describe("lastStepStatus", () => {
  it("returns null on empty buffer", () => {
    expect(lastStepStatus([])).toBe(null);
  });
  it("returns last frame's status", () => {
    const frames = [
      f(0, { step_status: "correct" }),
      f(1, { step_status: "minor_error" as StepStatus }),
    ];
    expect(lastStepStatus(frames)).toBe("minor_error");
  });
});

describe("isPredictionWindowOpen", () => {
  it("open with empty buffer", () => {
    expect(isPredictionWindowOpen([])).toBe(true);
  });
  it("closed after error", () => {
    expect(isPredictionWindowOpen([f(0, { step_status: "minor_error" })])).toBe(
      false,
    );
    expect(isPredictionWindowOpen([f(0, { step_status: "off_track" })])).toBe(
      false,
    );
    expect(isPredictionWindowOpen([f(0, { step_status: "complete" })])).toBe(
      false,
    );
  });
  it("open while still correct/stalled", () => {
    expect(isPredictionWindowOpen([f(0, { step_status: "correct" })])).toBe(
      true,
    );
    expect(isPredictionWindowOpen([f(0, { step_status: "stalled" })])).toBe(
      true,
    );
  });
});

describe("serializePredictiveTrajectory", () => {
  it("produces stage_1 for empty current_step + 0 completed", () => {
    const t = serializePredictiveTrajectory({
      frames: [
        f(0, {
          completed_steps_count: 0,
          current_step_latex: "",
          seconds_since_last_change: 6,
          is_stalled: false,
        }),
      ],
      timeOnProblemSeconds: 14,
    });
    expect(t.stage).toBe("stage_1");
    expect(t.behavioral_indicators.wrote_anything_in_last_8s).toBe(true);
    expect(t.time_on_problem_seconds).toBe(14);
  });

  it("returns empty defaults on empty trajectory", () => {
    const t = serializePredictiveTrajectory({
      frames: [],
      timeOnProblemSeconds: 0,
    });
    expect(t.stage).toBe("stage_1");
    expect(t.current_partial_step).toBe("");
  });
});
