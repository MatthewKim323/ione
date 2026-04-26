/**
 * Memory profile compiler — claims → StruggleProfile for the Intervention Agent.
 *
 * The Intervention Agent doesn't get raw claims (too noisy, too many tokens).
 * It gets a compact `StruggleProfile` we render here from confirmed (and
 * high-confidence pending) claims plus the user's onboarding profile row.
 *
 * Output shape is fixed by api/src/agents/types.ts to keep the agent prompt
 * stable across phases:
 *
 *   {
 *     pattern_summary: "Algebra 2, weak at sign rules / fractions, ..."
 *     error_type: "sign error",
 *     frequency: "frequent" | "occasional" | "rare",
 *     examples: [{ problem, date, what_went_wrong }, ...],
 *     tutor_notes: "Prefers direct nudges; avoid lecturing."
 *   }
 *
 * The whole rendered text stays under ~500 chars so it fits comfortably in
 * a system prompt without bloating per-cycle cost.
 */

import { supabaseAdmin } from "../integrations/supabase.js";
import type { StruggleProfile } from "../agents/types.js";

const MAX_CLAIMS = 60;
const PENDING_CONFIDENCE_FLOOR = 0.8;
const MAX_SUMMARY_CHARS = 480;

type ClaimRow = {
  predicate: string;
  object: unknown;
  status: string;
  confidence: number;
  reasoning: string | null;
  created_at: string;
};

/**
 * Joined claim row used by the cycle pipeline so the AgentTrace can show
 * "memory referenced N facts" with per-fact source-filename pills. Same
 * underlying table as ClaimRow, plus the source_file relation.
 */
type ClaimRowWithSource = ClaimRow & {
  source_file_id: string | null;
  source_files: { filename: string | null } | null;
};

type ProfileRow = {
  grade: string | null;
  current_class: string | null;
  hint_frequency: string | null;
};

/**
 * One claim surfaced in the live cycle's `kg_lookup` SSE event so the
 * frontend can render "indexed: weak_at_topic 'chain rule' · failed-exam.md".
 *
 * Predicates are kept as the raw string from the DB (e.g. `made_sign_error`)
 * so the UI can decide how to humanize them. `object_label` is a best-effort
 * one-line render of whatever the extractor stored under `object` — string,
 * `{value}`, `{topic}`, etc.
 */
export type KgReference = {
  predicate: string;
  object_label: string;
  source_filename: string | null;
  status: string;
  confidence: number;
};

export type StruggleSnapshot = {
  profile: StruggleProfile | null;
  /** Up to 8 highest-confidence claims that fed the profile, with provenance. */
  references: KgReference[];
  /** Total claims considered (after status/confidence filtering). */
  claim_count: number;
};

/** Public entry point — fetch + compile in one call. */
export async function getStruggleProfile(
  userId: string,
): Promise<StruggleProfile | null> {
  const [claims, profile] = await Promise.all([
    fetchClaims(userId),
    fetchProfileRow(userId),
  ]);
  if (!claims.length && !profile) return null;
  return compileStruggleProfile(claims, profile);
}

/**
 * Cycle-scoped snapshot: the same profile we feed Predictive + Intervention,
 * plus a structured list of which claims (and which source files) it was
 * compiled from. Used by routes/cycle.ts to emit a `kg_lookup` SSE event so
 * the AgentTrace can render real receipts alongside the agent stages.
 */
export async function getStruggleSnapshot(
  userId: string,
): Promise<StruggleSnapshot> {
  const [claims, profile] = await Promise.all([
    fetchClaimsWithSource(userId),
    fetchProfileRow(userId),
  ]);
  if (!claims.length && !profile) {
    return { profile: null, references: [], claim_count: 0 };
  }
  // Strip source_files before handing to the compiler so it stays a pure
  // function over ClaimRow.
  const compiled = compileStruggleProfile(
    claims.map(({ source_file_id, source_files, ...rest }) => {
      void source_file_id;
      void source_files;
      return rest;
    }),
    profile,
  );

  // Surface the highest-confidence confirmed (or high-pending) claims with
  // their source filename. We keep this small (8) so the SSE payload stays
  // tiny and the trace UI doesn't drown the orchestration timeline.
  const references = pickReferenceClaims(claims, 8);

  return {
    profile: compiled,
    references,
    claim_count: claims.length,
  };
}

/**
 * Pure function — exposed so unit tests can pin the rendering without
 * touching Supabase.
 */
