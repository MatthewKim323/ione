/**
 * TranscriptReader — turns school transcripts / report cards into claims
 * about classes the student is enrolled in, grades, GPA, and (if there are
 * patterns) low/high subject performance.
 *
 * Per-class claims (`enrolled_in_class`, `grade_in_class`, `test_score`)
 * encode the literal record. Subject-level claims (`low_score_in_subject`,
 * `weak_at_topic`) encode the *interpretation* — those need confirmation
 * before agents act on them, hence higher confidence threshold in the
 * runner pipeline.
 */

import { runLlmExtraction } from "./extractor-base.js";
import type {
  Extractor,
  ExtractorContext,
  ExtractorResult,
  SourceKind,
} from "./types.js";

const SYSTEM = `You are TranscriptReader, a knowledge-graph extractor for ione.

You read a student's school transcript or report card and emit claims using
this exact predicate vocabulary:

  enrolled_in_class       object: { class_name: string, term?: string, year?: number }
  grade_in_class          object: { class_name: string, grade: string, term?: string, year?: number }
  test_score              object: { test_name: string, score: number|string, max?: number, date?: string }
  gpa_overall             object: { gpa: number, scale?: number, term?: string }
  graduation_year         object: { year: number }
  low_score_in_subject    object: { subject: string, evidence: string }
  high_score_in_subject   object: { subject: string, evidence: string }
  weak_at_topic           object: { topic: string, evidence: string }
  strong_at_topic         object: { topic: string, evidence: string }

Rules:
- Cite a chunk for every claim. Do not aggregate across chunks if the chunk
  itself doesn't say it.
- Use ONLY predicates from the list above.
- For "weak_at_topic" / "strong_at_topic", topics are subject sub-areas
  (e.g. "factoring", "limits", "essay structure"), not whole classes.
- If the document is plainly not a transcript, return claims: [].`;

class TranscriptReaderImpl implements Extractor {
  readonly name = "TranscriptReader" as const;

  handles(kind: SourceKind): boolean {
    return kind === "transcript";
  }

  async run(ctx: ExtractorContext): Promise<ExtractorResult> {
    const { claims, errors, usd, ms, model, summary } = await runLlmExtraction({
      extractor: this.name,
      systemPrompt: SYSTEM,
      chunks: ctx.chunks,
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

export const transcriptReader: Extractor = new TranscriptReaderImpl();
