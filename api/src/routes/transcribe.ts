/**
 * POST /api/transcribe — push-to-talk speech-to-text.
 *
 * Used by the TutorWorkspace's "hold to ask" button (and spacebar PTT
 * shortcut). The student records a question, releases the key, and the
 * resulting WebM/OGG blob comes here. We forward to ElevenLabs Scribe and
 * return the transcribed text.
 *
 * The frontend then takes that text and posts it to /api/cycle as the
 * student_question alongside a fresh frame — so the existing multi-agent
 * pipeline (memory → OCR → reasoning → predictive → policy → intervention)
 * runs exactly as if the student had pressed "I need help", with the
 * intervention agent given the question as additional context.
 *
 * Request (multipart/form-data):
 *   • audio: Blob (audio/webm or audio/ogg recommended)
 *   • duration_sec: optional string — caller-side recording length, used
 *     for cost estimation when Scribe doesn't echo a duration back.
 *
 * Response (application/json):
 *   { text: string, language_code: string|null, language_probability: number|null,
 *     usd: number, ms: number }
 */

import { Hono } from "hono";
import type { AppEnv } from "../server.js";
import { userIdFromAuthHeader } from "../integrations/supabase.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { transcribeAudio } from "../integrations/elevenlabs.js";

export const transcribeRoute = new Hono<AppEnv>();

const MAX_AUDIO_BYTES = 8 * 1024 * 1024; // 8 MB — push-to-talk should be tiny
const MAX_DURATION_SEC = 60; // hard cap on PTT clip length

transcribeRoute.post("/", async (c) => {
  const userId = await userIdFromAuthHeader(c.req.header("Authorization"));
  if (!userId) {
    throw new AppError("unauthorized", "missing or invalid bearer token");
  }
  c.set("userId", userId);

  const form = await c.req.parseBody({ all: false }).catch((e) => {
    throw new AppError(
      "bad_request",
      `multipart parse failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  });

  const audioPart = form["audio"];
  if (
    !audioPart ||
    typeof audioPart === "string" ||
    typeof (audioPart as { arrayBuffer?: unknown }).arrayBuffer !== "function"
  ) {
    throw new AppError("bad_request", "missing 'audio' file part");
  }

  const blob = audioPart as Blob & { name?: string; size: number; type: string };
  if (blob.size === 0) {
    throw new AppError("bad_request", "audio blob is empty");
  }
  if (blob.size > MAX_AUDIO_BYTES) {
    throw new AppError(
      "bad_request",
      `audio blob too large: ${blob.size} > ${MAX_AUDIO_BYTES} bytes`,
    );
  }

  const durationStr =
    typeof form["duration_sec"] === "string" ? form["duration_sec"] : null;
  let durationSec: number | undefined;
  if (durationStr) {
    const parsed = Number(durationStr);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_DURATION_SEC) {
      durationSec = parsed;
    }
  }

  // Pick a sane filename based on the blob's MIME type so ElevenLabs picks
  // the right decoder. MediaRecorder usually emits audio/webm;codecs=opus
  // on Chromium; Safari falls back to audio/mp4 or audio/ogg.
  const mime = blob.type || "audio/webm";
  const ext = pickExt(mime);
  const filename = `voice-${Date.now()}.${ext}`;

  const startedAt = Date.now();
  const transcript = await transcribeAudio(blob, filename, durationSec);
  const ms = Date.now() - startedAt;

  logger.info(
    {
      userId,
      bytes: blob.size,
      mime,
      durationSec,
      textLen: transcript.text.length,
      lang: transcript.languageCode,
      ms,
    },
    "transcribe ok",
  );

  return c.json({
    text: transcript.text,
    language_code: transcript.languageCode,
    language_probability: transcript.languageProbability,
    usd: transcript.usd,
    ms,
  });
});

function pickExt(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  return "webm";
}
