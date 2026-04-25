import { supabase } from "../supabase";
import type {
  Chunk,
  Claim,
  ClaimStatus,
  SourceFile,
  SourceKind,
} from "../database.types";
import type { Predicate } from "./predicates";

/**
 * The shared `searchGraph()` surface. Every agent — Tutor, HintWriter,
 * SyllabusReader, etc. — ends up calling this. The signature is deliberately
 * narrow so we can swap the underlying retrieval strategy (vector search,
 * BM25, claim graph traversal) without changing the call sites.
 *
 * Today this is a structured filter on `claims` + `chunks`. Tomorrow it
 * can fall through to a Postgres `tsvector` query, then to embeddings.
 */

export type SearchOpts = {
  /** Limit by predicate (e.g. ["weak_at_topic"]). */
  predicates?: Predicate[];
  /** Restrict results to specific source kinds. */
  sourceKinds?: SourceKind[];
  /** Only confirmed claims by default — flip for triage UIs. */
  status?: ClaimStatus[];
  /** Free-text query against chunk.text and claim.reasoning. */
  query?: string;
  /** Cap result set. */
  limit?: number;
};

export type GraphHit = {
  claim: Claim;
  chunk: Chunk | null;
  sourceFile: SourceFile | null;
};

/**
 * Returns claims (with their grounding chunk + source file) for the
 * currently signed-in user. RLS in 0002 enforces ownership at the DB
 * layer, but we still scope the query explicitly so a future service-role
 * client can't accidentally cross students.
 */
export async function searchGraph(opts: SearchOpts = {}): Promise<GraphHit[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const status = opts.status ?? ["confirmed", "pending"];

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return [];
  const owner = userData.user.id;

  let query = supabase
    .from("claims")
    .select(
      `
        *,
        chunk:chunks!claims_source_chunk_id_fkey ( * ),
        sourceFile:source_files!claims_source_file_id_fkey ( * )
      `,
    )
    .eq("owner", owner)
    .in("status", status)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts.predicates?.length) {
    query = query.in("predicate", opts.predicates);
  }
  if (opts.sourceKinds?.length) {
    // join filter: rely on the embedded sourceFile.kind via a server-side filter
    // (Supabase passes through to PostgREST: nested.column=in)
    query = query.in("sourceFile.kind", opts.sourceKinds);
  }
  if (opts.query && opts.query.trim()) {
    const q = opts.query.trim();
    // OR across reasoning + grounding chunk text
    query = query.or(
      `reasoning.ilike.%${q}%,chunk.text.ilike.%${q}%`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("[searchGraph] failed", error);
    return [];
  }

  // The hand-written Database type doesn't capture the FK relationships used
  // in the embed above, so PostgREST returns a less specific shape than
  // claims-table-only queries. We coerce through `unknown` and only read the
  // fields we declared in the select.
  return ((data ?? []) as unknown as Array<
    Claim & { chunk: Chunk | null; sourceFile: SourceFile | null }
  >).map((row) => ({
    claim: stripJoins(row),
    chunk: row.chunk ?? null,
    sourceFile: row.sourceFile ?? null,
  }));
}

/** Lists every source file for the signed-in user. UI helper, not agent-facing. */
export async function listSourceFiles(): Promise<SourceFile[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return [];
  const { data, error } = await supabase
    .from("source_files")
    .select("*")
    .eq("owner", userData.user.id)
    .order("uploaded_at", { ascending: false });
  if (error) {
    console.error("[listSourceFiles] failed", error);
    return [];
  }
  return data ?? [];
}

function stripJoins(row: Claim & Record<string, unknown>): Claim {
  const { chunk: _c, sourceFile: _s, ...rest } = row as Claim & {
    chunk?: unknown;
    sourceFile?: unknown;
  };
  return rest as Claim;
}
