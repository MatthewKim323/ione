/**
 * Shared utilities for LLM-backed extractors.
 *
 * Each reader in this directory follows the same shape:
 *
 *   1. Concatenate chunks with a header so the LLM can cite by position.
 *   2. Call sonnetJson with a JSON schema describing claims it can emit.
 *   3. Validate every returned claim:
 *      - predicate must be in our vocabulary
 *      - predicate must be in the extractor's whitelist (PREDICATES_BY_EXTRACTOR)
 *      - source_chunk_index must point at one of the chunks we sent
 *   4. Map source_chunk_index → real chunk_id and return ProposedClaim[].
 *
 * Why a shared helper? Otherwise every reader copies the same 60 lines of
 * defensive plumbing. The LLM call itself is one line; the validator and
 * the cost/error accounting are everything else.
 */

import { sonnetJson, type SonnetResult } from "../integrations/anthropic.js";
import { logger } from "../lib/logger.js";
import {
  isAllowedFor,
  isPredicate,
  type ExtractorName,
  type Predicate,
} from "./predicates.js";
import type {
  ChunkInput,
  ExtractorError,
  ProposedClaim,
} from "./types.js";

/** Shape the LLM is told to produce. We re-validate every field on parse. */
export interface RawClaimFromLLM {
  predicate: string;
  subject_entity?: string;
  object: unknown;
  confidence: number;
  source_chunk_index: number;
  reasoning?: string;
}

export interface RawExtractorOutput {
  summary?: string;
  claims: RawClaimFromLLM[];
}

export interface RunLlmExtractionOpts {
  extractor: ExtractorName;
  systemPrompt: string;
  /** Chunks the LLM is allowed to cite — by index. */
  chunks: readonly ChunkInput[];
  maxTokens?: number;
  /** Hard cap on output claims to keep cost predictable. Default 24. */
  maxClaims?: number;
}

export interface RunLlmExtractionResult {
  claims: ProposedClaim[];
  errors: ExtractorError[];
  usd: number;
  ms: number;
  model: string;
  raw: string;
  summary?: string;
}

/**
 * Compose the user prompt: a numbered list of chunks the LLM can cite by
 * `source_chunk_index`. We never let the LLM invent chunk ids — it picks
 * an index, we map it to the real uuid on our side.
 */
export function formatChunksForPrompt(chunks: readonly ChunkInput[]): string {
  return chunks
    .map(
      (c, i) =>
        `[chunk ${i}] (kind=${c.source_kind}, position=${c.position ?? i})\n${c.text}`,
    )
    .join("\n\n---\n\n");
}

/**
 * The hard part — validate raw LLM output and map it onto ProposedClaim[].
 * Drops invalid claims and pushes the corresponding error so the dashboard
 * can show the extractor's hit rate. Doesn't throw.
 */
export function validateAndMapClaims(
  extractor: ExtractorName,
  chunks: readonly ChunkInput[],
  raw: RawClaimFromLLM[],
): { claims: ProposedClaim[]; errors: ExtractorError[] } {
  const claims: ProposedClaim[] = [];
  const errors: ExtractorError[] = [];

  for (const r of raw) {
    if (typeof r.predicate !== "string" || !isPredicate(r.predicate)) {
      errors.push({
        code: "predicate_unknown",
        message: `unknown predicate "${r.predicate}"`,
      });
      continue;
    }
    const predicate = r.predicate as Predicate;

    if (!isAllowedFor(extractor, predicate)) {
      errors.push({
        code: "predicate_not_allowed",
        message: `${extractor} cannot write predicate "${predicate}"`,
      });
      continue;
    }

    const idx = r.source_chunk_index;
    if (
      typeof idx !== "number" ||
      !Number.isInteger(idx) ||
      idx < 0 ||
      idx >= chunks.length
    ) {
      errors.push({
        code: "missing_chunk_citation",
        message: `claim has invalid source_chunk_index=${idx}`,
      });
      continue;
    }

    const conf = typeof r.confidence === "number" ? r.confidence : 0;
    const clamped = Math.min(1, Math.max(0, conf));

    claims.push({
      predicate,
      subject_entity: r.subject_entity ?? "Student",
      object: (r.object ?? null) as ProposedClaim["object"],
      confidence: clamped,
      source_chunk_id: chunks[idx]!.id,
      reasoning: r.reasoning,
    });
  }

  return { claims, errors };
}

/**
 * The single shared LLM call. Wraps sonnetJson and the validator. Each
 * reader supplies its own system prompt — that's the actual differentiator
 * between TranscriptReader and EssayReader.
 */
export async function runLlmExtraction(
  opts: RunLlmExtractionOpts,
): Promise<RunLlmExtractionResult> {
  const { extractor, systemPrompt, chunks } = opts;

  if (chunks.length === 0) {
    return {
      claims: [],
      errors: [
        { code: "no_chunks", message: `${extractor} called with no chunks` },
      ],
      usd: 0,
      ms: 0,
      model: "",
      raw: "",
    };
  }

  const userPrompt = [
    `You are a knowledge-graph extractor (${extractor}). Read the chunks below`,
    `and emit at most ${opts.maxClaims ?? 24} JSON claims about the student.`,
    ``,
    `Output STRICT JSON, no prose, no fences:`,
    `{`,
    `  "summary": "<one-line description of the document>",`,
    `  "claims": [`,
    `    {`,
    `      "predicate": "<one of the allowed predicates>",`,
    `      "subject_entity": "Student",`,
    `      "object": <predicate-specific JSON>,`,
    `      "confidence": <0..1>,`,
    `      "source_chunk_index": <integer 0..${chunks.length - 1}>,`,
    `      "reasoning": "<why you proposed this>"`,
    `    }`,
    `  ]`,
    `}`,
    ``,
    `Hard rules:`,
    `- predicate MUST be one your role is allowed to write (see system prompt).`,
    `- source_chunk_index MUST point at a chunk you actually used.`,
    `- If the chunks don't justify a claim, do NOT invent it.`,
    ``,
    `Chunks:`,
    ``,
    formatChunksForPrompt(chunks),
  ].join("\n");

  let result: SonnetResult<RawExtractorOutput>;
  try {
    result = await sonnetJson<RawExtractorOutput>({
      system: systemPrompt,
      user: userPrompt,
      maxTokens: opts.maxTokens ?? 1500,
      cacheSystem: true,
    });
  } catch (e) {
    return {
      claims: [],
      errors: [
        {
          code: "upstream_error",
          message: e instanceof Error ? e.message : String(e),
        },
      ],
      usd: 0,
      ms: 0,
      model: "",
      raw: "",
    };
  }

  if (!result.parsed.ok) {
    logger.warn(
      { extractor, raw: result.raw.slice(0, 500), err: result.parsed.error },
      "extractor JSON parse failed",
    );
    return {
      claims: [],
      errors: [
        {
          code: "agent_parse_error",
          message: result.parsed.error,
          raw: result.raw,
        },
      ],
      usd: result.usd,
      ms: result.ms,
      model: result.model,
      raw: result.raw,
    };
  }

  const llm = result.parsed.value;
  const rawClaims = Array.isArray(llm.claims) ? llm.claims : [];
  const { claims, errors } = validateAndMapClaims(extractor, chunks, rawClaims);

  return {
    claims,
    errors,
    usd: result.usd,
    ms: result.ms,
    model: result.model,
    raw: result.raw,
    summary: typeof llm.summary === "string" ? llm.summary : undefined,
  };
}
