/**
 * Runner / dispatcher for KG extractors.
 *
 * Responsibilities:
 *   1. Pick the right extractor for a source_file's kind.
 *   2. Always include Archivist (the bookkeeping extractor).
 *   3. Run extractors in parallel (cost is dominated by latency, not tokens).
 *   4. Stamp every claim with provenance (source_file_id, source_chunk_id,
 *      extracted_by, model, owner) BEFORE writing to Supabase.
 *   5. Upsert via the unique index (source_file_id, predicate, subject_entity)
 *      — re-extraction of the same file should not create duplicates.
 *   6. Decide claim status:
 *        confidence >= 0.85 AND sensitivity = 'low'  → 'confirmed'
 *        otherwise                                   → 'pending'
 *      Sensitive ones go to ProposalQueue regardless of confidence.
 *   7. Emit one `claim_proposed` / `claim_confirmed` event per inserted row
 *      so the dashboard's Realtime subscription animates.
 *   8. Update source_files.status to 'extracted' or 'failed'.
 *
 * Errors are logged, not thrown. The endpoint that wraps this returns a
 * partial-success response with an `errors` array so the UI can surface
 * "we got 8/12 claims, here's what we couldn't parse".
 */

import { logger } from "../lib/logger.js";
import { supabaseAdmin } from "../integrations/supabase.js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { archivist } from "./archivist.js";
import { essayReader } from "./essay-reader.js";
import { examReader } from "./exam-reader.js";
import { practiceWorkReader } from "./practice-work-reader.js";
import { syllabusReader } from "./syllabus-reader.js";
import { transcriptReader } from "./transcript-reader.js";
import { sensitivityOf } from "./predicates.js";
import type {
  ChunkInput,
  Extractor,
  ExtractorContext,
  ExtractorError,
  ExtractorResult,
  ProposedClaim,
  SourceKind,
} from "./types.js";

const CONTENT_EXTRACTORS: readonly Extractor[] = [
  transcriptReader,
  examReader,
  essayReader,
  practiceWorkReader,
  syllabusReader,
];

/**
 * Pick the content extractor that handles a given source kind. Returns
 * undefined for kinds we don't yet have a reader for (`note`, `voice`,
 * `other`) — those still get the Archivist claim, just no content extraction.
 */
function pickContentExtractor(kind: SourceKind): Extractor | undefined {
  return CONTENT_EXTRACTORS.find((e) => e.handles(kind));
}

export interface RunSourceExtractionInput {
  ownerId: string;
  sourceFileId: string;
  /** Optional; if absent we fetch the row + chunks from supabase. */
  sourceKind?: SourceKind;
  /** Optional override; if absent we read all chunks for the source. */
  chunks?: readonly ChunkInput[];
  sessionId?: string | null;
  cycleId?: string | null;
  supabase?: SupabaseClient;
}

export interface RunSourceExtractionResult {
  sourceFileId: string;
  ownerId: string;
  insertedClaimIds: string[];
  perExtractor: Array<{
    extractor: string;
    claims: number;
    errors: ExtractorError[];
    usd: number;
    ms: number;
    model: string | null;
    summary?: string;
  }>;
  totalUsd: number;
  errors: ExtractorError[];
}

interface SourceFileRow {
  id: string;
  owner: string;
  kind: SourceKind;
  status: string;
}

interface ChunkRow {
  id: string;
  source_file_id: string;
  source_kind: SourceKind;
  text: string;
  position: number | null;
}

/** Decide pending/confirmed based on confidence + sensitivity. */
function statusFor(claim: ProposedClaim): "pending" | "confirmed" {
  const sens = claim.sensitivity ?? sensitivityOf(claim.predicate);
  if (sens !== "low") return "pending";
  return claim.confidence >= 0.85 ? "confirmed" : "pending";
}

/**
 * Drive a single source file through every applicable extractor. Designed
 * to be called both by the HTTP endpoint (`POST /api/sources/extract`) and
 * by background re-extraction in tests / migrations.
 */
