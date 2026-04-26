import { env } from "../env.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { priceElevenLabs } from "../lib/cost.js";

const ELEVEN_BASE = "https://api.elevenlabs.io";

export type ElevenStreamHandle = {
  /** Async iterator of MP3 chunks for piping to MediaSource. */
  stream: ReadableStream<Uint8Array>;
  /** Estimated cost (calculated up-front from text length, not actual). */
  usd: number;
  chars: number;
};

export function elevenLabsConfigured(): boolean {
  return Boolean(env.ELEVENLABS_API_KEY);
}

/**
 * Stream MP3 audio for a hint. Returns a ReadableStream the caller can
 * either pipe into an HTTP response (for /api/audio/:hintId passthrough)
 * or `tee()` to also persist to Supabase Storage.
 */
export async function streamSpeech(text: string): Promise<ElevenStreamHandle> {
  if (!elevenLabsConfigured()) {
    throw new AppError(
      "bad_request",
      "ELEVENLABS_API_KEY not set — audio streaming disabled",
    );
  }

  const url = `${ELEVEN_BASE}/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}/stream?optimize_streaming_latency=4&output_format=mp3_44100_128`;

  let res: Response;
  try {
    res = await fetch(url, {
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error({ err: msg }, "elevenlabs fetch failed");
    throw new AppError("upstream_error", `elevenlabs: ${msg}`, { cause: e });
  }

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    logger.warn({ status: res.status, body: body.slice(0, 200) }, "elevenlabs non-2xx");
    throw new AppError("upstream_error", `elevenlabs ${res.status}: ${body}`);
  }

  return {
    stream: res.body,
    usd: priceElevenLabs(text.length),
    chars: text.length,
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
