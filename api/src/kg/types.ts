/**
 * Shared types for KG extractors.
 *
 * The shape mirrors the `claims` table in 0002_knowledge_graph.sql, but
 * deliberately *narrower* on the extractor's side — we don't let an extractor
 * write `owner`, `id`, `status`, or `confirmed_at`. Those are decided by the
 * runner.
 *
 * Provenance fields (source_file_id, source_chunk_id, extracted_by, model)
 * live on `ProposedClaim` itself — Phase 3/F5 demands every claim carries
 * its receipt back to the chunk that justified it. The runner refuses to
 * insert a claim with no chunk attached.
 */

import type { Predicate, Sensitivity, ExtractorName } from "./predicates.js";

/** Minimal chunk shape the extractor sees. We never pass full files. */
export interface ChunkInput {
  id: string;
  source_file_id: string;
  source_kind: SourceKind;
  text: string;
  position?: number | null;
}

export type SourceKind =
  | "transcript"
  | "failed_exam"
  | "practice_work"
  | "essay"
  | "syllabus"
  | "note"
  | "voice"
  | "other";

/** What an extractor returns. The runner attaches owner / status / file / etc. */
export interface ProposedClaim {
  predicate: Predicate;
  /** Default 'Student' — extractors override only for entity-on-entity claims. */
  subject_entity?: string;
  /** Predicate-specific JSON payload. The shape is the extractor's contract. */
  object: Record<string, unknown> | string | number | boolean | null;
  /** [0..1] confidence — calibrated by the extractor, not the model directly. */
  confidence: number;
  /** Cited chunk. Required. The runner drops claims where this is missing. */
  source_chunk_id: string;
  /** Why the LLM proposed this. Plain English, displayed in the UI. */
  reasoning?: string;
  /** Override sensitivity for the rare predicate that's context-dependent. */
  sensitivity?: Sensitivity;
}

export interface ExtractorContext {
  ownerId: string;
  sourceFileId: string;
  sourceKind: SourceKind;
  /** Chunks for this source (already inserted into `chunks`). */
  chunks: readonly ChunkInput[];
  /** For tagging cycle/session provenance when the run is online (rare). */
  sessionId?: string | null;
  cycleId?: string | null;
}

export interface ExtractorResult {
  extractor: ExtractorName;
  claims: ProposedClaim[];
  /** What the LLM cost — runner aggregates and persists for cost tracking. */
  usd: number;
  /** Wall time in ms. */
  ms: number;
  /** Model used (string for forward-compat with future provider switches). */
  model: string | null;
  /** Optional summary the runner can stash on the source_file row. */
  summary?: string;
  /** Errors are returned, not thrown — the runner decides whether to retry. */
  errors: ExtractorError[];
}

export interface ExtractorError {
  /** Stable code so callers can switch on it. */
  code:
    | "agent_parse_error"
    | "no_chunks"
    | "predicate_not_allowed"
    | "predicate_unknown"
    | "missing_chunk_citation"
    | "upstream_error"
    | "internal";
  message: string;
  /** Optional raw response for debugging when an LLM round-trips garbage. */
  raw?: string;
  /** Which chunk we were processing when this happened. */
  chunkId?: string | null;
}

export interface Extractor {
  readonly name: ExtractorName;
  /**
   * Decide whether this extractor handles a given source kind. The dispatcher
   * uses it to route source files to the right reader.
   */
  handles(kind: SourceKind): boolean;
  /**
   * Process the chunks. MUST NOT throw — return errors in the result instead.
   * The runner needs the cost/timing data even for partial failures.
   */
  run(ctx: ExtractorContext): Promise<ExtractorResult>;
}
