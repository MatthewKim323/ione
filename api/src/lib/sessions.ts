/**
 * Database access for tutor_sessions / tutor_cycles / tutor_hints.
 * Service-role client — RLS bypassed; ALWAYS pass user_id into where-clauses.
 */

import { supabaseAdmin } from "../integrations/supabase.js";
import type { CanonicalSolution } from "../agents/types.js";
import type { OrchestratorPersist } from "../agents/orchestrator.js";
import { AppError } from "./errors.js";
import { logger } from "./logger.js";

export type TutorSessionRow = {
  id: string;
  user_id: string;
  problem_text: string | null;
  problem_topic: string | null;
  problem_id: string | null;
  canonical_solution_json: unknown;
  demo_mode: boolean;
  client_user_agent: string | null;
  started_at: string;
  ended_at: string | null;
  total_cost_usd: number;
  total_cycles: number;
  total_hints: number;
};

export async function createSession(opts: {
  userId: string;
  problemText: string | null;
  problemId: string | null;
  demoMode: boolean;
  clientUserAgent: string | null;
}): Promise<TutorSessionRow> {
  const { data, error } = await supabaseAdmin()
    .from("tutor_sessions")
    .insert({
      user_id: opts.userId,
      problem_text: opts.problemText,
      problem_id: opts.problemId,
      demo_mode: opts.demoMode,
      client_user_agent: opts.clientUserAgent,
    })
    .select("*")
    .single();

  if (error) {
    // Postgres unique violation — concurrent session lock
    if ((error as { code?: string }).code === "23505") {
      throw new AppError(
        "conflict",
        "A tutor session is already active for this user.",
        { details: { hint: "End the existing session before starting a new one." } },
      );
    }
    logger.error({ err: error.message, userId: opts.userId }, "createSession failed");
    throw new AppError("internal", `createSession: ${error.message}`);
  }
  return data as TutorSessionRow;
}

export async function getSessionForUser(
  sessionId: string,
  userId: string,
): Promise<TutorSessionRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("tutor_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    logger.error({ err: error.message, sessionId }, "getSessionForUser failed");
    throw new AppError("internal", `getSessionForUser: ${error.message}`);
  }
  return (data ?? null) as TutorSessionRow | null;
}

export async function endSession(opts: {
  sessionId: string;
  userId: string;
  reason:
    | "user_stopped"
    | "browser_closed"
    | "cost_exceeded"
    | "error"
    | "idle_timeout";
}): Promise<TutorSessionRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("tutor_sessions")
    .update({
      ended_at: new Date().toISOString(),
      end_reason: opts.reason,
    })
    .eq("id", opts.sessionId)
    .eq("user_id", opts.userId)
    .is("ended_at", null)
    .select("*")
    .maybeSingle();
  if (error) {
    logger.error({ err: error.message }, "endSession failed");
    throw new AppError("internal", `endSession: ${error.message}`);
  }
  return (data ?? null) as TutorSessionRow | null;
}

/**
 * Return the most recent N hints for cooldown / dedup. Includes `created_at`
 * as ms-epoch so policy.ts can compute cooldownMs.
 */
export async function fetchRecentHints(opts: {
  sessionId: string;
  limit?: number;
}): Promise<{ text: string; createdAt: number }[]> {
  const limit = opts.limit ?? 8;
  const { data, error } = await supabaseAdmin()
    .from("tutor_hints")
    .select("text, created_at")
    .eq("session_id", opts.sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    logger.warn({ err: error.message }, "fetchRecentHints failed");
    return [];
  }
  // Reverse to oldest→newest for policy semantics.
  return ((data ?? []) as { text: string; created_at: string }[])
    .map((r) => ({
      text: r.text,
      createdAt: Date.parse(r.created_at),
    }))
    .reverse();
}

/**
 * Persist one orchestrator cycle: insert tutor_cycles row, optionally insert
 * tutor_hints, update session totals + canonical cache. All in one round-trip
 * cluster (no transactions in supabase-js for now; we accept the small
 * crash-window risk).
 */
