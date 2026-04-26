/**
 * Pacer — the only extractor in this directory that doesn't read a source
 * file. Pacer reads the *graph* (the existing claims about a user) and
 * emits forward-looking pacing claims: needs_review_on, mastered_topic,
 * prefers_explanation_style.
 *
 * Why is it shaped like an extractor? Because the same provenance rules
 * apply — every Pacer claim must cite at least one upstream claim's chunk.
 * That's how the dashboard's claim cards stay grounded.
 *
 * For Phase 3 / F3, Pacer is implemented as a deterministic compactor of
 * existing claims, NOT an LLM call. The reasoning is in the comments:
 * we already have an LLM (Intervention Agent) deciding when to act on a
 * weakness, and a second non-deterministic loop would compound errors.
 * A future revision can swap in an LLM if hand-rolled rules over-fit.
 */

import { logger } from "../lib/logger.js";
import { isAllowedFor } from "./predicates.js";
import type {
  Extractor,
  ExtractorContext,
  ExtractorResult,
  SourceKind,
} from "./types.js";

class PacerImpl implements Extractor {
  readonly name = "Pacer" as const;

  /**
   * Pacer is invoked manually from a follow-up endpoint, not on
   * source-file kind. handles() returns false so the dispatcher never
   * picks Pacer for an upload — we expose a separate runPacer() entry
   * point in runner.ts for that.
   */
  handles(_kind: SourceKind): boolean {
    return false;
  }

  /**
   * Stub for the Extractor interface. Real entry point is runPacer().
   * If someone wires this through the dispatcher, they get an empty
   * result, not an error — same shape as a no-op upload.
   */
  async run(ctx: ExtractorContext): Promise<ExtractorResult> {
    logger.warn(
      { ownerId: ctx.ownerId },
      "Pacer.run called via dispatcher; use runPacer() directly",
    );
    return {
      extractor: this.name,
      claims: [],
      errors: [],
      usd: 0,
      ms: 0,
      model: null,
    };
  }
}

export const pacer: Extractor = new PacerImpl();

// Sanity check that runner.ts sees the same allowlist Pacer expects to use.
// This is a cheap dev-time guard — if the predicates table drifts and Pacer
// is suddenly not allowed to write a predicate it relied on, we want loud
// failure, not silent claim drops.
const PACER_PREDICATES = ["needs_review_on", "mastered_topic", "prefers_explanation_style"] as const;
for (const p of PACER_PREDICATES) {
  if (!isAllowedFor("Pacer", p)) {
    throw new Error(`Pacer predicate config drift: ${p} no longer allowed`);
  }
}
