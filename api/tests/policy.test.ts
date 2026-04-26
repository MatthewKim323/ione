import { describe, it, expect } from "vitest";
import {
  decidePolicy,
  isDuplicateHint,
  ribbonForVerdict,
  DEFAULT_COOLDOWN_MS,
} from "../src/agents/policy.js";
import type { ReasoningOutput, PredictiveOutput } from "../src/agents/types.js";

const reasoning = (
  partial: Partial<ReasoningOutput> = {},
): ReasoningOutput => ({
  step_status: "correct",
  error_type: null,
  error_location: null,
  severity: 1,
  what_they_should_do_next: "",
  scaffolding_question: null,
  matches_known_error_pattern: false,
  ...partial,
});

const predictive = (
  partial: Partial<PredictiveOutput["predicted_error"]> & {
    recommend_intervene?: boolean;
    reasoning?: string;
  } = {},
): PredictiveOutput => ({
  predicted_error: {
    type: partial.type ?? "sign_error",
    basis: partial.basis ?? "",
    confidence: partial.confidence ?? 0,
  },
  recommend_intervene: partial.recommend_intervene ?? false,
  reasoning: partial.reasoning ?? "",
});

describe("decidePolicy", () => {
  it("stays silent when step is correct", () => {
    const v = decidePolicy({
      reasoning: reasoning({ step_status: "correct" }),
      predictive: null,
      recentHints: [],
      isStalled: false,
      cooldownMs: DEFAULT_COOLDOWN_MS + 1,
    });
    expect(v.kind).toBe("silent");
  });

  it("treats `complete` as speak_reactive (final-answer beat)", () => {
    const v = decidePolicy({
      reasoning: reasoning({ step_status: "complete" }),
      predictive: null,
      recentHints: [],
      isStalled: false,
      cooldownMs: DEFAULT_COOLDOWN_MS + 1,
    });
    expect(v.kind).toBe("speak_reactive");
  });

  it("speaks predictive when threshold is met and no cooldown", () => {
    const v = decidePolicy({
      reasoning: reasoning({ step_status: "minor_error", severity: 1 }),
      predictive: predictive({
        confidence: 0.92,
        recommend_intervene: true,
      }),
      recentHints: [],
      isStalled: false,
      cooldownMs: DEFAULT_COOLDOWN_MS + 5_000,
    });
    expect(v.kind).toBe("speak_predictive");
  });

  it("suppresses predictive in cooldown", () => {
    const v = decidePolicy({
      reasoning: reasoning({ step_status: "minor_error", severity: 1 }),
      predictive: predictive({
        confidence: 0.92,
        recommend_intervene: true,
      }),
      recentHints: [],
      isStalled: false,
      cooldownMs: 5_000,
    });
    // predictive falls through, minor_error sev1 → silent
    expect(v.kind).toBe("silent");
  });

  it("respects predictiveThreshold override", () => {
    const v = decidePolicy({
      reasoning: reasoning({ step_status: "minor_error", severity: 1 }),
      predictive: predictive({
        confidence: 0.55,
        recommend_intervene: true,
      }),
      recentHints: [],
      isStalled: false,
      cooldownMs: DEFAULT_COOLDOWN_MS + 5_000,
      predictiveThreshold: 0.5,
    });
    expect(v.kind).toBe("speak_predictive");
  });

  it("speaks scaffolding when stalled", () => {
    const v = decidePolicy({
      reasoning: reasoning({ step_status: "stalled", severity: 3 }),
      predictive: null,
      recentHints: [],
      isStalled: true,
      cooldownMs: 5_000, // even in cooldown — stall override
    });
    expect(v.kind).toBe("speak_reactive");
  });

  it("speaks immediately on major_error outside cooldown", () => {
    const v = decidePolicy({
      reasoning: reasoning({ step_status: "major_error", severity: 4 }),
      predictive: null,
      recentHints: [],
      isStalled: false,
      cooldownMs: DEFAULT_COOLDOWN_MS + 5_000,
    });
    expect(v.kind).toBe("speak_reactive");
  });

  it("suppresses major_error under cooldown when severity<5", () => {
    const v = decidePolicy({
      reasoning: reasoning({ step_status: "major_error", severity: 4 }),
      predictive: null,
      recentHints: [],
      isStalled: false,
      cooldownMs: 10_000,
    });
    expect(v.kind).toBe("silent");
  });

  it("breaks cooldown when severity is 5", () => {
    const v = decidePolicy({
      reasoning: reasoning({ step_status: "major_error", severity: 5 }),
      predictive: null,
      recentHints: [],
      isStalled: false,
      cooldownMs: 10_000,
    });
    expect(v.kind).toBe("speak_reactive");
  });

  it("silences minor_error severity 1-2", () => {
    for (const severity of [1, 2] as const) {
      const v = decidePolicy({
        reasoning: reasoning({ step_status: "minor_error", severity }),
        predictive: null,
        recentHints: [],
        isStalled: false,
        cooldownMs: DEFAULT_COOLDOWN_MS + 1,
      });
      expect(v.kind).toBe("silent");
    }
  });

  it("speaks minor_error severity 3 when no cooldown", () => {
    const v = decidePolicy({
      reasoning: reasoning({ step_status: "minor_error", severity: 3 }),
      predictive: null,
      recentHints: [],
      isStalled: false,
      cooldownMs: DEFAULT_COOLDOWN_MS + 1,
    });
    expect(v.kind).toBe("speak_reactive");
  });

  it("off_track speaks (treated like major_error path)", () => {
    const v = decidePolicy({
      reasoning: reasoning({ step_status: "off_track", severity: 4 }),
      predictive: null,
      recentHints: [],
      isStalled: false,
      cooldownMs: DEFAULT_COOLDOWN_MS + 1,
    });
    expect(v.kind).toBe("speak_reactive");
  });
});

