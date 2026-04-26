import { API_BASE_URL } from "../api";
import { supabase } from "../supabase";

/**
 * Stream a hint's TTS audio from `/api/audio/:hintId`.
 *
 * ElevenLabs returns a **raw MP3** byte stream. Chromium/WebKit often report
 * `MediaSource.isTypeSupported("audio/mpeg") === true`, but appending those
 * chunks to a SourceBuffer does not yield reliable decode/play — the element
 * can sit silent forever. We therefore **always** buffer `audio/mpeg` to a
 * Blob and play via a regular object URL (fast enough for short hints).
 *
 * MediaSource remains available for future non-MP3 transports (e.g. fMP4).
 */

export type AudioController = {
  stop: () => void;
  /** Resolves when playback ends naturally (or rejects on transport error). */
  done: Promise<void>;
};

const MIME_CANDIDATES = ["audio/mpeg", "audio/mp4"];

export async function playHintAudio(opts: {
  hintId: string;
  audioEl: HTMLAudioElement;
  signal?: AbortSignal;
}): Promise<AudioController> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("not authenticated");

  const url = `${API_BASE_URL}/api/audio/${encodeURIComponent(opts.hintId)}`;
  // We need fetch (not <audio src>) because we have to attach the bearer.
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`audio ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const mimeHeader = res.headers.get("content-type") ?? "audio/mpeg";
  const mimeBase = mimeHeader.split(";")[0]!.trim().toLowerCase();
  const isRawMpeg =
    mimeBase === "audio/mpeg" ||
    mimeBase === "audio/mp3" ||
    mimeBase.endsWith("/mpeg");

  if (
    !isRawMpeg &&
    typeof window !== "undefined" &&
    "MediaSource" in window &&
    MIME_CANDIDATES.some((m) => MediaSource.isTypeSupported(m))
  ) {
    return await playViaMediaSource(opts.audioEl, res, mimeHeader, opts.signal);
  }

  return await playViaBlob(opts.audioEl, res);
}

async function playViaMediaSource(
  audioEl: HTMLAudioElement,
  res: Response,
  mime: string,
  signal?: AbortSignal,
): Promise<AudioController> {
  const ms = new MediaSource();
  const url = URL.createObjectURL(ms);
  audioEl.src = url;
  let aborted = false;

  const sb = await new Promise<SourceBuffer>((resolve, reject) => {
    ms.addEventListener(
      "sourceopen",
      () => {
        try {
          const sb = ms.addSourceBuffer(mime);
          resolve(sb);
        } catch (e) {
          reject(e);
        }
      },
      { once: true },
    );
    ms.addEventListener("error", reject, { once: true });
  });

  const reader = res.body!.getReader();
  const queue: ArrayBuffer[] = [];
  let appending = false;

  const drain = () => {
    if (appending || aborted) return;
    if (sb.updating) return;
    const next = queue.shift();
    if (!next) return;
    appending = true;
    sb.appendBuffer(next);
  };

  sb.addEventListener("updateend", () => {
    appending = false;
    if (queue.length) drain();
  });

  const done = new Promise<void>((resolve, reject) => {
    audioEl.addEventListener(
      "ended",
      () => {
        URL.revokeObjectURL(url);
        resolve();
      },
      { once: true },
    );
    audioEl.addEventListener(
      "error",
      () => reject(new Error("audio element error")),
      { once: true },
    );

    (async () => {
      try {
        while (true) {
          if (signal?.aborted) {
            aborted = true;
            return;
          }
          const { value, done } = await reader.read();
          if (done) {
            // wait for queue to drain, then end the stream.
            const tryEnd = () => {
              if (sb.updating || queue.length) {
                setTimeout(tryEnd, 50);
                return;
              }
              try {
                ms.endOfStream();
              } catch {
                // already ended
              }
            };
            tryEnd();
            return;
          }
          // copy the chunk into a fresh ArrayBuffer-backed view so
          // SourceBuffer.appendBuffer's signature is satisfied (it rejects
          // SharedArrayBuffer-backed views in strict TS).
          const copy = new ArrayBuffer(value.byteLength);
          new Uint8Array(copy).set(value);
          queue.push(copy);
          drain();
        }
      } catch (e) {
        reject(e);
      }
    })();
  });

  // Some browsers refuse to play() until at least one segment is appended.
  audioEl.play().catch(() => {
    // user-gesture issues will surface as a play error; HintCard catches.
  });

  return {
    stop: () => {
      aborted = true;
      try {
        reader.cancel();
      } catch {
        // already cancelled
      }
      audioEl.pause();
      try {
        ms.endOfStream();
      } catch {
        // already ended
      }
      URL.revokeObjectURL(url);
    },
    done,
  };
}

async function playViaBlob(
  audioEl: HTMLAudioElement,
  res: Response,
): Promise<AudioController> {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  audioEl.src = url;
  const done = new Promise<void>((resolve, reject) => {
    audioEl.addEventListener(
      "ended",
      () => {
        URL.revokeObjectURL(url);
        resolve();
      },
      { once: true },
    );
    audioEl.addEventListener(
      "error",
      () => reject(new Error("audio element error")),
      { once: true },
    );
    audioEl.play().catch(reject);
  });
  return {
    stop: () => {
      audioEl.pause();
      URL.revokeObjectURL(url);
    },
    done,
  };
}
