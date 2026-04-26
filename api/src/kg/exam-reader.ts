/**
 * ExamReader — turns a graded exam (failed or otherwise) into claims about
 * what went wrong on it. This is THE highest-leverage extractor for the
 * tutor: the Intervention Agent literally cites these claims when warning
 * the student before they re-make an old mistake.
 *
 * Why so many predicates? An exam contains both *raw record* facts
 * (scored_on_exam, missed_problem_on) and *diagnostic* facts
 * (made_sign_error, weak_at_topic). The former are low-confidence-OK,
 * the latter need higher confidence to be trusted at hint time.
 */

import { runLlmExtraction } from "./extractor-base.js";
import type {
  Extractor,
  ExtractorContext,
  ExtractorResult,
  SourceKind,
} from "./types.js";

const SYSTEM = `You are ExamReader, a knowledge-graph extractor for ione.

You read a graded exam (math, writing, etc., usually one the student didn't
do well on) and emit claims using this predicate vocabulary:

  scored_on_exam          object: { test_name: string, score: number|string, max?: number, percent?: number, date?: string }
  test_score              object: { test_name: string, score: number|string, max?: number, date?: string }
  missed_problem_on       object: { test_name: string, problem_label: string, topic?: string, points_lost?: number }
  correct_problem_on      object: { test_name: string, problem_label: string, topic?: string }
  made_sign_error         object: { context: string, evidence: string }
  made_arithmetic_error   object: { context: string, evidence: string }
  made_concept_gap        object: { context: string, concept: string, evidence: string }
  skipped_step            object: { context: string, what_was_skipped: string }
  misread_problem         object: { problem_label: string, what_they_misread: string }
  ran_out_of_time         object: { test_name: string, evidence: string }
  weak_at_topic           object: { topic: string, evidence: string }
  unfamiliar_with_topic   object: { topic: string, evidence: string }
  needs_review_on         object: { topic: string, urgency?: "low"|"medium"|"high" }

Rules:
- ALWAYS cite a chunk_index for every claim.
- Topics are short ("factoring quadratics", "limits at infinity"), never
  whole classes.
- If the same error happens in 3+ problems, also emit one weak_at_topic
  rolling that up — but use a separate claim with confidence ≥ 0.7.
- Don't speculate. If the chunk doesn't actually show a sign error, don't
  emit one.
- If the document is plainly not an exam, return claims: [].`;

class ExamReaderImpl implements Extractor {
  readonly name = "ExamReader" as const;

  handles(kind: SourceKind): boolean {
    return kind === "failed_exam";
  }

  async run(ctx: ExtractorContext): Promise<ExtractorResult> {
    const { claims, errors, usd, ms, model, summary } = await runLlmExtraction({
      extractor: this.name,
      systemPrompt: SYSTEM,
      chunks: ctx.chunks,
      maxClaims: 30,
      maxTokens: 2000,
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

export const examReader: Extractor = new ExamReaderImpl();
