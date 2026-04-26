/**
 * POST /api/cycle — multipart upload of a single capture frame.
 *
 * Request body (multipart/form-data):
 *   • frame: WebP blob (the only required file part)
 *   • payload: JSON string with {
 *       session_id, prev_cycle_id?, is_stalled, seconds_since_last_change,
 *       client_ts, trajectory: TrajectoryFrame[]
 *     }
 *
 * Response: text/event-stream — sequence of CycleEvent objects.
 *
 * The route is the only place that owns:
 *   • auth (validates Supabase JWT, scopes everything to user_id)
 *   • session lookup + canonical caching
 *   • SSE streaming back to the browser
 *   • DB persistence after the orchestrator returns
 *
 * The orchestrator is stateless and returns both `events` and `persist`
 * payloads — the route streams the events as they're computed (Phase 1: emit
 * after the run completes; Phase 2's stream will emit per-step) and writes
 * the persist payload to tutor_cycles + tutor_hints.
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { Buffer } from "node:buffer";
import type { AppEnv } from "../server.js";
import { userIdFromAuthHeader } from "../integrations/supabase.js";
import { AppError, isAppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { formatSseEvent, type CycleEvent } from "../lib/sse.js";
import {
  getSessionForUser,
  fetchRecentHints,
  persistCycle,
  nextCycleIndex,
} from "../lib/sessions.js";
import { runCycle } from "../agents/orchestrator.js";
import type {
  CanonicalSolution,
  TrajectoryFrame,
} from "../agents/types.js";
import { getStruggleSnapshot } from "../lib/memory.js";
import { assertBudget } from "../lib/cost.js";
import { maybeStoreFrame } from "../lib/frameStorage.js";

export const cycleRoute = new Hono<AppEnv>();

const TrajectoryFrameSchema = z.object({
  cycle_index: z.number().int().nonnegative(),
  client_ts: z.string(),
  page_state: z
    .enum(["fresh_problem", "in_progress", "near_complete", "stalled_or_stuck"])
    .default("in_progress"),
  current_step_latex: z.string().nullable().default(null),
  completed_steps_count: z.number().int().nonnegative().default(0),
  step_status: z
    .enum([
      "correct",
      "minor_error",
      "major_error",
      "stalled",
      "off_track",
      "complete",
    ])
    .nullable()
    .default(null),
  is_stalled: z.boolean().default(false),
  seconds_since_last_change: z.number().int().nonnegative().default(0),
  spoke: z.boolean().default(false),
  hint_text: z.string().nullable().default(null),
});

const PayloadSchema = z.object({
  session_id: z.string().uuid(),
  prev_cycle_id: z.string().uuid().optional(),
  is_stalled: z.boolean(),
  seconds_since_last_change: z.number().int().nonnegative(),
  client_ts: z.string().optional(),
  trajectory: z.array(TrajectoryFrameSchema).max(10).default([]),
  /**
   * "explain" — student pressed "I need help".
   * "voice"   — student held push-to-talk and asked a verbal question;
   *             student_question carries the transcript.
   * In both cases the orchestrator skips the policy gate, cooldown, and
   * dedup, and runs the intervention agent in walkthrough mode. null =
   * autonomous capture.
   *
   * The frontend always sends an explicit value (null when autonomous)
   * to make the field type-stable across requests.
   */
  assistance_mode: z
    .union([z.literal("explain"), z.literal("voice"), z.null()])
    .optional()
    .default(null),
  /**
   * Verbatim transcript of the student's spoken question, set only when
   * assistance_mode === "voice". Threaded into the intervention agent's
   * user payload so the answer addresses what was asked, and surfaced
   * via the voice_question + hint SSE events for the AgentTrace UI.
   */
  student_question: z
    .string()
    .max(2000)
    .optional()
    .nullable()
    .default(null),
});

