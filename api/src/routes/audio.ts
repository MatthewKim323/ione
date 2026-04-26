/**
 * GET /api/audio/:hintId — TTS passthrough for hint audio.
 *
 * The browser calls this with a Bearer JWT after receiving an SSE `hint`
 * event with `audio_url: "/api/audio/<id>"`. We:
 *   1. Verify the user.
 *   2. Look up hint text from the in-memory cache (see lib/hintCache.ts for
 *      why we don't query Postgres here).
 *   3. POST to ElevenLabs and pipe the MP3 stream straight back.
 *
 * Streaming response: we DO NOT buffer on the server. The landing app
 * buffers the MP3 to a Blob for `<audio>` playback (raw MP3 is unreliable
 * via MediaSource in common browsers).
 *
 * POST /api/audio/preview — short canned-line TTS for the dashboard "hear the
 * voice" button. Same ElevenLabs path, capped at 240 chars, no cycleId/hint
 * machinery. Used so a logged-in user can sample the tutor voice without
 * starting a session.
 */

import { Hono } from "hono";
import type { AppEnv } from "../server.js";
import { userIdFromAuthHeader } from "../integrations/supabase.js";
import {
  elevenLabsConfigured,
  streamSpeech,
} from "../integrations/elevenlabs.js";
import { consumeHintForAudio } from "../lib/hintCache.js";
import { AppError, isAppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export const audioRoute = new Hono<AppEnv>();

// Hard cap on preview text. Long-form copy belongs in a real session.
const PREVIEW_CHAR_LIMIT = 240;
const PREVIEW_DEFAULT_LINE =
  "hi — i'm ione. i'll keep an eye on your work and chime in when something looks off.";

audioRoute.post("/preview", async (c) => {
  const userId = await userIdFromAuthHeader(c.req.header("Authorization"));
  if (!userId) {
    throw new AppError("unauthorized", "missing or invalid bearer token");
  }
  c.set("userId", userId);

  if (!elevenLabsConfigured()) {
    throw new AppError(
      "bad_request",
      "tts is not configured — set ELEVENLABS_API_KEY",
    );
  }

  // Body is optional — caller can POST {} for the default line.
  let body: unknown = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const requested =
    typeof (body as { text?: unknown })?.text === "string"
      ? ((body as { text: string }).text.trim() as string)
      : "";
  const text = (requested.length > 0 ? requested : PREVIEW_DEFAULT_LINE).slice(
    0,
    PREVIEW_CHAR_LIMIT,
  );

  let stream: ReadableStream<Uint8Array>;
  let voiceId = "";
  let fellBack = false;
  try {
    const handle = await streamSpeech(text);
    stream = handle.stream;
    voiceId = handle.voiceId;
    fellBack = handle.fellBack;
  } catch (e) {
    if (isAppError(e)) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    logger.error({ err: msg, userId }, "elevenlabs preview failed");
    throw new AppError("upstream_error", `tts preview failed: ${msg}`);
  }

  c.header("Content-Type", "audio/mpeg");
  c.header("Cache-Control", "no-store");
  c.header("X-Audio-Source", "preview");
  // Surface fallback state to the dashboard so it can warn the user that
  // their configured voice is paywalled and we used a free-tier voice.
  c.header("X-Voice-Id", voiceId);
  c.header("X-Voice-Fell-Back", fellBack ? "1" : "0");
  return c.body(stream);
});

audioRoute.get("/:hintId", async (c) => {
  const userId = await userIdFromAuthHeader(c.req.header("Authorization"));
  if (!userId) {
    throw new AppError("unauthorized", "missing or invalid bearer token");
  }
  c.set("userId", userId);

  if (!elevenLabsConfigured()) {
    throw new AppError(
      "bad_request",
      "tts is not configured — set ELEVENLABS_API_KEY",
    );
  }

  const hintId = c.req.param("hintId");
  const cached = consumeHintForAudio(hintId);
  if (!cached) {
    throw new AppError(
      "not_found",
      "hint audio expired — try a fresh cycle",
      { details: { hintId } },
    );
  }

  let stream: ReadableStream<Uint8Array>;
  let voiceId = "";
  let fellBack = false;
  try {
    const handle = await streamSpeech(cached.text);
    stream = handle.stream;
    voiceId = handle.voiceId;
    fellBack = handle.fellBack;
  } catch (e) {
    if (isAppError(e)) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    logger.error({ err: msg, hintId }, "elevenlabs speech failed");
    throw new AppError("upstream_error", `tts failed: ${msg}`);
  }

  // Native streaming response. Hono's `c.body(stream)` accepts a
  // ReadableStream and pipes chunks to the client without buffering. This
  // is what makes first-byte playback feel instant.
  c.header("Content-Type", "audio/mpeg");
  // Allow the browser to parse partials before the full response lands —
  // MSE expects chunked transfer.
  c.header("Cache-Control", "no-store");
  c.header("X-Hint-Cycle", cached.cycleId);
  c.header("X-Voice-Id", voiceId);
  c.header("X-Voice-Fell-Back", fellBack ? "1" : "0");

  return c.body(stream);
});
