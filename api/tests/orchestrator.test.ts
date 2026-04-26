/**
 * Orchestrator eval (Phase 6 / I1).
 *
 * Gated behind RUN_EVAL=1 because each scenario fans out 4-7 real Anthropic
 * calls × 15 scenarios. Running once costs ~$0.50–$1.00 depending on how
 * verbose the agents are that day. CI runs vitest *without* RUN_EVAL so this
 * file is a no-op there.
 *
 * Asserts structural invariants only:
 *   - clean traces should NOT trip a `speak_reactive` mid-trace (a `complete`
 *     beat is fine on the last cycle).
 *   - slip traces should produce at least one speak verdict somewhere in the
 *     trace (we caught the error or predicted it).
 *   - stuck traces should produce at least one speak_reactive verdict because
 *     stalls are deterministic — no LLM wiggle room.
 *
 * It also prints a tiny per-scenario report (latency / USD / verdicts) so
 * `pnpm eval` is useful for the human running it.
 */

import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { runScenario, type TraceResult } from "./eval/harness.js";
import { scenarios, type ExpectedVerdict } from "./eval/fixtures.js";

const ENABLED = process.env.RUN_EVAL === "1";

const describeIf = ENABLED ? describe : describe.skip;

describeIf("orchestrator eval (15 scenarios)", () => {
  // Track totals across all scenarios for a final report.
  const results: TraceResult[] = [];

  for (const scenario of scenarios) {
    it(
      `${scenario.id} (${scenario.category}) → matches expected verdict shape`,
      async () => {
        const result = await runScenario(scenario, { betweenCallsMs: 250 });
        results.push(result);

        // Always: at least one cycle ran.
        expect(result.cycles.length).toBe(scenario.frames.length);

        // Final cycle verdict shape check.
        const last = result.cycles[result.cycles.length - 1]!;
        assertVerdictShape(last.verdict.kind, scenario.expected.final_verdict);

        // Trace-wide invariants.
        if (scenario.expected.must_speak_at_least_once) {
          const spokeAtLeastOnce = result.cycles.some((c) => c.spoke);
          expect(
            spokeAtLeastOnce,
            `${scenario.id}: expected at least one speak verdict but every cycle was silent`,
          ).toBe(true);
        }
        if (scenario.expected.must_stay_silent_throughout) {
          const everSpoke = result.cycles.some((c) => c.spoke);
          expect(
            everSpoke,
            `${scenario.id}: expected silence throughout but a hint surfaced`,
          ).toBe(false);
        }
      },
      // 90s per scenario — generous because each scenario can fan out 5+
      // sequential LLM calls including intervention.
      90_000,
    );
  }

  it("prints summary report", () => {
    if (!results.length) return;

    const lines: string[] = [];
    lines.push("");
    lines.push("─── Orchestrator eval summary ──────────────────────────────");
    let totalUsd = 0;
    let totalMs = 0;
    for (const r of results) {
      const verdicts = r.cycles
        .map((c) => c.verdict.kind.replace("speak_", "→"))
        .join(", ");
      lines.push(
        `${pad(r.scenarioId, 28)}  ${pad(r.category, 6)}  ${pad(
          `${r.totalMs}ms`,
          8,
        )}  ${pad(`$${r.totalUsd.toFixed(4)}`, 10)}  ${verdicts}`,
      );
      totalUsd += r.totalUsd;
      totalMs += r.totalMs;
    }
    lines.push("─────────────────────────────────────────────────────────────");
    lines.push(
      `TOTAL  scenarios=${results.length}  ms=${totalMs}  usd=$${totalUsd.toFixed(4)}`,
    );
    lines.push("");
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));

    const reportPath = ".eval/orchestrator.json";
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          scenarios: results.map((r) => ({
            scenario_id: r.scenarioId,
            category: r.category,
            cycles: r.cycles.map((c) => ({
              verdict: c.verdict.kind,
              spoke: c.spoke,
              latency_ms: c.ms,
              usd: c.usd,
            })),
            total_ms: r.totalMs,
            total_usd: r.totalUsd,
          })),
          totals: {
            scenarios: results.length,
            ms: totalMs,
            usd: totalUsd,
          },
        },
        null,
        2,
      ),
    );
  });
});

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

/**
 * The eval is permissive about which speak verdict fires when we expect "some
 * kind of speak". Predictive vs reactive depends on whether the trajectory
 * crosses the prediction window before the slip lands — both are valid.
 */
function assertVerdictShape(
  actual: "silent" | "speak_predictive" | "speak_reactive",
  expected: ExpectedVerdict,
): void {
  switch (expected.kind) {
    case "silent":
      if (expected.allow_speak) {
        // Either silent or speak (e.g. final-answer congrats) is fine.
        return;
      }
      expect(actual).toBe("silent");
      return;
    case "speak_predictive":
      expect(actual).toBe("speak_predictive");
      return;
    case "speak_reactive":
      expect(actual).toBe("speak_reactive");
      return;
    case "speak_either":
      expect(["speak_predictive", "speak_reactive"]).toContain(actual);
      return;
  }
}