cycleRoute.post("/", async (c) => {
  const userId = await userIdFromAuthHeader(c.req.header("Authorization"));
  if (!userId) throw new AppError("unauthorized", "missing or invalid bearer token");
  c.set("userId", userId);

  // Parse multipart body. Hono's parseBody returns string | File for each key.
  const form = await c.req.parseBody({ all: false }).catch((e) => {
    throw new AppError("bad_request", `multipart parse failed: ${errMsg(e)}`);
  });

  const framePart = form["frame"];
  const payloadPart = form["payload"];

  // Hono returns string | File for each part; in Node 20+ File extends Blob.
  // We duck-type on `arrayBuffer` to avoid `instanceof File` lib churn.
  if (
    !framePart ||
    typeof framePart === "string" ||
    typeof (framePart as { arrayBuffer?: unknown }).arrayBuffer !== "function"
  ) {
    throw new AppError("bad_request", "missing 'frame' file part (WebP)");
  }
  if (typeof payloadPart !== "string") {
    throw new AppError("bad_request", "missing 'payload' JSON string");
  }

  const payloadJson = safeJsonParse(payloadPart);
  if (!payloadJson.ok) {
    throw new AppError("bad_request", "payload must be valid JSON", {
      details: { error: payloadJson.error },
    });
  }
  const parsed = PayloadSchema.safeParse(payloadJson.value);
  if (!parsed.success) {
    throw new AppError("validation_error", "invalid /cycle payload", {
      details: { issues: parsed.error.issues },
    });
  }
  const payload = parsed.data;

  // Load session row + check ownership
  const session = await getSessionForUser(payload.session_id, userId);
  if (!session) throw new AppError("not_found", "session not found");
  if (session.ended_at)
    throw new AppError("conflict", "session already ended", {
      details: { ended_at: session.ended_at },
    });

  // Budget guardrail (Phase 5 / R1). Runs PRE-cycle so we don't burn LLM
  // credits past the cap. assertBudget throws AppError("cost_exceeded") with
  // structured details when either the per-session or per-user-day cap is
  // already reached. The frontend's toast surface (R5) renders the friendly
  // copy and closes the SSE stream.
  await assertBudget({ userId, sessionId: session.id });

  // Read frame bytes (as base64) — orchestrator wants base64
  const arrayBuffer = await (framePart as { arrayBuffer(): Promise<ArrayBuffer> })
    .arrayBuffer();
  const frameBase64 = Buffer.from(arrayBuffer).toString("base64");

  // Pull recent hints for cooldown / dedup, plus the longitudinal struggle
  // snapshot (profile + the actual claims it was compiled from with their
  // source filenames). The snapshot powers BOTH (a) the agents — they get
  // the compiled profile — and (b) the AgentTrace UI, which gets the claim
  // references rendered as receipts so the demo audience can see "memory
  // was actually consulted, here's exactly what came back".
  //
  // Best-effort: a missing snapshot just means cold-start (no prior facts),
  // which we surface as `had_profile=false` to the UI rather than as an
  // error.
  const [recentHints, struggleSnapshot] = await Promise.all([
    fetchRecentHints({ sessionId: session.id }),
    getStruggleSnapshot(userId).catch((e) => {
      logger.warn(
        { err: errMsg(e), userId },
        "getStruggleSnapshot failed — falling through with empty snapshot",
      );
      return { profile: null, references: [], claim_count: 0 };
    }),
  ]);
  const struggleProfile = struggleSnapshot.profile;

  const cycleId = crypto.randomUUID();
  c.header("x-margin-cycle-id", cycleId);

  // Stream SSE — Phase 1 runs the orchestrator to completion and then emits
  // the events sequentially. Phase 2's design will splice events into the
  // stream as they're computed. Streaming the buffer once still satisfies
  // the SSE contract (browser eventsource fires on each `event:`).
  return streamSSE(c, async (stream) => {
    const trajectory = (payload.trajectory ?? []) as TrajectoryFrame[];
    const canonical = (session.canonical_solution_json ?? null) as
      | CanonicalSolution
      | null;

    // Emit the kg_lookup signal FIRST so the AgentTrace shows the "memory
    // referenced" stage before any model agent starts work. This is the
    // visible proof that the longitudinal knowledge graph was consulted on
    // every cycle, with concrete receipts (predicate + source filename).
    //
    // We always emit the event — even on cold start (no profile, zero
    // claims) — because "we looked, found nothing yet" is itself meaningful
    // for the demo and clearly distinguishes "running blind" from "running
    // with memory" once files have been ingested.
    const kgEvent: CycleEvent = {
      type: "kg_lookup",
      had_profile: Boolean(struggleSnapshot.profile),
      claim_count: struggleSnapshot.claim_count,
      pattern_summary: struggleSnapshot.profile?.pattern_summary ?? null,
      dominant_error: struggleSnapshot.profile?.error_type ?? null,
      frequency: struggleSnapshot.profile?.frequency ?? null,
      references: struggleSnapshot.references,
    };
    await stream.write(formatSseEvent(kgEvent));

    let result: Awaited<ReturnType<typeof runCycle>> | null = null;
    try {
      result = await runCycle({
        frameWebpBase64: frameBase64,
        cycleId,
        session: {
          id: session.id,
          user_id: userId,
          canonical_solution: canonical,
          problem_text: session.problem_text,
          problem_id: session.problem_id,
          demo_mode: Boolean(session.demo_mode),
          started_at_ms: Date.parse(session.started_at),
        },
        isStalled: payload.is_stalled,
        secondsSinceLastChange: payload.seconds_since_last_change,
        trajectory,
        recentHints,
        struggleProfile,
        assistanceMode: payload.assistance_mode ?? undefined,
        studentQuestion:
          payload.assistance_mode === "voice" && payload.student_question
            ? payload.student_question
            : undefined,
      });
    } catch (e) {
      logger.error({ err: errMsg(e), cycleId }, "orchestrator threw");
      const errEvt: CycleEvent = {
        type: "error",
        message: errMsg(e),
        code: isAppError(e) ? e.code : "internal",
      };
      await stream.write(formatSseEvent(errEvt));
      return;
    }

    for (const evt of result.events) {
      await stream.write(formatSseEvent(evt));
    }

    // Phase 5 / R7: optional frame archival. Runs in parallel with persist
    // so storage upload latency never blocks the cycle row write. Always
    // best-effort — a failed upload returns null and the cycle row simply
    // has no frame_storage_path.
    const frameStorePromise = maybeStoreFrame({
      userId,
      sessionId: session.id,
      cycleId,
      frameBase64,
    });

    persistCycle({
      sessionId: session.id,
      userId,
      cycleIndex: await nextCycleIndex(session.id).catch(() => 0),
      clientTs: payload.client_ts ?? new Date().toISOString(),
      payload: result.persist,
      frameStoragePath: await frameStorePromise.catch(() => null),
    }).catch((e) => {
      logger.error(
        { err: errMsg(e), cycleId, sessionId: session.id },
        "persistCycle failed (events already streamed)",
      );
    });
  });
});

// ─── helpers ─────────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  if (isAppError(e)) return `${e.code}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return String(e);
}

function safeJsonParse(s: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