export function compileStruggleProfile(
  claims: ClaimRow[],
  profile: ProfileRow | null,
): StruggleProfile {
  // ── tally claims into facets ─────────────────────────────────────────
  const weak = new Set<string>();
  const strong = new Set<string>();
  const needsReview = new Set<string>();
  const errorCounts = new Map<string, number>();
  const examples: StruggleProfile["examples"] = [];
  let explanationStyle: string | null = null;

  for (const c of claims) {
    if (
      c.status !== "confirmed" &&
      c.confidence < PENDING_CONFIDENCE_FLOOR
    ) {
      continue;
    }
    const objStr = stringObject(c.object);
    switch (c.predicate) {
      case "weak_at_topic":
      case "unfamiliar_with_topic":
        if (objStr) weak.add(objStr);
        break;
      case "strong_at_topic":
      case "mastered_topic":
        if (objStr) strong.add(objStr);
        break;
      case "needs_review_on":
        if (objStr) needsReview.add(objStr);
        break;
      case "made_sign_error":
        bump(errorCounts, "sign error");
        pushExample(examples, c, "sign error");
        break;
      case "made_arithmetic_error":
        bump(errorCounts, "arithmetic slip");
        pushExample(examples, c, "arithmetic slip");
        break;
      case "made_concept_gap":
        bump(errorCounts, "concept gap");
        pushExample(examples, c, "concept gap");
        break;
      case "skipped_step":
        bump(errorCounts, "skipped step");
        pushExample(examples, c, "skipped step");
        break;
      case "misread_problem":
        bump(errorCounts, "misread problem");
        pushExample(examples, c, "misread problem");
        break;
      case "ran_out_of_time":
        bump(errorCounts, "time pressure");
        break;
      case "prefers_explanation_style":
        explanationStyle ??= objStr;
        break;
    }
  }

  // ── compose pattern summary ──────────────────────────────────────────
  const lines: string[] = [];
  const cls = profile?.current_class ? humanize(profile.current_class) : null;
  const grade = profile?.grade;
  if (grade || cls) {
    lines.push(
      `Student${grade ? `, grade ${grade}` : ""}${cls ? `, taking ${cls}` : ""}.`,
    );
  }
  if (weak.size) {
    lines.push(`Weak at: ${[...weak].slice(0, 6).join(", ")}.`);
  }
  if (needsReview.size) {
    lines.push(
      `Recently flagged for review: ${[...needsReview].slice(0, 4).join(", ")}.`,
    );
  }
  if (strong.size) {
    lines.push(`Strong at: ${[...strong].slice(0, 4).join(", ")}.`);
  }
  let pattern = lines.join(" ").trim();
  if (!pattern) pattern = "No prior pattern observed yet.";
  if (pattern.length > MAX_SUMMARY_CHARS) {
    pattern = pattern.slice(0, MAX_SUMMARY_CHARS - 1).trimEnd() + "…";
  }

  // ── dominant error type + frequency word ────────────────────────────
  const sortedErrors = [...errorCounts.entries()].sort((a, b) => b[1] - a[1]);
  const dominantError = sortedErrors[0]?.[0] ?? "none observed";
  const dominantCount = sortedErrors[0]?.[1] ?? 0;
  const frequency =
    dominantCount >= 4
      ? "frequent"
      : dominantCount >= 2
        ? "occasional"
        : dominantCount === 1
          ? "rare"
          : "none";

  // ── tutor notes (style + hint frequency preference) ─────────────────
  const tutorNoteParts: string[] = [];
  if (explanationStyle) {
    tutorNoteParts.push(`Prefers ${explanationStyle} explanations.`);
  }
  if (profile?.hint_frequency) {
    tutorNoteParts.push(`Hint cadence preference: ${profile.hint_frequency}.`);
  }
  if (sortedErrors.length > 1) {
    const otherErrors = sortedErrors
      .slice(1, 3)
      .map(([k]) => k)
      .join(", ");
    if (otherErrors) {
      tutorNoteParts.push(`Also watch: ${otherErrors}.`);
    }
  }
  const tutorNotes =
    tutorNoteParts.join(" ").trim() ||
    "Bias toward silence. Speak only when the misstep is concrete.";

  return {
    pattern_summary: pattern,
    error_type: dominantError,
    frequency,
    examples: examples.slice(0, 3),
    tutor_notes: tutorNotes,
  };
}

// ── private helpers ────────────────────────────────────────────────────

async function fetchClaims(userId: string): Promise<ClaimRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("claims")
    .select("predicate, object, status, confidence, reasoning, created_at")
    .eq("owner", userId)
    .in("status", ["confirmed", "pending"])
    .order("created_at", { ascending: false })
    .limit(MAX_CLAIMS);
  if (error) {
    console.warn("[memory] fetchClaims failed", error);
    return [];
  }
  return (data ?? []) as ClaimRow[];
}

/**
 * Same query as fetchClaims, but pulls the joined source_files.filename so
 * the cycle pipeline can show provenance ("from failed-exam.md") in the
 * AgentTrace. We tolerate the join failing (older rows have null source_file_id).
 */
