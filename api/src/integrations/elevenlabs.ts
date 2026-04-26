import { env } from "../env.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { priceElevenLabs } from "../lib/cost.js";

const ELEVEN_BASE = "https://api.elevenlabs.io";

/**
 * Free-tier-accessible default voice. ElevenLabs paywalls the entire Voice
 * Library (including community-shared voices like jqcCZkN6Knx8BJ5TBdYR)
 * behind a Starter plan. To keep the demo audible while the configured
 * voice is paywalled, we transparently fall back to "Bella" — a premade
 * voice that all accounts can synthesize.
 */
const FREE_TIER_FALLBACK_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Bella

export type ElevenStreamHandle = {
  /** Async iterator of MP3 chunks for piping to MediaSource. */
  stream: ReadableStream<Uint8Array>;
  /** Estimated cost (calculated up-front from text length, not actual). */
  usd: number;
  chars: number;
  /** Which voice ElevenLabs actually rendered (after any fallback). */
  voiceId: string;
  /** True when the configured voice was paywalled and we used the fallback. */
  fellBack: boolean;
};

export function elevenLabsConfigured(): boolean {
  return Boolean(env.ELEVENLABS_API_KEY);
}

async function callElevenLabs(text: string, voiceId: string): Promise<Response> {
  const url = `${ELEVEN_BASE}/v1/text-to-speech/${voiceId}/stream?optimize_streaming_latency=4&output_format=mp3_44100_128`;
  return fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY!,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: env.ELEVENLABS_MODEL_ID,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
}

/**
 * Detect ElevenLabs' "paid_plan_required" 402 — the response body looks like
 *   {"detail":{"type":"payment_required","code":"paid_plan_required",…}}
 * We need to peek the JSON without consuming the streamable body, so this
 * runs only when status === 402.
 */
async function isPaidPlanGate(res: Response): Promise<boolean> {
  if (res.status !== 402) return false;
  try {
    const txt = await res.clone().text();
    return /paid_plan_required|library voices/i.test(txt);
  } catch {
    return false;
  }
}

/**
 * Stream MP3 audio for a hint. Returns a ReadableStream the caller can
 * either pipe into an HTTP response (for /api/audio/:hintId passthrough)
 * or `tee()` to also persist to Supabase Storage.
 *
 * If the configured voice is paywalled (free-tier account hitting a Voice
 * Library voice), we transparently retry once with FREE_TIER_FALLBACK_VOICE_ID
 * so the demo stays audible. The returned `fellBack` flag lets the caller
 * surface that to the UI.
 */
export async function streamSpeech(text: string): Promise<ElevenStreamHandle> {
  if (!elevenLabsConfigured()) {
    throw new AppError(
      "bad_request",
      "ELEVENLABS_API_KEY not set — audio streaming disabled",
    );
  }

  const configuredVoice = env.ELEVENLABS_VOICE_ID;

  let res: Response;
  try {
    res = await callElevenLabs(text, configuredVoice);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error({ err: msg }, "elevenlabs fetch failed");
    throw new AppError("upstream_error", `elevenlabs: ${msg}`, { cause: e });
  }

  let fellBack = false;
  let voiceUsed = configuredVoice;

  // 402 paywall fallback — only for the specific "library voice on free
  // tier" gate, NOT generic billing failures (out of credits, etc).
  if (await isPaidPlanGate(res)) {
    logger.warn(
      {
        configuredVoice,
        fallbackVoice: FREE_TIER_FALLBACK_VOICE_ID,
      },
      "elevenlabs voice is paywalled on this account — falling back to free voice",
    );
    try {
      res = await callElevenLabs(text, FREE_TIER_FALLBACK_VOICE_ID);
      fellBack = true;
      voiceUsed = FREE_TIER_FALLBACK_VOICE_ID;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error({ err: msg }, "elevenlabs fallback fetch failed");
      throw new AppError("upstream_error", `elevenlabs fallback: ${msg}`, {
        cause: e,
      });
    }
  }

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    logger.warn(
      { status: res.status, body: body.slice(0, 200) },
      "elevenlabs non-2xx",
    );
    throw new AppError("upstream_error", `elevenlabs ${res.status}: ${body}`);
  }

  return {
    stream: res.body,
    usd: priceElevenLabs(text.length),
    chars: text.length,
    voiceId: voiceUsed,
    fellBack,
  };
}

