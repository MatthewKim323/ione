import { describe, it, expect } from "vitest";
import { compileStruggleProfile } from "../src/lib/memory.js";

type ClaimRow = {
  predicate: string;
  object: unknown;
  status: string;
  confidence: number;
  reasoning: string | null;
  created_at: string;
};

function claim(partial: Partial<ClaimRow> & { predicate: string }): ClaimRow {
  return {
    object: null,
    status: "confirmed",
    confidence: 1,
    reasoning: null,
    created_at: "2025-04-25T00:00:00Z",
    ...partial,
  };
}

describe("compileStruggleProfile", () => {
  it("renders empty profile when nothing is known", () => {
    const out = compileStruggleProfile([], null);
    expect(out.pattern_summary).toBe("No prior pattern observed yet.");
    expect(out.error_type).toBe("none observed");
    expect(out.frequency).toBe("none");
    expect(out.examples).toEqual([]);
  });

  it("includes grade + class from profile row", () => {
    const out = compileStruggleProfile([], {
      grade: "10",
      current_class: "algebra_2",
      hint_frequency: "balanced",
    });
    expect(out.pattern_summary).toContain("grade 10");
    expect(out.pattern_summary).toContain("algebra 2");
    expect(out.tutor_notes).toContain("balanced");
  });

  it("aggregates weak topics + dominant error type", () => {
    const claims: ClaimRow[] = [
      claim({ predicate: "weak_at_topic", object: "factoring" }),
      claim({ predicate: "weak_at_topic", object: { value: "fractions" } }),
      claim({
        predicate: "made_sign_error",
        reasoning: "dropped negative sign",
      }),
      claim({
        predicate: "made_sign_error",
        reasoning: "wrong sign on coefficient",
      }),
      claim({ predicate: "skipped_step", reasoning: "skipped distribution" }),
    ];
    const out = compileStruggleProfile(claims, null);
    expect(out.pattern_summary).toMatch(/factoring/);
    expect(out.pattern_summary).toMatch(/fractions/);
    expect(out.error_type).toBe("sign error");
    expect(out.frequency).toBe("occasional");
    expect(out.examples.length).toBeGreaterThan(0);
    expect(out.tutor_notes).toMatch(/skipped step/);
  });

  it("ignores low-confidence pending claims but accepts high-confidence pending", () => {
    const claims: ClaimRow[] = [
      claim({
        predicate: "weak_at_topic",
        object: "ignored",
        status: "pending",
        confidence: 0.4,
      }),
      claim({
        predicate: "weak_at_topic",
        object: "kept",
        status: "pending",
        confidence: 0.9,
      }),
    ];
    const out = compileStruggleProfile(claims, null);
    expect(out.pattern_summary).toContain("kept");
    expect(out.pattern_summary).not.toContain("ignored");
  });

  it("caps the rendered summary length", () => {
    const claims: ClaimRow[] = Array.from({ length: 30 }, (_, i) =>
      claim({
        predicate: "weak_at_topic",
        object: `topic_${i.toString().padStart(2, "0")}_with_a_long_name`,
      }),
    );
    const out = compileStruggleProfile(claims, null);
    expect(out.pattern_summary.length).toBeLessThanOrEqual(481);
  });

  it("frequency word climbs with error count", () => {
    const claims: ClaimRow[] = Array.from({ length: 5 }, () =>
      claim({ predicate: "made_sign_error", reasoning: "x" }),
    );
    const out = compileStruggleProfile(claims, null);
    expect(out.frequency).toBe("frequent");
  });
});
