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
 * Streaming response: we DO NOT buffer. ElevenLabs flash_v2_5 produces the
 * first audio chunk in ~80ms — buffering would add seconds. The frontend's
 * audioStream.ts handles MSE chunked playback off this same response.
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
  try {
    const handle = await streamSpeech(cached.text);
    stream = handle.stream;
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

  return c.body(stream);
});
