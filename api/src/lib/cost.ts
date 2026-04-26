/**
 * Cycle-level cost tracking + per-session / per-user-day budget guardrails.
 *
 * Phase 5 / R1.
 *
 * Why this lives here, not in routes/cycle.ts:
 *   • Pricing constants and the per-cycle accumulator (CycleCost) are already
 *     used by every agent. Co-locating budget enforcement keeps "cost" a
 *     single concept with one home.
 *   • Tests can construct CycleCost and assertBudget independent of HTTP.
 *
 * Budget enforcement runs PRE-cycle, before any LLM call:
 *   1. Read the current session's running total (tutor_sessions.total_cost_usd).
 *   2. Sum today's spend across all of the user's sessions (UTC day window).
 *   3. If either exceeds its cap, throw AppError("cost_exceeded") so the route
 *      returns 429 cost_exceeded with structured details. The frontend toast
 *      surface (R5) renders the friendly copy.
 *
 * We intentionally don't reserve budget pre-flight (we don't know the cost of
 * the next cycle in advance). Two design consequences:
 *   • Cycles can mildly overshoot the cap by one cycle's cost (~$0.02). This
 *     is acceptable — the cap is a guardrail, not an SLA.
 *   • The check is "have you already exceeded?", not "would this push you
 *     over?". This matches the user mental model: each cycle is small.
 *
 * Pricing reference (Sonnet 4.5, April 2026):
 *   $3 / 1M input tokens, $15 / 1M output tokens.
 * Image tokens are billed at the input rate; tile count varies by resolution.
 */

import { supabaseAdmin } from "../integrations/supabase.js";
import { env } from "../env.js";
import { AppError } from "./errors.js";
import { logger } from "./logger.js";

const PRICE_INPUT_USD_PER_MTOK = 3;
const PRICE_OUTPUT_USD_PER_MTOK = 15;

export function priceSonnetUsage(usage: {
  input_tokens?: number;
  output_tokens?: number;
}): number {
  const inputUsd = ((usage.input_tokens ?? 0) * PRICE_INPUT_USD_PER_MTOK) / 1_000_000;
  const outputUsd =
    ((usage.output_tokens ?? 0) * PRICE_OUTPUT_USD_PER_MTOK) / 1_000_000;
  return inputUsd + outputUsd;
}

/** Mathpix v3/text — very small fixed cost per call. */
export const MATHPIX_USD_PER_CALL = 0.004;

/** ElevenLabs Flash v2.5 — character-billed; rough estimate for cost meter. */
export const ELEVENLABS_USD_PER_1K_CHARS = 0.05;

export function priceElevenLabs(chars: number): number {
  return (chars / 1000) * ELEVENLABS_USD_PER_1K_CHARS;
}

/** Mutable accumulator passed through the cycle so every agent can `add()`. */
export class CycleCost {
  private usd = 0;
  private breakdown: Record<string, number> = {};

  add(label: string, usd: number): void {
    this.usd += usd;
    this.breakdown[label] = (this.breakdown[label] ?? 0) + usd;
  }

  total(): number {
    return Math.round(this.usd * 1_000_000) / 1_000_000;
  }

  detail(): Record<string, number> {
    return { ...this.breakdown };
  }
}

// ─── budget guardrails ──────────────────────────────────────────────────

export interface BudgetSnapshot {
  /** USD already spent in this session (read from tutor_sessions). */
  sessionUsd: number;
  /** USD spent across all of this user's sessions today (UTC window). */
  userDayUsd: number;
  /** The active per-session cap (env COST_CAP_USD_PER_SESSION). */
  sessionCap: number;
  /** The active per-user-day cap (env COST_CAP_USD_PER_USER_DAY). */
  userDayCap: number;
}

export interface BudgetCheckOpts {
  userId: string;
  sessionId: string;
}

/**
 * Read current spend for the session and the user's UTC day. Best-effort:
 * a transient DB error returns zeros so we don't block a paying user on
 * Supabase hiccups. The cap is still applied; a re-check on the next cycle
 * will catch up.
 */
export async function readBudget(opts: BudgetCheckOpts): Promise<BudgetSnapshot> {
  const sb = supabaseAdmin();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  // Fire both reads in parallel; the session row is cheap, the day-aggregate
  // pulls one column from at most a dozen rows for a typical user.
  const [sessionRes, dayRes] = await Promise.all([
    sb
      .from("tutor_sessions")
      .select("total_cost_usd")
      .eq("id", opts.sessionId)
      .eq("user_id", opts.userId)
      .maybeSingle(),
    sb
      .from("tutor_sessions")
      .select("total_cost_usd")
      .eq("user_id", opts.userId)
      .gte("started_at", dayStart.toISOString()),
  ]);

  let sessionUsd = 0;
  if (sessionRes.error) {
    logger.warn(
      { err: sessionRes.error.message, sessionId: opts.sessionId },
      "readBudget: session read failed",
    );
  } else if (sessionRes.data) {
    sessionUsd = Number((sessionRes.data as { total_cost_usd: number }).total_cost_usd ?? 0);
  }

  let userDayUsd = 0;
  if (dayRes.error) {
    logger.warn(
      { err: dayRes.error.message, userId: opts.userId },
      "readBudget: user-day read failed",
    );
  } else {
    const rows = (dayRes.data ?? []) as { total_cost_usd: number | null }[];
    userDayUsd = rows.reduce((sum, r) => sum + Number(r.total_cost_usd ?? 0), 0);
  }

  return {
    sessionUsd,
    userDayUsd,
    sessionCap: env.COST_CAP_USD_PER_SESSION,
    userDayCap: env.COST_CAP_USD_PER_USER_DAY,
  };
}

/**
 * Throw AppError("cost_exceeded") if either cap is already breached.
 *
 * Returns the snapshot so the caller can include it in logs / SSE events
 * without a second round-trip.
 */
export async function assertBudget(opts: BudgetCheckOpts): Promise<BudgetSnapshot> {
  const snap = await readBudget(opts);

  if (snap.sessionUsd >= snap.sessionCap) {
    throw new AppError(
      "cost_exceeded",
      "session cost cap reached — start a new session to continue",
      {
        details: {
          scope: "session",
          spent_usd: round6(snap.sessionUsd),
          cap_usd: snap.sessionCap,
        },
      },
    );
  }
  if (snap.userDayUsd >= snap.userDayCap) {
    throw new AppError(
      "cost_exceeded",
      "daily cost cap reached — try again tomorrow",
      {
        details: {
          scope: "user_day",
          spent_usd: round6(snap.userDayUsd),
          cap_usd: snap.userDayCap,
        },
      },
    );
  }

  return snap;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