describe("isDuplicateHint", () => {
  it("flags exact repeats", () => {
    expect(
      isDuplicateHint("Check the sign on the second term.", [
        { text: "check the sign on the second term." },
      ]),
    ).toBe(true);
  });

  it("normalizes whitespace and case", () => {
    expect(
      isDuplicateHint("  CHECK   the sign on the SECOND term.  ", [
        { text: "Check the sign on the second term." },
      ]),
    ).toBe(true);
  });

  it("does not flag novel hints", () => {
    expect(
      isDuplicateHint("Watch the distribution.", [
        { text: "Check the sign on the second term." },
      ]),
    ).toBe(false);
  });

  it("treats empty candidate as duplicate (so we never speak empty)", () => {
    expect(isDuplicateHint("", [])).toBe(true);
  });
});

describe("ribbonForVerdict", () => {
  it("predictive high → sienna", () => {
    const r = ribbonForVerdict(
      { kind: "speak_predictive", reason: "" },
      reasoning(),
      predictive({ confidence: 0.92, recommend_intervene: true }),
    );
    expect(r).toBe("sienna");
  });

  it("predictive medium → sienna_soft", () => {
    const r = ribbonForVerdict(
      { kind: "speak_predictive", reason: "" },
      reasoning(),
      predictive({ confidence: 0.72, recommend_intervene: true }),
    );
    expect(r).toBe("sienna_soft");
  });

  it("speak_reactive sev≥4 → sienna", () => {
    const r = ribbonForVerdict(
      { kind: "speak_reactive", reason: "" },
      reasoning({ severity: 4, step_status: "major_error" }),
      null,
    );
    expect(r).toBe("sienna");
  });

  it("silent + correct → moss", () => {
    const r = ribbonForVerdict(
      { kind: "silent", reason: "" },
      reasoning({ step_status: "correct" }),
      null,
    );
    expect(r).toBe("moss");
  });

  it("silent + minor_error → graphite", () => {
    const r = ribbonForVerdict(
      { kind: "silent", reason: "" },
      reasoning({ step_status: "minor_error", severity: 2 }),
      null,
    );
    expect(r).toBe("graphite");
  });
});
