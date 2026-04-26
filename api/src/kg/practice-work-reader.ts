/**
 * PracticeWorkReader — turns ungraded scratch work / homework into claims
 * about *kinds of mistakes* and *topic strengths*.
 *
 * Differs from ExamReader because there's no formal score — we extract
 * patterns of error rather than missed-problem records. This is closer to
 * how the Reasoning Agent thinks during a tutor cycle.
 */

import { runLlmExtraction } from "./extractor-base.js";
import type {
  Extractor,
  ExtractorContext,
  ExtractorResult,
  SourceKind,
} from "./types.js";

const SYSTEM = `You are PracticeWorkReader, a knowledge-graph extractor for ione.

You read uploaded student practice work / homework / scratch work and emit
claims using this predicate vocabulary:

  made_sign_error         object: { context: string, evidence: string }
  made_arithmetic_error   object: { context: string, evidence: string }
  made_concept_gap        object: { context: string, concept: string, evidence: string }
  skipped_step            object: { context: string, what_was_skipped: string }
  weak_at_topic           object: { topic: string, evidence: string }
  strong_at_topic         object: { topic: string, evidence: string }
  needs_review_on         object: { topic: string, urgency?: "low"|"medium"|"high" }
  correct_problem_on      object: { problem_label: string, topic?: string }

Rules:
- Cite a chunk_index for every claim.
- Topic claims should be specific ("factoring quadratics", not "algebra").
- If a chunk shows mostly correct work, emit strong_at_topic, not just
  "no error claims" — the absence of evidence is its own signal.
- Don't double-count: if a sign error is already represented as a
  concept gap, pick the more specific predicate.
- If the document isn't math/practice work, return claims: [].`;

class PracticeWorkReaderImpl implements Extractor {
  readonly name = "PracticeWorkReader" as const;

  handles(kind: SourceKind): boolean {
    return kind === "practice_work";
  }

  async run(ctx: ExtractorContext): Promise<ExtractorResult> {
    const { claims, errors, usd, ms, model, summary } = await runLlmExtraction({
      extractor: this.name,
      systemPrompt: SYSTEM,
      chunks: ctx.chunks,
      maxClaims: 24,
    });
    return {
      extractor: this.name,
      claims,
      errors,
      usd,
      ms,
      model: model || null,
      summary,
    };
  }
}

export const practiceWorkReader: Extractor = new PracticeWorkReaderImpl();
