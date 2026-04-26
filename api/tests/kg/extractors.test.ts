/**
 * KG extractor eval (Phase 6 / I2).
 *
 * Gated behind RUN_EVAL=1 — same gate as orchestrator.test.ts. Each scenario
 * runs one real Sonnet JSON call (≈$0.01 per scenario). Total ≈ $0.05/run.
 *
 * Asserts:
 *   - The expected predicates appeared at least once.
 *   - At least one claim's `subject_entity` matches the expected list.
 *   - At least one claim's `object` contains every probe value we baked into
 *     the source text. This is how we tell the LLM read the chunks instead
 *     of hallucinating from the system prompt.
 *   - Every emitted claim respects the extractor's predicate whitelist
 *     (predicates.PREDICATES_BY_EXTRACTOR) — the runner enforces this in
 *     production but we belt-and-suspenders it here.
 *
 * Prints a small per-scenario report at the end so `pnpm eval` is useful
 * without re-reading test names.
 */

import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { extractorScenarios } from "./fixtures.js";
import { transcriptReader } from "../../src/kg/transcript-reader.js";
import { examReader } from "../../src/kg/exam-reader.js";
import { essayReader } from "../../src/kg/essay-reader.js";
import { practiceWorkReader } from "../../src/kg/practice-work-reader.js";
import {
  PREDICATES_BY_EXTRACTOR,
  type Predicate,
  type ExtractorName,
} from "../../src/kg/predicates.js";
import type {
  Extractor,
  ExtractorContext,
  ProposedClaim,
} from "../../src/kg/types.js";

const ENABLED = process.env.RUN_EVAL === "1";
const describeIf = ENABLED ? describe : describe.skip;

const READERS: Record<ExtractorName, Extractor | null> = {
  TranscriptReader: transcriptReader,
  ExamReader: examReader,
  EssayReader: essayReader,
  PracticeWorkReader: practiceWorkReader,
  // The remaining slots aren't tested in this eval — Pacer / Archivist /
  // SyllabusReader have no fixtures here.
  Pacer: null,
  Archivist: null,
  SyllabusReader: null,
};

interface RunReport {
  scenarioId: string;
  extractor: ExtractorName;
  claimCount: number;
  errorCount: number;
  ms: number;
  usd: number;
}
const reports: RunReport[] = [];

describeIf("kg extractor eval (4 scenarios)", () => {
  for (const scenario of extractorScenarios) {
    it(
      `${scenario.id} (${scenario.extractor}) → emits expected predicates`,
      async () => {
        const reader = READERS[scenario.extractor];
        expect(
          reader,
          `no reader bound for ${scenario.extractor}`,
        ).not.toBeNull();

        const ctx: ExtractorContext = {
          ownerId: "fixture-owner",
          sourceFileId: `fixture_${scenario.source_kind}`,
          sourceKind: scenario.source_kind,
          chunks: scenario.chunks,
          sessionId: null,
          cycleId: null,
        };

        const t0 = performance.now();
        const result = await reader!.run(ctx);
        const ms = Math.round(performance.now() - t0);

        reports.push({
          scenarioId: scenario.id,
          extractor: scenario.extractor,
          claimCount: result.claims.length,
          errorCount: result.errors.length,
          ms,
          usd: result.usd,
        });

        // Some claims should have come back. If none did, the prompt failed.
        expect(
          result.claims.length,
          `${scenario.id}: extractor returned 0 claims (errors=${JSON.stringify(
            result.errors,
          )})`,
        ).toBeGreaterThan(0);

        // Predicates must all appear at least once.
        const emittedPredicates = new Set(result.claims.map((c) => c.predicate));
        for (const required of scenario.expected.must_emit) {
          expect(
            emittedPredicates.has(required),
            `${scenario.id}: expected predicate "${required}" was not emitted (got: ${[...emittedPredicates].join(", ")})`,
          ).toBe(true);
        }

        // Every claim must be in the extractor's whitelist.
        const allowed = new Set<string>(
          PREDICATES_BY_EXTRACTOR[scenario.extractor] as readonly Predicate[],
        );
        for (const claim of result.claims) {
          expect(
            allowed.has(claim.predicate),
            `${scenario.id}: predicate "${claim.predicate}" not whitelisted for ${scenario.extractor}`,
          ).toBe(true);
        }

        // Subject entities — at least one claim should match.
        if (scenario.expected.must_subject?.length) {
          const subjects = new Set(
            result.claims.map((c) => c.subject_entity ?? "Student"),
          );
          const hit = scenario.expected.must_subject.some((s) =>
            subjects.has(s),
          );
          expect(
            hit,
            `${scenario.id}: no claim had subject_entity in [${scenario.expected.must_subject.join(", ")}]; got [${[...subjects].join(", ")}]`,
          ).toBe(true);
        }

        // Object probes — every probe must appear in some claim's object.
        if (scenario.expected.must_object_contains?.length) {
          for (const probe of scenario.expected.must_object_contains) {
            const matched = result.claims.some((c) => objectContains(c, probe));
            expect(
              matched,
              `${scenario.id}: no claim object contained probe ${JSON.stringify(probe)}; objects=${result.claims
                .slice(0, 5)
                .map((c) => JSON.stringify(c.object))
                .join(" | ")}`,
            ).toBe(true);
          }
        }

        // Source citation must be a real chunk_id from the fixture.
        const validChunkIds = new Set(scenario.chunks.map((ch) => ch.id));
        for (const claim of result.claims) {
          expect(
            validChunkIds.has(claim.source_chunk_id),
            `${scenario.id}: claim cited unknown chunk_id "${claim.source_chunk_id}"`,
          ).toBe(true);
        }
      },
      90_000,
    );
  }

  it("prints summary report", () => {
    if (!reports.length) return;
    const lines: string[] = [];
    lines.push("");
    lines.push("─── KG extractor eval summary ──────────────────────────────");
    let totalUsd = 0;
    let totalMs = 0;
    for (const r of reports) {
      lines.push(
        `${pad(r.scenarioId, 28)}  ${pad(r.extractor, 20)}  ${pad(
          `${r.claimCount} claims`,
          10,
        )}  ${pad(`${r.errorCount} errs`, 8)}  ${pad(
          `${r.ms}ms`,
          8,
        )}  $${r.usd.toFixed(4)}`,
      );
      totalUsd += r.usd;
      totalMs += r.ms;
    }
    lines.push("─────────────────────────────────────────────────────────────");
    lines.push(
      `TOTAL  scenarios=${reports.length}  ms=${totalMs}  usd=$${totalUsd.toFixed(4)}`,
    );
    lines.push("");
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));

    const reportPath = ".eval/kg.json";
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          scenarios: reports,
          totals: {
            scenarios: reports.length,
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
 * Recursively check whether `probe` appears anywhere in the claim's `object`.
 * String probes match case-insensitive substring; numeric probes match leaf
 * value with a small epsilon.
 */
function objectContains(
  claim: ProposedClaim,
  probe: string | number,
): boolean {
  return walk(claim.object);

  function walk(node: unknown): boolean {
    if (node == null) return false;
    if (typeof node === "string") {
      return typeof probe === "string"
        ? node.toLowerCase().includes(probe.toLowerCase())
        : false;
    }
    if (typeof node === "number") {
      return typeof probe === "number"
        ? Math.abs(node - probe) < 0.01
        : false;
    }
    if (typeof node === "boolean") return false;
    if (Array.isArray(node)) {
      return node.some(walk);
    }
    if (typeof node === "object") {
      for (const v of Object.values(node as Record<string, unknown>)) {
        if (walk(v)) return true;
      }
    }
    return false;
  }
}