/** Convenience: collect the whole stream into a Buffer (used by storage path). */
export async function bufferSpeech(text: string): Promise<{
  buffer: Buffer;
  usd: number;
}> {
  const { stream, usd } = await streamSpeech(text);
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return { buffer: Buffer.concat(chunks), usd };
}

// ── Speech-to-Text (Scribe) ───────────────────────────────────────────────

export type ElevenTranscript = {
  /** Full transcribed text. */
  text: string;
  /** ISO 639-1 code Scribe detected. */
  languageCode: string | null;
  /** 0..1 confidence in the language detection. */
  languageProbability: number | null;
  /** Best-effort cost estimate in USD (Scribe-v1 ≈ $0.40 per audio-hour). */
  usd: number;
};

/** Scribe pricing approximation — used for budget tracking, not billing. */
function priceScribe(durationSec: number): number {
  // ElevenLabs Scribe v1 list price as of Apr 2026: $0.40 per audio-hour,
  // i.e. $0.40 / 3600 ≈ $0.000111 per second.
  return Math.max(0, durationSec) * (0.4 / 3600);
}

/**
 * Transcribe an audio blob (push-to-talk recording) via ElevenLabs Scribe.
 *
 * The student holds the mic button, releases it, and the resulting WebM/OGG
 * blob comes here. Scribe v1 is multilingual and handles math vocabulary
 * better than the cheaper turbo models, so we always use it.
 *
 * Threading the resulting text into /api/cycle is the caller's job — see
 * routes/transcribe.ts which forwards to TutorWorkspace, which then calls
 * sendCycle({ assistanceMode: "explain", studentQuestion: text }).
 */
export async function transcribeAudio(
  blob: Blob,
  filename: string,
  approxDurationSec?: number,
): Promise<ElevenTranscript> {
  if (!elevenLabsConfigured()) {
    throw new AppError(
      "bad_request",
      "ELEVENLABS_API_KEY not set — speech-to-text disabled",
    );
  }

  const url = `${ELEVEN_BASE}/v1/speech-to-text`;
  const form = new FormData();
  form.append("file", blob, filename);
  form.append("model_id", "scribe_v1");
  // Tag the language hint to English — most students will speak English on
  // the demo, and Scribe still handles code-switching gracefully when this
  // is wrong. Skip if you ever localize.
  form.append("language_code", "eng");

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        // NOTE: do NOT set Content-Type — fetch must auto-set the
        // multipart boundary, otherwise ElevenLabs rejects with 422.
        "xi-api-key": env.ELEVENLABS_API_KEY!,
      },
      body: form,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error({ err: msg }, "elevenlabs scribe fetch failed");
    throw new AppError("upstream_error", `elevenlabs scribe: ${msg}`, {
      cause: e,
    });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.warn(
      { status: res.status, body: body.slice(0, 240) },
      "elevenlabs scribe non-2xx",
    );
    throw new AppError(
      "upstream_error",
      `elevenlabs scribe ${res.status}: ${body.slice(0, 200)}`,
    );
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new AppError("upstream_error", `elevenlabs scribe parse: ${msg}`);
  }

  const obj = (payload ?? {}) as Record<string, unknown>;
  const text = typeof obj.text === "string" ? obj.text.trim() : "";
  const languageCode =
    typeof obj.language_code === "string" ? (obj.language_code as string) : null;
  const languageProbability =
    typeof obj.language_probability === "number"
      ? (obj.language_probability as number)
      : null;

  // Best-effort duration: Scribe doesn't always return one — we only get
  // back text + words[] (each with start/end). Sum the last word's end if
  // present; otherwise rely on the caller-supplied approximation.
  let durationSec = approxDurationSec ?? 0;
  if (Array.isArray(obj.words) && obj.words.length > 0) {
    const last = obj.words[obj.words.length - 1] as { end?: number };
    if (typeof last.end === "number" && last.end > durationSec) {
      durationSec = last.end;
    }
  }

  return {
    text,
    languageCode,
    languageProbability,
    usd: priceScribe(durationSec),
  };
}
