/**
 * Step-match: is a student's LaTeX line equivalent to one of the canonical
 * solution's steps?
 *
 * Two paths:
 *   1. Fast path — literal/structural normalization (whitespace, simple
 *      identity rewrites, common LaTeX aliases). No LLM, ~0ms.
 *   2. Slow path — Sonnet equivalence call when the fast path is inconclusive
 *      ("alternate but valid" cases like 2(x+1) vs 2x+2 that we don't want to
 *      hand-implement). Cost ~$0.003.
 *
 * Tests pin the fast path. Slow path is exercised in the eval harness
 * (gated by RUN_EVAL=1).
 */

import { sonnetJson } from "../integrations/anthropic.js";
import { STEP_MATCH_SYSTEM } from "./prompts.js";
import { logger } from "../lib/logger.js";
import type { CycleCost } from "../lib/cost.js";

export type StepMatchResult = {
  equivalent: boolean;
  reason: string;
  source: "literal" | "normalized" | "llm" | "no_match";
};

/**
 * Cheap structural normalization. Catches the >95% of literal "did the student
 * write the same step" cases without paying for a Sonnet call.
 */
export function normalizeLatex(s: string): string {
  if (!s) return "";
  return (
    s
      // collapse all whitespace
      .replace(/\s+/g, "")
      // canonical multiplication marks
      .replace(/\\cdot/g, "*")
      .replace(/\\times/g, "*")
      // strip explicit `\left` / `\right` paren wrappers (cosmetic)
      .replace(/\\left/g, "")
      .replace(/\\right/g, "")
      // drop trailing `=` and `?` punctuation
      .replace(/[?]+$/g, "")
      // unify minus sign variants
      .replace(/\u2212/g, "-")
      .toLowerCase()
  );
}

export function literalEqual(a: string, b: string): boolean {
  return normalizeLatex(a) === normalizeLatex(b);
}

/**
 * Match against ANY of the canonical steps. Used to answer "did the student
 * just write a known canonical step?" — orchestrator uses this to derive
 * "step_status: correct" cheaply when the literal check succeeds.
 */
export function matchAgainstCanonical(
  studentStep: string,
  canonicalSteps: string[],
): StepMatchResult {
  if (!studentStep) return { equivalent: false, reason: "empty student step", source: "no_match" };
  for (const cs of canonicalSteps) {
    if (literalEqual(studentStep, cs)) {
      return { equivalent: true, reason: "literal match", source: "literal" };
    }
  }
  return {
    equivalent: false,
    reason: "no literal canonical match",
    source: "no_match",
  };
}

/**
 * Slow path. Costs a Sonnet call; only invoke when the literal check missed
 * AND we actually need the answer (e.g. the orchestrator is between
 * "minor_error" and "different but valid approach"). Tests skip this without
 * RUN_EVAL=1 because it requires a live API key.
 */
export async function llmEquivalent(opts: {
  a: string;
  b: string;
  cost?: CycleCost;
}): Promise<StepMatchResult> {
  const sonnet = await sonnetJson<{ equivalent: boolean; reason: string }>({
    system: STEP_MATCH_SYSTEM,
    user: `## A\n${opts.a}\n\n## B\n${opts.b}`,
    maxTokens: 200,
  });
  opts.cost?.add("step_match", sonnet.usd);

  if (!sonnet.parsed.ok) {
    logger.warn({ raw: sonnet.raw.slice(0, 200) }, "step-match JSON parse failed");
    return {
      equivalent: false,
      reason: "parse failed",
      source: "llm",
    };
  }

  const { equivalent, reason } = sonnet.parsed.value;
  return {
    equivalent: Boolean(equivalent),
    reason: typeof reason === "string" ? reason : "",
    source: "llm",
  };
}