export async function runSourceExtraction(
  input: RunSourceExtractionInput,
): Promise<RunSourceExtractionResult> {
  const supabase = input.supabase ?? supabaseAdmin();

  // 1. Resolve the source file row (and verify ownership).
  let kind = input.sourceKind;
  if (!kind) {
    const { data, error } = await supabase
      .from("source_files")
      .select("id, owner, kind, status")
      .eq("id", input.sourceFileId)
      .maybeSingle<SourceFileRow>();
    if (error || !data) {
      logger.warn(
        { err: error?.message, sourceFileId: input.sourceFileId },
        "runSourceExtraction: source file not found",
      );
      return {
        sourceFileId: input.sourceFileId,
        ownerId: input.ownerId,
        insertedClaimIds: [],
        perExtractor: [],
        totalUsd: 0,
        errors: [
          { code: "internal", message: "source_files row not found" },
        ],
      };
    }
    if (data.owner !== input.ownerId) {
      return {
        sourceFileId: input.sourceFileId,
        ownerId: input.ownerId,
        insertedClaimIds: [],
        perExtractor: [],
        totalUsd: 0,
        errors: [
          {
            code: "internal",
            message: "ownership mismatch — refusing to extract",
          },
        ],
      };
    }
    kind = data.kind;
  }

  // 2. Pull the chunks we'll feed each extractor.
  let chunks = input.chunks;
  if (!chunks) {
    const { data, error } = await supabase
      .from("chunks")
      .select("id, source_file_id, source_kind, text, position")
      .eq("source_file_id", input.sourceFileId)
      .order("position", { ascending: true });
    if (error) {
      logger.error(
        { err: error.message, sourceFileId: input.sourceFileId },
        "runSourceExtraction: chunk fetch failed",
      );
      return {
        sourceFileId: input.sourceFileId,
        ownerId: input.ownerId,
        insertedClaimIds: [],
        perExtractor: [],
        totalUsd: 0,
        errors: [{ code: "internal", message: error.message }],
      };
    }
    chunks = (data ?? []).map(
      (r: ChunkRow): ChunkInput => ({
        id: r.id,
        source_file_id: r.source_file_id,
        source_kind: r.source_kind,
        text: r.text,
        position: r.position,
      }),
    );
  }

  if (chunks.length === 0) {
    // Mark the file as failed — no chunks means earlier ingestion broke.
    await supabase
      .from("source_files")
      .update({ status: "failed" })
      .eq("id", input.sourceFileId);
    return {
      sourceFileId: input.sourceFileId,
      ownerId: input.ownerId,
      insertedClaimIds: [],
      perExtractor: [],
      totalUsd: 0,
      errors: [{ code: "no_chunks", message: "no chunks for this source" }],
    };
  }

  // 3. Build the extractor list for this kind.
  const contentExtractor = pickContentExtractor(kind);
  const extractors: Extractor[] = [archivist];
  if (contentExtractor) extractors.push(contentExtractor);

  const ctx: ExtractorContext = {
    ownerId: input.ownerId,
    sourceFileId: input.sourceFileId,
    sourceKind: kind,
    chunks,
    sessionId: input.sessionId ?? null,
    cycleId: input.cycleId ?? null,
  };

  // 4. Run extractors in parallel. Each promise resolves to a result —
  // never rejects — so Promise.all cannot blow up the whole pipeline.
  const settled = await Promise.all(
    extractors.map((e) => safeRun(e, ctx)),
  );

  // 5. Persist claims + record events.
  const insertedClaimIds: string[] = [];
  const perExtractor: RunSourceExtractionResult["perExtractor"] = [];
  const aggregatedErrors: ExtractorError[] = [];
  let totalUsd = 0;

  for (const r of settled) {
    aggregatedErrors.push(...r.errors);
    totalUsd += r.usd;

    const ids = await persistClaims({
      supabase,
      ownerId: input.ownerId,
      extractor: r.extractor,
      sourceFileId: input.sourceFileId,
      claims: r.claims,
      sessionId: input.sessionId ?? null,
      cycleId: input.cycleId ?? null,
      model: r.model,
    });
    insertedClaimIds.push(...ids);

    perExtractor.push({
      extractor: r.extractor,
      claims: r.claims.length,
      errors: r.errors,
      usd: r.usd,
      ms: r.ms,
      model: r.model,
      summary: r.summary,
    });

    // Phase 3/F6: drop a roll-up event so the dashboard's MemoryFeed shows
    // "TranscriptReader → 14 claims" without summing claim_proposed events.
    const succeeded = r.errors.length === 0 || ids.length > 0;
    await supabase.from("events").insert({
      owner: input.ownerId,
      kind: succeeded ? "extractor_completed" : "extractor_failed",
      payload: {
        extractor: r.extractor,
        source_file_id: input.sourceFileId,
        claim_count: ids.length,
        proposed_count: r.claims.length,
        usd: r.usd,
        ms: r.ms,
        model: r.model,
        summary: r.summary,
        errors: r.errors,
      },
    });
  }

  // 6. Stamp source_files.status — partial success still counts as 'extracted'.
  const newStatus =
    insertedClaimIds.length > 0 ? "extracted" : "failed";
  await supabase
    .from("source_files")
    .update({ status: newStatus })
    .eq("id", input.sourceFileId);

  return {
    sourceFileId: input.sourceFileId,
    ownerId: input.ownerId,
    insertedClaimIds,
    perExtractor,
    totalUsd,
    errors: aggregatedErrors,
  };
}

/**
 * Run an extractor with an outermost try/catch. Even if a reader's run()
 * throws (it shouldn't — the contract is non-throwing), we want a result
 * shape back, not an unhandled rejection.
 */