export async function persistCycle(opts: {
  sessionId: string;
  userId: string;
  cycleIndex: number;
  clientTs: string;
  payload: OrchestratorPersist;
  /**
   * Optional storage path for the WebP frame archived this cycle (Phase 5 / R7).
   * Set when STORE_FRAMES=1 and the upload to the `tutor_frames` bucket succeeded.
   */
  frameStoragePath?: string | null;
}): Promise<{ cycle_db_id: string; hint_db_id: string | null }> {
  const cycle = opts.payload.cycle;

  const { data: cycleRow, error: cycleErr } = await supabaseAdmin()
    .from("tutor_cycles")
    .insert({
      session_id: opts.sessionId,
      user_id: opts.userId,
      cycle_index: opts.cycleIndex,
      client_ts: opts.clientTs,
      server_finished_at: new Date().toISOString(),
      frame_storage_path: opts.frameStoragePath ?? null,

      diff_pct: cycle.diff_pct,
      is_stalled: cycle.is_stalled,
      seconds_since_last_change: cycle.seconds_since_last_change,

      ocr_problem_text: cycle.ocr_problem_text,
      ocr_current_step_latex: cycle.ocr_current_step_latex,
      ocr_completed_steps_latex: cycle.ocr_completed_steps_latex,
      ocr_page_state: cycle.ocr_page_state,
      ocr_confidence: cycle.ocr_confidence,
      ocr_is_blank: cycle.ocr_is_blank,
      mathpix_latex: cycle.mathpix_latex,
      mathpix_confidence: cycle.mathpix_confidence,

      step_status: cycle.step_status,
      error_type: cycle.error_type,
      error_location: cycle.error_location,
      severity: cycle.severity,
      what_they_should_do_next: cycle.what_they_should_do_next,
      scaffolding_question: cycle.scaffolding_question,
      matches_known_error_pattern: cycle.matches_known_error_pattern,

      predicted_error_type: cycle.predicted_error_type,
      predicted_error_basis: cycle.predicted_error_basis,
      predicted_confidence: cycle.predicted_confidence,
      predicted_recommend_intervene: cycle.predicted_recommend_intervene,

      spoke: cycle.spoke,
      suppression_reason: cycle.suppression_reason,

      cost_usd: cycle.cost_usd,
      latency_ms: cycle.latency_ms,
      tokens_input: cycle.tokens_input,
      tokens_output: cycle.tokens_output,

      ocr_json: cycle.ocr_json,
      reasoning_json: cycle.reasoning_json,
      predictive_json: cycle.predictive_json,
      intervention_json: cycle.intervention_json,
    })
    .select("id")
    .single();

  if (cycleErr) {
    logger.error({ err: cycleErr.message }, "persistCycle: insert tutor_cycles failed");
    throw new AppError("internal", `persistCycle: ${cycleErr.message}`);
  }

  const cycleDbId = (cycleRow as { id: string }).id;

  // tutor_hints row (only if we surfaced a hint)
  let hintDbId: string | null = null;
  if (opts.payload.hint) {
    const { data: hintRow, error: hintErr } = await supabaseAdmin()
      .from("tutor_hints")
      .insert({
        session_id: opts.sessionId,
        cycle_id: cycleDbId,
        user_id: opts.userId,
        hint_type: opts.payload.hint.hint_type,
        text: opts.payload.hint.text,
        predicted: opts.payload.hint.predicted,
        severity: opts.payload.hint.severity,
        reasoning_for_decision: opts.payload.hint.reasoning_for_decision,
      })
      .select("id")
      .single();

    if (hintErr) {
      logger.warn(
        { err: hintErr.message },
        "persistCycle: insert tutor_hints failed (cycle still saved)",
      );
    } else {
      hintDbId = (hintRow as { id: string }).id;
    }
  }

  // Roll up session totals (best-effort).
  await rollupSessionTotals({
    sessionId: opts.sessionId,
    userId: opts.userId,
    addCost: cycle.cost_usd,
    addCycle: 1,
    addHint: opts.payload.hint ? 1 : 0,
    canonical: opts.payload.canonicalToCache,
  });

  return { cycle_db_id: cycleDbId, hint_db_id: hintDbId };
}

/**
 * Bump session totals + (optionally) cache the canonical solution. Uses an
 * atomic Postgres update via RPC-style raw expressions where possible.
 */
async function rollupSessionTotals(opts: {
  sessionId: string;
  userId: string;
  addCost: number;
  addCycle: number;
  addHint: number;
  canonical: CanonicalSolution | null;
}): Promise<void> {
  const sb = supabaseAdmin();
  // Read current totals, then write back. Race-window is acceptable for
  // single-tab sessions (the partial unique index already enforces this).
  const { data: current, error: readErr } = await sb
    .from("tutor_sessions")
    .select("total_cost_usd, total_cycles, total_hints, canonical_solution_json")
    .eq("id", opts.sessionId)
    .eq("user_id", opts.userId)
    .maybeSingle();
  if (readErr || !current) {
    logger.warn({ err: readErr?.message }, "rollupSessionTotals: read failed");
    return;
  }
  const c = current as {
    total_cost_usd: number;
    total_cycles: number;
    total_hints: number;
    canonical_solution_json: unknown;
  };

  const update: Record<string, unknown> = {
    total_cost_usd: Number((c.total_cost_usd ?? 0)) + opts.addCost,
    total_cycles: (c.total_cycles ?? 0) + opts.addCycle,
    total_hints: (c.total_hints ?? 0) + opts.addHint,
  };
  if (opts.canonical && !c.canonical_solution_json) {
    update.canonical_solution_json = opts.canonical;
  }

  const { error: writeErr } = await sb
    .from("tutor_sessions")
    .update(update)
    .eq("id", opts.sessionId)
    .eq("user_id", opts.userId);
  if (writeErr) {
    logger.warn({ err: writeErr.message }, "rollupSessionTotals: write failed");
  }
}

/**
 * 0-based cycle index for the next cycle. Used so cycle_index has a stable
 * monotonic order — replay relies on this.
 */
export async function nextCycleIndex(sessionId: string): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from("tutor_cycles")
    .select("cycle_index")
    .eq("session_id", sessionId)
    .order("cycle_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return 0;
  return (data as { cycle_index: number }).cycle_index + 1;
}