async function fetchClaimsWithSource(
  userId: string,
): Promise<ClaimRowWithSource[]> {
  const { data, error } = await supabaseAdmin()
    .from("claims")
    .select(
      "predicate, object, status, confidence, reasoning, created_at, source_file_id, source_files:source_files!claims_source_file_id_fkey(filename)",
    )
    .eq("owner", userId)
    .in("status", ["confirmed", "pending"])
    .order("created_at", { ascending: false })
    .limit(MAX_CLAIMS);
  if (error) {
    console.warn("[memory] fetchClaimsWithSource failed", error);
    return [];
  }
  // Supabase's PostgREST embed sometimes returns the related row as an array
  // and sometimes as a single object depending on cardinality semantics. We
  // normalize to `{filename: string | null} | null` to keep the UI simple.
  return ((data ?? []) as RawClaimRowWithSource[]).map((row) => ({
    ...row,
    source_files: pickJoinedSourceFile(row.source_files),
  })) as ClaimRowWithSource[];
}

type RawClaimRowWithSource = ClaimRow & {
  source_file_id: string | null;
  source_files:
    | { filename: string | null }
    | { filename: string | null }[]
    | null;
};

function pickJoinedSourceFile(
  raw: RawClaimRowWithSource["source_files"],
): { filename: string | null } | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

/**
 * Pick the most demo-relevant claims to surface as receipts. We rank by:
 *   1. status=confirmed first, pending second
 *   2. higher confidence first
 *   3. predicates we recognize as "struggle facets" (weak_at_topic, etc.)
 *      bubble above generic ones (source_file_ingested) so the receipts feel
 *      meaningful, not just "we read your file".
 */
function pickReferenceClaims(
  claims: ClaimRowWithSource[],
  limit: number,
): KgReference[] {
  // Weight the predicates the StruggleProfile actually uses higher so we
  // surface the ones that ACTUALLY informed Predictive/Intervention.
  const FACET_WEIGHT: Record<string, number> = {
    weak_at_topic: 5,
    needs_review_on: 5,
    made_sign_error: 5,
    made_arithmetic_error: 5,
    made_concept_gap: 5,
    skipped_step: 5,
    misread_problem: 5,
    strong_at_topic: 4,
    mastered_topic: 4,
    prefers_explanation_style: 4,
    ran_out_of_time: 3,
  };

  const scored = claims
    // Mirror compileStruggleProfile's filter so the references shown reflect
    // the exact same set of claims that fed the profile.
    .filter(
      (c) =>
        c.status === "confirmed" || c.confidence >= PENDING_CONFIDENCE_FLOOR,
    )
    .map((c) => ({
      claim: c,
      score:
        (c.status === "confirmed" ? 2 : 1) +
        (FACET_WEIGHT[c.predicate] ?? 1) +
        c.confidence,
    }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ claim }) => ({
    predicate: claim.predicate,
    object_label: shortObject(claim.object) ?? stringObject(claim.object) ?? "",
    source_filename: claim.source_files?.filename ?? null,
    status: claim.status,
    confidence: claim.confidence,
  }));
}

async function fetchProfileRow(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .select("grade, current_class, hint_frequency")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[memory] fetchProfileRow failed", error);
    return null;
  }
  return (data ?? null) as ProfileRow | null;
}

function bump(m: Map<string, number>, k: string): void {
  m.set(k, (m.get(k) ?? 0) + 1);
}

function humanize(s: string): string {
  return s.replace(/_/g, " ");
}

function pushExample(
  examples: StruggleProfile["examples"],
  c: ClaimRow,
  what: string,
): void {
  if (examples.length >= 3) return;
  if (!c.reasoning) return;
  const date = c.created_at?.slice(0, 10) ?? "recent";
  examples.push({
    problem: shortObject(c.object) ?? "earlier work",
    date,
    what_went_wrong: c.reasoning.length > 120 ? `${c.reasoning.slice(0, 117)}…` : c.reasoning,
  });
  void what;
}

function stringObject(obj: unknown): string | null {
  if (obj == null) return null;
  if (typeof obj === "string") return obj.trim() || null;
  if (typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    for (const key of ["value", "name", "topic", "label"]) {
      const v = o[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

function shortObject(obj: unknown): string | null {
  if (obj == null) return null;
  if (typeof obj === "string") {
    return obj.length > 60 ? `${obj.slice(0, 57)}…` : obj;
  }
  if (typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    for (const key of ["problem", "label", "title", "name", "value"]) {
      const v = o[key];
      if (typeof v === "string" && v.trim()) {
        return v.length > 60 ? `${v.slice(0, 57)}…` : v;
      }
    }
  }
  return null;
}
