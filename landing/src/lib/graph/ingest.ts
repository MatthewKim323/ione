import { supabase } from "../supabase";
import { authedJson } from "../api";
import type {
  SourceFile,
  SourceKind,
} from "../database.types";

/**
 * Browser-side ingest. The whole pipeline (parse → chunk → extract claims)
 * eventually moves to a server-side worker, but the *upload* + *file row*
 * always happen here so the user gets immediate feedback and a stable
 * source_file_id to refer to.
 *
 * Pipeline stages (read alongside supabase/migrations/0002_knowledge_graph.sql):
 *
 *   1. validate file (size, mime, kind)
 *   2. write blob to Storage at `source-files/{uid}/{file_id}.{ext}`
 *   3. insert `source_files` row (status='pending')
 *   4. for plain-text inputs only, insert one chunk eagerly so the receipt
 *      primitive exists from t=0. PDFs / images stay status='pending' until
 *      a server-side OCR worker picks them up later.
 *   5. insert one `events` row of kind='source_uploaded' so any subscribed
 *      agent reacts in real time.
 *
 * The function never throws — it returns a discriminated result so callers
 * can render error toasts inline.
 */

export type IngestInput = {
  file: File;
  kind: SourceKind;
  /** optional human-readable label, e.g. "Algebra 2 midterm". */
  title?: string;
};

export type IngestResult =
  | { ok: true; sourceFile: SourceFile }
  | { ok: false; error: string };

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB. Bumps when the OCR backend can stream.

export async function ingestSource(input: IngestInput): Promise<IngestResult> {
  const { file, kind, title } = input;

  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: `file is ${formatMb(file.size)} — max is ${formatMb(MAX_BYTES)}.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, error: "file is empty." };
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, error: "not signed in." };
  }
  const owner = userData.user.id;

  // ── 1. choose storage path ────────────────────────────────────────────
  // path layout matches the storage RLS policy: first folder == owner uid.
  const fileId = crypto.randomUUID();
  const ext = extOf(file.name);
  const storagePath = `${owner}/${fileId}${ext ? `.${ext}` : ""}`;

  // ── 2. upload blob ────────────────────────────────────────────────────
  const upload = await supabase.storage
    .from("source-files")
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
  if (upload.error) {
    console.error("[ingest] storage upload failed", upload.error);
    return {
      ok: false,
      error: `couldn't upload — ${upload.error.message.toLowerCase()}`,
    };
  }

  // ── 3. insert source_files row ────────────────────────────────────────
  const insertRow = {
    id: fileId,
    owner,
    kind,
    filename: file.name,
    storage_path: storagePath,
    mime_type: file.type || null,
    size_bytes: file.size,
    title: title?.trim() || null,
    status: "pending" as const,
  };
  const { data: row, error: rowErr } = await supabase
    .from("source_files")
    .insert(insertRow)
    .select()
    .single();
  if (rowErr || !row) {
    console.error("[ingest] source_files insert failed", rowErr);
    // best-effort cleanup: try to remove the orphaned blob
    await supabase.storage.from("source-files").remove([storagePath]);
    return {
      ok: false,
      error: rowErr?.message?.toLowerCase() ?? "couldn't record file.",
    };
  }

  // ── 4. eager chunk for plain-text inputs ──────────────────────────────
  // This keeps the "no chunk → no claim" invariant easy to satisfy for
  // notes typed inline. Binary uploads stay chunkless until a server-side
  // OCR worker takes them.
  if (kind === "note" || file.type.startsWith("text/")) {
    try {
      const text = await file.text();
      const trimmed = text.slice(0, 100_000); // guard against pathologically large notes
      if (trimmed.trim().length > 0) {
        await supabase.from("chunks").insert({
          source_file_id: row.id,
          source_kind: row.kind,
          text: trimmed,
          offset_start: 0,
          offset_end: trimmed.length,
        });
        await supabase
          .from("source_files")
          .update({ status: "parsed" })
          .eq("id", row.id);
      }
    } catch (e) {
      // non-fatal — file is uploaded, chunk just stays unwritten
      console.warn("[ingest] eager chunk skipped", e);
    }
  }

  // ── 5. broadcast event ────────────────────────────────────────────────
  await supabase.from("events").insert({
    owner,
    kind: "source_uploaded",
    payload: {
      source_file_id: row.id,
      source_kind: row.kind,
      filename: row.filename,
    },
  });

  // ── 6. kick KG extraction (non-blocking) ──────────────────────────────
  // For text sources we already have a chunk, so the server can extract
  // immediately. For binaries (PDFs, images) the call is still safe — the
  // server returns a no-op no_chunks error and the row stays status='pending'
  // until a future OCR worker fills in chunks. We deliberately *await* the
  // call (rather than fire-and-forget) so the UI can show "memory updating…"
  // and the realtime feed populates synchronously after the promise resolves.
  // If the API is down, ingestion still succeeds — extraction is best-effort.
  void triggerExtraction(row.id, row.kind).catch((e) => {
    console.warn("[ingest] extraction trigger failed (non-fatal)", e);
  });

  return { ok: true, sourceFile: row };
}

type ExtractionResponse = {
  source_file_id: string;
  inserted_claim_ids: string[];
  per_extractor: Array<{
    extractor: string;
    claims: number;
    errors: Array<{ code: string; message: string }>;
    usd: number;
    ms: number;
    model: string | null;
    summary?: string;
  }>;
  total_cost_usd: number;
  errors: Array<{ code: string; message: string }>;
};

/**
 * Calls POST /api/sources/extract. Exported so callers (e.g. a "re-extract"
 * button on the source detail page in Phase 4 / G6) can invoke it directly
 * without re-uploading.
 */
export async function triggerExtraction(
  sourceFileId: string,
  sourceKind?: SourceKind,
): Promise<ExtractionResponse | null> {
  try {
    return await authedJson<ExtractionResponse>("/api/sources/extract", {
      source_file_id: sourceFileId,
      ...(sourceKind ? { source_kind: sourceKind } : {}),
    });
  } catch (e) {
    console.warn("[ingest] /api/sources/extract failed", e);
    return null;
  }
}

/** Public read URL is signed, since the bucket is private. */
export async function signedSourceUrl(
  storagePath: string,
  expiresInSec = 60,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("source-files")
    .createSignedUrl(storagePath, expiresInSec);
  if (error) {
    console.error("[ingest] signed url failed", error);
    return null;
  }
  return data?.signedUrl ?? null;
}

/** Soft delete: removes blob + row + cascades chunks/artifacts/claims. */
export async function deleteSource(file: SourceFile): Promise<boolean> {
  const remove = await supabase.storage
    .from("source-files")
    .remove([file.storage_path]);
  if (remove.error) {
    console.warn("[ingest] storage delete failed (continuing)", remove.error);
  }
  const { error } = await supabase
    .from("source_files")
    .delete()
    .eq("id", file.id);
  if (error) {
    console.error("[ingest] row delete failed", error);
    return false;
  }
  return true;
}

function extOf(name: string): string | null {
  const i = name.lastIndexOf(".");
  if (i < 0 || i === name.length - 1) return null;
  return name.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
