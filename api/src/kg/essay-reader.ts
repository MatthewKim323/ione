/**
 * EssayReader — turns a writing sample into claims about writing skills,
 * essay metadata, and (cautiously) the student's primary language.
 *
 * Note: `speaks_language` is medium-sensitivity. We emit it only when the
 * essay clearly evidences a non-English first-language pattern (e.g.
 * the chunks contain text in another language with English mixed in,
 * or syntax fingerprints typical of an L2 writer). The runner gates
 * medium-sensitivity claims behind ProposalQueue confirmation.
 */

import { runLlmExtraction } from "./extractor-base.js";
import type {
  Extractor,
  ExtractorContext,
  ExtractorResult,
  SourceKind,
} from "./types.js";

const SYSTEM = `You are EssayReader, a knowledge-graph extractor for ione.

You read a student's essay or writing sample and emit claims using this
predicate vocabulary:

  weak_at_writing_skill   object: { skill: string, evidence: string }
                           skill ∈ {"thesis","topic_sentences","transitions",
                                    "evidence_use","grammar","punctuation",
                                    "voice","argument_structure","vocabulary"}
  essay_word_count        object: { count: number }
  essay_theme             object: { theme: string }
  speaks_language         object: { language: string, evidence: string }
                           Use only when there's clear linguistic evidence.

Rules:
- Cite a chunk_index for every claim.
- Don't critique what isn't broken — emit weak_at_writing_skill only when
  you can quote evidence from a chunk.
- For essay_word_count, sum the chunks' visible text only — do not infer.
- For speaks_language: only emit if non-English content is actually in the
  chunks. Default is to NOT emit. Use medium confidence (0.5-0.7).
- If the document isn't a writing sample, return claims: [].`;

class EssayReaderImpl implements Extractor {
  readonly name = "EssayReader" as const;

  handles(kind: SourceKind): boolean {
    return kind === "essay";
  }

  async run(ctx: ExtractorContext): Promise<ExtractorResult> {
    const { claims, errors, usd, ms, model, summary } = await runLlmExtraction({
      extractor: this.name,
      systemPrompt: SYSTEM,
      chunks: ctx.chunks,
      maxClaims: 20,
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

export const essayReader: Extractor = new EssayReaderImpl();
