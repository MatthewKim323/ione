/**
 * Client for POST /api/transcribe — push-to-talk speech-to-text.
 *
 * Uploads an audio Blob (recorded by useMicCapture) to the api, which
 * forwards it to ElevenLabs Scribe v1. The api returns the transcript
 * which the caller then threads into /api/cycle as the student_question
 * for the multi-agent pipeline to answer.
 *
 * Kept as a separate module from cycleClient so the mic UI can show
 * "transcribing..." independently of the slower model+TTS roundtrip.
 */

import { supabase } from "../supabase";
import { ApiError, API_BASE_URL, readApiError } from "../api";

export type TranscribeResult = {
  /** Verbatim text Scribe returned (already trimmed). */
  text: string;
  /** ISO 639-1 language hint Scribe detected, or null. */
  languageCode: string | null;
  /** 0..1 confidence in the language detection, or null. */
  languageProbability: number | null;
  /** Best-effort cost estimate in USD. */
  usd: number;
  /** End-to-end ms (api wall clock). */
  ms: number;
  /**
   * Server-side hint when the transcript came back empty:
   *   • "silent_audio" — Scribe ran but heard nothing identifiable (low
   *     language_probability + empty text). Usually means muted mic or
   *     speaking too quietly. Lets the UI show a more specific toast.
   * Undefined when the transcript was non-empty or no hint was emitted.
   */
  hint?: "silent_audio";
};

export type TranscribeInput = {
  audio: Blob;
  /** Wall-clock recording length, used by the api for cost estimation. */
  durationSec: number;
  signal?: AbortSignal;
};

/**
 * Send the recorded audio blob to the api and resolve with the transcript.
 * Throws ApiError on non-2xx — caller should catch and toast.
 */
export async function transcribeAudio(
  input: TranscribeInput,
): Promise<TranscribeResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new ApiError("unauthorized", "not signed in", 401);
  }

  const form = new FormData();
  // The api doesn't care about filename, but giving it the right ext helps
  // ElevenLabs pick the decoder on its side.
  const ext = pickExt(input.audio.type);
  form.append("audio", input.audio, `voice-${Date.now()}.${ext}`);
  form.append("duration_sec", String(Math.max(0, input.durationSec)));

  const url = `${API_BASE_URL}/api/transcribe`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: input.signal,
    });
  } catch (e) {
    if (e instanceof TypeError) {
      throw new ApiError(
        "unknown",
        `couldn't reach the api at ${url}. is the api server running? (original: ${e.message})`,
        0,
        { url, cause: "network" },
      );
    }
    throw e;
  }

  if (!res.ok) {
    throw await readApiError(res);
  }

  const json = (await res.json()) as {
    text?: string;
    language_code?: string | null;
    language_probability?: number | null;
    usd?: number;
    ms?: number;
    hint?: string;
  };

  return {
    text: typeof json.text === "string" ? json.text : "",
    languageCode:
      typeof json.language_code === "string" ? json.language_code : null,
    languageProbability:
      typeof json.language_probability === "number"
        ? json.language_probability
        : null,
    usd: typeof json.usd === "number" ? json.usd : 0,
    ms: typeof json.ms === "number" ? json.ms : 0,
    ...(json.hint === "silent_audio" ? { hint: "silent_audio" as const } : {}),
  };
}

function pickExt(mime: string): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  return "webm";
}
