/**
 * Push-to-talk microphone capture for the tutor's "ask out loud" flow.
 *
 * Lifecycle:
 *   1. useMicCapture() returns { state, level, error, start, stop, cancel }.
 *      The first time start() is called we ask for getUserMedia. The
 *      stream is kept warm for the rest of the session — re-asking on
 *      every PTT press would re-prompt the permission dialog in
 *      privacy-strict browsers and adds ~150ms latency per cycle.
 *   2. start() spins up a fresh MediaRecorder against the persistent
 *      stream. Audio chunks accumulate until stop() is called.
 *   3. stop() finalizes the recording and resolves with the
 *      { blob, durationSec, mimeType } the caller needs to POST to
 *      /api/transcribe.
 *   4. cancel() throws away the recording and goes back to "idle".
 *      Used for the spacebar PTT path when the user releases the key
 *      after <300ms (probably an accidental tap).
 *
 * Levels: an AnalyserNode is wired up while recording so the UI can
 * pulse a mic indicator. Drained on every animation frame at ~5..50hz.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type MicCaptureState =
  | "idle"
  | "starting"
  | "recording"
  | "stopping"
  | "error";

export type MicCaptureRecording = {
  blob: Blob;
  durationSec: number;
  mimeType: string;
};

export type UseMicCaptureResult = {
  state: MicCaptureState;
  level: number; // 0..1, smoothed RMS while recording
  error: string | null;
  /** Start a fresh recording. Resolves once recording has actually begun. */
  start: () => Promise<void>;
  /** Stop and resolve with the captured blob + duration. */
  stop: () => Promise<MicCaptureRecording | null>;
  /** Throw away an in-flight recording. Used for accidental short taps. */
  cancel: () => void;
};

const MIN_DURATION_SEC = 0.4; // anything shorter is almost certainly an accidental tap
const MAX_DURATION_SEC = 60; // matches api/src/routes/transcribe.ts cap

export function useMicCapture(): UseMicCaptureResult {
  const [state, setState] = useState<MicCaptureState>("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const cancelledRef = useRef<boolean>(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);

  // Tear down on unmount. We keep the persistent mic stream alive
  // across PTT presses, but we *do* release it when the component
  // hosting the hook unmounts (i.e. the tutor session ends).
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try {
        recorderRef.current?.state === "recording" && recorderRef.current.stop();
      } catch {
        /* ignore */
      }
      try {
        sourceRef.current?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        audioCtxRef.current?.close();
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const ensureStream = useCallback(async (): Promise<MediaStream> => {
    if (streamRef.current && streamRef.current.active) {
      return streamRef.current;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("microphone not available in this browser");
    }
    const s = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    streamRef.current = s;
    return s;
  }, []);

  const tickLevel = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) {
      rafRef.current = null;
      return;
    }
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i += 1) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    setLevel((prev) => prev * 0.6 + Math.min(1, rms * 2.4) * 0.4);
    rafRef.current = requestAnimationFrame(tickLevel);
  }, []);

  const teardownAnalyser = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      sourceRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    sourceRef.current = null;
    analyserRef.current = null;
    setLevel(0);
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (state === "recording" || state === "starting") return;
    setError(null);
    setState("starting");
    cancelledRef.current = false;
    chunksRef.current = [];
    try {
      const stream = await ensureStream();

      // MIME picker: prefer webm/opus for size + Scribe friendliness.
      // Safari only supports audio/mp4 with AAC, so fall through.
      const mime = pickRecorderMime();
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.addEventListener("dataavailable", (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      });

      // Start an analyser for the level meter. Recreated every press
      // because closing the AudioContext between presses is overkill.
      if (!audioCtxRef.current) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (Ctor) audioCtxRef.current = new Ctor();
      }
      const ctx = audioCtxRef.current;
      if (ctx) {
        try {
          if (ctx.state === "suspended") await ctx.resume();
          const src = ctx.createMediaStreamSource(stream);
          const an = ctx.createAnalyser();
          an.fftSize = 1024;
          an.smoothingTimeConstant = 0.65;
          src.connect(an);
          sourceRef.current = src;
          analyserRef.current = an;
          rafRef.current = requestAnimationFrame(tickLevel);
        } catch (e) {
          // Non-fatal — recording still works even if level meter doesn't.
          if (typeof console !== "undefined") {
            console.warn("[useMicCapture] analyser setup failed", e);
          }
        }
      }

      recorder.start(/* timeslice */ 100);
      startedAtRef.current = Date.now();
      setState("recording");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setState("error");
      teardownAnalyser();
      throw e;
    }
  }, [ensureStream, state, teardownAnalyser, tickLevel]);

  const stop = useCallback(async (): Promise<MicCaptureRecording | null> => {
    const rec = recorderRef.current;
    if (!rec || (state !== "recording" && state !== "starting")) {
      return null;
    }
    setState("stopping");

    const result = await new Promise<MicCaptureRecording | null>((resolve) => {
      rec.addEventListener(
        "stop",
        () => {
          teardownAnalyser();
          if (cancelledRef.current) {
            chunksRef.current = [];
            resolve(null);
            return;
          }
          const elapsedSec = (Date.now() - startedAtRef.current) / 1000;
          const mime = rec.mimeType || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: mime });
          chunksRef.current = [];
          if (elapsedSec < MIN_DURATION_SEC) {
            // too short — almost certainly an accidental tap.
            resolve(null);
            return;
          }
          const durationSec = Math.min(elapsedSec, MAX_DURATION_SEC);
          resolve({ blob, durationSec, mimeType: mime });
        },
        { once: true },
      );
      try {
        rec.stop();
      } catch {
        teardownAnalyser();
        resolve(null);
      }
    });

    setState("idle");
    return result;
  }, [state, teardownAnalyser]);

  const cancel = useCallback(() => {
    const rec = recorderRef.current;
    cancelledRef.current = true;
    if (rec && rec.state === "recording") {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    teardownAnalyser();
    setState("idle");
    chunksRef.current = [];
  }, [teardownAnalyser]);

  return { state, level, error, start, stop, cancel };
}

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
}
