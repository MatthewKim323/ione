/**
 * SyllabusReader — turns a class syllabus into claims about the current
 * unit / pacing / teacher. Lean intentionally: most syllabus info is not
 * what we want to remember at hint time. The high-value bits are
 *  (a) what unit they're in *right now*, so the tutor knows the topic
 *      vocabulary the student has already seen, and
 *  (b) who the teacher is, in case the student drops their teacher's name
 *      ("Mrs. Patel said…") in a future cycle.
 */

import { runLlmExtraction } from "./extractor-base.js";
import type {
  Extractor,
  ExtractorContext,
  ExtractorResult,
  SourceKind,
} from "./types.js";

const SYSTEM = `You are SyllabusReader, a knowledge-graph extractor for ione.

You read a class syllabus and emit claims using this predicate vocabulary:

  current_unit  object: { class_name: string, unit: string, week_of?: string,
                          due_dates?: Array<{ item: string, date: string }> }
  teacher_is    object: { class_name: string, teacher_name: string }

Rules:
- Cite a chunk_index for every claim.
- Pick the *current* unit, not all units in the document. If the syllabus
  is undated and shows the whole semester, emit one current_unit per unit
  ONLY if the chunk explicitly says "Week of X" or similar.
- Don't extract policies, attendance rules, or grading scales — those
  aren't in our predicate vocabulary.
- If the document is not a syllabus, return claims: [].`;

class SyllabusReaderImpl implements Extractor {
  readonly name = "SyllabusReader" as const;

  handles(kind: SourceKind): boolean {
    return kind === "syllabus";
  }

  async run(ctx: ExtractorContext): Promise<ExtractorResult> {
    const { claims, errors, usd, ms, model, summary } = await runLlmExtraction({
      extractor: this.name,
      systemPrompt: SYSTEM,
      chunks: ctx.chunks,
      maxClaims: 12,
      maxTokens: 1000,
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

export const syllabusReader: Extractor = new SyllabusReaderImpl();
