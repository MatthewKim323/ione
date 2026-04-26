/**
 * /api/sessions
 *   POST /api/sessions/start  — create a tutor session
 *   POST /api/sessions/:id/end — close a tutor session
 *   GET  /api/sessions/:id    — fetch session row (replay etc.)
 *
 * All routes require Authorization: Bearer <supabase_jwt>.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../server.js";
import { userIdFromAuthHeader } from "../integrations/supabase.js";
import {
  createSession,
  endSession,
  getSessionForUser,
} from "../lib/sessions.js";
import { AppError } from "../lib/errors.js";

export const sessionsRoute = new Hono<AppEnv>();

const StartBody = z.object({
  problem_text: z.string().nullable().optional(),
  problem_id: z.string().nullable().optional(),
  demo_mode: z.boolean().optional(),
  client_user_agent: z.string().nullable().optional(),
});

const EndBody = z.object({
  reason: z
    .enum(["user_stopped", "browser_closed", "cost_exceeded", "error", "idle_timeout"])
    .default("user_stopped"),
});

sessionsRoute.post("/start", async (c) => {
  const userId = await userIdFromAuthHeader(c.req.header("Authorization"));
  if (!userId) throw new AppError("unauthorized", "missing or invalid bearer token");
  c.set("userId", userId);

  const json = await c.req.json().catch(() => ({}));
  const parsed = StartBody.safeParse(json);
  if (!parsed.success) {
    throw new AppError("validation_error", "invalid /sessions/start body", {
      details: { issues: parsed.error.issues },
    });
  }

  const session = await createSession({
    userId,
    problemText: parsed.data.problem_text ?? null,
    problemId: parsed.data.problem_id ?? null,
    demoMode: Boolean(parsed.data.demo_mode ?? false),
    clientUserAgent: parsed.data.client_user_agent ?? c.req.header("User-Agent") ?? null,
  });

  return c.json({
    session_id: session.id,
    started_at: session.started_at,
    demo_mode: session.demo_mode,
  });
});

sessionsRoute.post("/:id/end", async (c) => {
  const userId = await userIdFromAuthHeader(c.req.header("Authorization"));
  if (!userId) throw new AppError("unauthorized", "missing or invalid bearer token");
  c.set("userId", userId);

  const json = await c.req.json().catch(() => ({}));
  const parsed = EndBody.safeParse(json);
  if (!parsed.success) {
    throw new AppError("validation_error", "invalid /sessions/:id/end body", {
      details: { issues: parsed.error.issues },
    });
  }
  const sessionId = c.req.param("id");
  const row = await endSession({
    sessionId,
    userId,
    reason: parsed.data.reason,
  });
  if (!row) throw new AppError("not_found", "session not found or already ended");
  return c.json({
    session_id: row.id,
    ended_at: row.ended_at,
    total_cost_usd: row.total_cost_usd,
    total_cycles: row.total_cycles,
    total_hints: row.total_hints,
  });
});

sessionsRoute.get("/:id", async (c) => {
  const userId = await userIdFromAuthHeader(c.req.header("Authorization"));
  if (!userId) throw new AppError("unauthorized", "missing or invalid bearer token");
  c.set("userId", userId);

  const sessionId = c.req.param("id");
  const row = await getSessionForUser(sessionId, userId);
  if (!row) throw new AppError("not_found", "session not found");
  return c.json(row);
});
