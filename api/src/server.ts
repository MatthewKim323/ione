import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { serve } from "@hono/node-server";
import { env } from "./env.js";
import { logger } from "./lib/logger.js";
import { AppError, isAppError, toAppError } from "./lib/errors.js";
import { audioRoute } from "./routes/audio.js";
import { cycleRoute } from "./routes/cycle.js";
import { profileRoute } from "./routes/profile.js";
import { sessionsRoute } from "./routes/sessions.js";
import { sourcesRoute } from "./routes/sources.js";

export type AppEnv = {
  Variables: {
    requestId: string;
    userId: string | null;
  };
};

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // ── middleware ─────────────────────────────────────────────────────────
  const origins = env.ALLOWED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  app.use(
    "*",
    cors({
      origin: (incoming) =>
        origins.includes(incoming) || env.NODE_ENV === "development"
          ? incoming
          : "",
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type", "x-margin-session"],
      exposeHeaders: ["x-margin-cycle-id"],
      maxAge: 600,
    }),
  );

  app.use("*", async (c, next) => {
    const requestId =
      c.req.header("x-request-id") ?? crypto.randomUUID().slice(0, 8);
    c.set("requestId", requestId);
    c.set("userId", null);
    c.header("x-request-id", requestId);
    await next();
  });

  app.use(
    "*",
    honoLogger((message: string, ...rest: string[]) => {
      logger.info({ rest }, message);
    }),
  );

  // ── health ──────────────────────────────────────────────────────────────
  app.get("/healthz", (c) => {
    return c.json({
      ok: true,
      service: "ione-api",
      env: env.NODE_ENV,
      time: new Date().toISOString(),
    });
  });

  app.get("/", (c) =>
    c.json({
      service: "ione-api",
      docs: "see api/README.md",
      health: "/healthz",
    }),
  );

  // ── routes (lazy-mounted as phases land) ────────────────────────────────
  // Phase 1 / D
  app.route("/api/cycle", cycleRoute);
  app.route("/api/sessions", sessionsRoute);
  // Phase 2 / E7 — ElevenLabs TTS passthrough for hint audio.
  app.route("/api/audio", audioRoute);
  // Phase 2 / E8 — KG receipts surfaced into the tutor sidebar.
  app.route("/api/me", profileRoute);
  // Phase 3 / F4
  app.route("/api/sources", sourcesRoute);

  // ── error envelope ──────────────────────────────────────────────────────
  app.onError((err, c) => {
    const appErr: AppError = isAppError(err) ? err : toAppError(err);
    const requestId = c.get("requestId");
    logger.error(
      {
        requestId,
        code: appErr.code,
        status: appErr.status,
        message: appErr.message,
        details: appErr.details,
      },
      "request failed",
    );
    return c.json(appErr.toJSON(), appErr.status as 400 | 401 | 403 | 404 | 500);
  });

  app.notFound((c) =>
    c.json(
      { error: { code: "not_found", message: `no route for ${c.req.path}` } },
      404,
    ),
  );

  return app;
}

// ── boot ─────────────────────────────────────────────────────────────────
const app = createApp();

const port = env.PORT;
serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    logger.info({ port: info.port, env: env.NODE_ENV }, "ione-api listening");
  },
);

// graceful shutdown
const shutdown = (signal: string) => () => {
  logger.info({ signal }, "shutting down");
  process.exit(0);
};
process.on("SIGINT", shutdown("SIGINT"));
process.on("SIGTERM", shutdown("SIGTERM"));
