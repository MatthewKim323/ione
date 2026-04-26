/**
 * /api/me  — read-only views over the authenticated user's compiled state.
 *
 *   GET  /api/me/struggle  → the StruggleProfile the Intervention Agent uses,
 *                            plus a small slice of the most recent confirmed
 *                            claims joined to their source_files. The claim
 *                            slice is what the tutor surface renders as
 *                            "receipts" — proof that a hint isn't fabricated,
 *                            it's grounded in something the user uploaded.
 *
 * Why a separate route, not stuffed into the SSE cycle stream?
 *
 * Per-cycle streaming should be tight (≤200ms first byte). Joining 30 claims
 * to source_files every cycle for the same student would burn budget and
 * dwarf the actual reasoning step. Instead the tutor surface fetches this
 * once when the workspace mounts and refreshes when a session ends — the KG
 * doesn't change mid-frame.
 *
 * Auth: bearer JWT (same as /api/cycle, /api/sessions).
 *
 * Shape (stable):
 *   {
 *     profile: StruggleProfile | null,
 *     receipts: Array<{
 *       id: string,
 *       predicate: string,
 *       object_label: string | null,
 *       confidence: number,
 *       status: "confirmed" | "pending" | "rejected" | "superseded",
 *       reasoning: string | null,
 *       extracted_by: string,
 *       created_at: string,
 *       source: {
 *         id: string,
 *         filename: string,
 *         title: string | null,
 *         kind: SourceKind
 *       } | null
 *     }>,
 *     totals: { claims: number; sources: number; }
 *   }
 */

import { Hono } from "hono";
import type { AppEnv } from "../server.js";
import { userIdFromAuthHeader, supabaseAdmin } from "../integrations/supabase.js";
import { AppError } from "../lib/errors.js";
import { getStruggleProfile } from "../lib/memory.js";
import { logger } from "../lib/logger.js";

export const profileRoute = new Hono<AppEnv>();

/**
 * How many claims to surface as receipts. Anything beyond this is just
 * noise in a 360px sidebar.
 */
const RECEIPT_LIMIT = 8;

/**
 * Some predicates are genuinely sensitive (medical, mental_health). The
 * tutor surface shouldn't render them as receipts — they're for the
 * intervention agent's awareness only, not for casual on-screen display.
 */
const HIDDEN_PREDICATES = new Set<string>([
  "discloses_medical_condition",
  "discloses_mental_health",
  "discloses_family_situation",
]);

profileRoute.get("/struggle", async (c) => {
  const userId = await userIdFromAuthHeader(c.req.header("Authorization"));
  if (!userId) {
    throw new AppError("unauthorized", "missing or invalid bearer token");
  }
  c.set("userId", userId);

  const [profile, receipts, totals] = await Promise.all([
    getStruggleProfile(userId).catch((e) => {
      logger.warn({ err: e }, "[/me/struggle] getStruggleProfile failed");
      return null;
    }),
    fetchReceipts(userId),
    fetchTotals(userId),
  ]);

  return c.json({ profile, receipts, totals });
});

// ─── private helpers ──────────────────────────────────────────────────────

type ReceiptRow = {
  id: string;
  predicate: string;
  object: unknown;
  confidence: number;
  status: "pending" | "confirmed" | "rejected" | "superseded";
  reasoning: string | null;
  extracted_by: string;
  created_at: string;
  source_file: {
    id: string;
    filename: string;
    title: string | null;
    kind: string;
  } | null;
};

type Receipt = {
  id: string;
  predicate: string;
  object_label: string | null;
  confidence: number;
  status: ReceiptRow["status"];
  reasoning: string | null;
  extracted_by: string;
  created_at: string;
  source: ReceiptRow["source_file"];
};

async function fetchReceipts(userId: string): Promise<Receipt[]> {
  // Confirmed claims first; if we don't have enough, fill with high-confidence
  // pendings. We rely on Supabase's join syntax to attach source_files; an
  // RPC would be marginally faster but the row count here is tiny.
  const { data, error } = await supabaseAdmin()
    .from("claims")
    .select(
      `
        id,
        predicate,
        object,
        confidence,
        status,
        reasoning,
        extracted_by,
        created_at,
        source_file:source_files (
          id,
          filename,
          title,
          kind
        )
      `,
    )
    .eq("owner", userId)
    .in("status", ["confirmed", "pending"])
    .order("created_at", { ascending: false })
    .limit(RECEIPT_LIMIT * 4); // over-fetch then filter

  if (error) {
    logger.warn({ err: error }, "[/me/struggle] fetchReceipts failed");
    return [];
  }

  const rows = (data ?? []) as unknown as Array<
    Omit<ReceiptRow, "source_file"> & {
      // Supabase's relational select returns the joined row as either the
      // object or an array of one element depending on the FK cardinality.
      // We coerce both shapes here.
      source_file:
        | ReceiptRow["source_file"]
        | Array<NonNullable<ReceiptRow["source_file"]>>
        | null;
    }
  >;

  const ranked = rows
    .filter((r) => !HIDDEN_PREDICATES.has(r.predicate))
    .filter((r) => r.status === "confirmed" || r.confidence >= 0.75)
    .slice(0, RECEIPT_LIMIT);

  return ranked.map((r) => ({
    id: r.id,
    predicate: r.predicate,
    object_label: extractObjectLabel(r.object),
    confidence: r.confidence,
    status: r.status,
    reasoning: r.reasoning,
    extracted_by: r.extracted_by,
    created_at: r.created_at,
    source: Array.isArray(r.source_file)
      ? r.source_file[0] ?? null
      : r.source_file,
  }));
}

async function fetchTotals(
  userId: string,
): Promise<{ claims: number; sources: number }> {
  // Two cheap COUNT queries. We don't need exact counts above a few hundred,
  // so { count: "estimated" } is good enough.
  const [claims, sources] = await Promise.all([
    supabaseAdmin()
      .from("claims")
      .select("id", { count: "exact", head: true })
      .eq("owner", userId)
      .in("status", ["confirmed", "pending"]),
    supabaseAdmin()
      .from("source_files")
      .select("id", { count: "exact", head: true })
      .eq("owner", userId),
  ]);
  return {
    claims: claims.count ?? 0,
    sources: sources.count ?? 0,
  };
}

/**
 * Object can be a string, a {value}/{name}/{topic}/{label} bag, or a more
 * complex shape. Render the most human-readable scalar.
 */
function extractObjectLabel(obj: unknown): string | null {
  if (obj == null) return null;
  if (typeof obj === "string") return obj.trim() || null;
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    for (const key of [
      "value",
      "label",
      "topic",
      "name",
      "title",
      "subject",
      "what",
    ]) {
      const v = o[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    // Fall back to a tiny JSON stringify capped at 60 chars.
    try {
      const stringified = JSON.stringify(o);
      return stringified.length > 60
        ? stringified.slice(0, 57) + "…"
        : stringified;
    } catch {
      return null;
    }
  }
  return null;
}
