/**
 * /api/sources
 *   POST /api/sources/extract  — kick off KG extraction for a source file
 *
 * Wiring:
 *   landing/src/lib/graph/ingest.ts uploads the blob, creates the
 *   source_files row, and (for plain text) seeds a chunk. It then calls
 *   this endpoint with the source_file_id. The extractor reads chunks,
 *   produces claims, persists them with provenance, and emits events
 *   that Realtime broadcasts to the dashboard.
 *
 *   Returns *quickly* in the synchronous case (small uploads). For larger
 *   files we eventually want to stream progress over SSE — but the MVP
 *   completes within a few seconds for everything we currently chunk.
 *
 * All routes require Authorization: Bearer <supabase_jwt>.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../server.js";
import { userIdFromAuthHeader } from "../integrations/supabase.js";
import { AppError } from "../lib/errors.js";
import { runSourceExtraction } from "../kg/runner.js";

export const sourcesRoute = new Hono<AppEnv>();

const ExtractBody = z.object({
  source_file_id: z.string().uuid(),
  /** Optional override for callers that already know the kind (avoid re-fetch). */
  source_kind: z
    .enum([
      "transcript",
      "failed_exam",
      "practice_work",
      "essay",
      "syllabus",
      "note",
      "voice",
      "other",
    ])
    .optional(),
  session_id: z.string().uuid().nullable().optional(),
  cycle_id: z.string().uuid().nullable().optional(),
});

sourcesRoute.post("/extract", async (c) => {
  const userId = await userIdFromAuthHeader(c.req.header("Authorization"));
  if (!userId) throw new AppError("unauthorized", "missing or invalid bearer token");
  c.set("userId", userId);

  const json = await c.req.json().catch(() => ({}));
  const parsed = ExtractBody.safeParse(json);
  if (!parsed.success) {
    throw new AppError("validation_error", "invalid /sources/extract body", {
      details: { issues: parsed.error.issues },
    });
  }

  const result = await runSourceExtraction({
    ownerId: userId,
    sourceFileId: parsed.data.source_file_id,
    sourceKind: parsed.data.source_kind,
    sessionId: parsed.data.session_id ?? null,
    cycleId: parsed.data.cycle_id ?? null,
  });

  return c.json({
    source_file_id: result.sourceFileId,
    inserted_claim_ids: result.insertedClaimIds,
    per_extractor: result.perExtractor,
    total_cost_usd: result.totalUsd,
    errors: result.errors,
  });
});