async function safeRun(
  extractor: Extractor,
  ctx: ExtractorContext,
): Promise<ExtractorResult> {
  const t0 = performance.now();
  try {
    return await extractor.run(ctx);
  } catch (e) {
    logger.error(
      { extractor: extractor.name, err: e instanceof Error ? e.message : e },
      "extractor.run threw — treating as internal error",
    );
    return {
      extractor: extractor.name,
      claims: [],
      errors: [
        {
          code: "internal",
          message: e instanceof Error ? e.message : String(e),
        },
      ],
      usd: 0,
      ms: performance.now() - t0,
      model: null,
    };
  }
}

interface PersistClaimsArgs {
  supabase: SupabaseClient;
  ownerId: string;
  extractor: string;
  sourceFileId: string;
  claims: readonly ProposedClaim[];
  sessionId: string | null;
  cycleId: string | null;
  model: string | null;
}

/**
 * Insert (or upsert via the unique index) every claim, then drop one event
 * per success. Returns the list of inserted claim ids — the caller hands
 * these back to the client so the dashboard can highlight new rows.
 */
async function persistClaims(args: PersistClaimsArgs): Promise<string[]> {
  if (args.claims.length === 0) return [];

  const ids: string[] = [];
  for (const claim of args.claims) {
    const status = statusFor(claim);
    const sensitivity = claim.sensitivity ?? sensitivityOf(claim.predicate);

    // The (source_file_id, predicate, subject_entity) unique index lets us
    // upsert. We pass `onConflict` so re-running extraction on the same
    // file doesn't multiply rows.
    // Phase 3/F5: write provenance columns directly on the claim row so
    // memory inspector & "claim cards" can render lineage without joining
    // events. The 0004 migration adds these columns; if the DB hasn't been
    // migrated yet, Supabase will reject and we'll fall back to the legacy
    // shape (see catch below).
    const baseRow = {
      owner: args.ownerId,
      subject_entity: claim.subject_entity ?? "Student",
      predicate: claim.predicate,
      object: claim.object,
      confidence: claim.confidence,
      status,
      sensitivity,
      source_file_id: args.sourceFileId,
      source_chunk_id: claim.source_chunk_id,
      extracted_by: args.extractor,
      reasoning: claim.reasoning ?? null,
      confirmed_at: status === "confirmed" ? new Date().toISOString() : null,
    };
    const provenanceRow = {
      ...baseRow,
      model: args.model,
      session_id: args.sessionId,
      cycle_id: args.cycleId,
      // Predicted is reserved for the runtime/orchestrator path; the
      // post-upload extractors that drive this function are never predicted.
      predicted: false,
      provenance: {
        extractor: args.extractor,
        ...(claim.reasoning ? { reasoning_excerpt: claim.reasoning.slice(0, 200) } : {}),
      },
    };

    let { data, error } = await args.supabase
      .from("claims")
      .upsert(provenanceRow, {
        onConflict: "source_file_id,predicate,subject_entity",
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    // If the new columns don't exist yet (migration not applied), retry
    // with the legacy row shape so production stays unblocked behind
    // schema rollouts.
    if (
      error &&
      /column .* does not exist|could not find the .* column/i.test(error.message)
    ) {
      logger.warn(
        { err: error.message },
        "claims provenance columns missing; falling back to legacy upsert (apply 0004_claim_provenance.sql)",
      );
      ({ data, error } = await args.supabase
        .from("claims")
        .upsert(baseRow, {
          onConflict: "source_file_id,predicate,subject_entity",
        })
        .select("id")
        .maybeSingle<{ id: string }>());
    }

    if (error) {
      logger.warn(
        { err: error.message, predicate: claim.predicate },
        "claim upsert failed",
      );
      continue;
    }
    if (data) {
      ids.push(data.id);
      // Provenance event — Phase 3/F5 wants every claim write to leave
      // a breadcrumb. Sticking it on `events` so the Realtime subscriber
      // (Phase 3/F6) sees it without joining tables.
      await args.supabase.from("events").insert({
        owner: args.ownerId,
        kind: status === "confirmed" ? "claim_confirmed" : "claim_proposed",
        payload: {
          claim_id: data.id,
          predicate: claim.predicate,
          extractor: args.extractor,
          source_file_id: args.sourceFileId,
          source_chunk_id: claim.source_chunk_id,
          session_id: args.sessionId,
          cycle_id: args.cycleId,
          model: args.model,
          confidence: claim.confidence,
        },
      });
    }
  }
  return ids;
}

/**
 * Re-export the individual extractors so callers can pick a single one
 * (e.g. tests, the Pacer follow-up flow) without going through the
 * dispatcher.
 */
export {
  archivist,
  essayReader,
  examReader,
  practiceWorkReader,
  syllabusReader,
  transcriptReader,
};
