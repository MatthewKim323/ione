import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Screen-capture loop, ported from scripts/capture-prototype.html.
 *
 * Lifecycle:
 *   start()    → prompts the user via getDisplayMedia, mounts the stream on
 *                a hidden <video>, then begins ticking once per
 *                effectiveInterval. The first frame anchors a baseline; every
 *                subsequent frame is compared against the previous one at
 *                64×64 and dropped if the diff is below the threshold.
 *   stop()     → stops all tracks, clears the timer, resets stats.
 *
 * Adaptive cadence (kicks in after 3 cycles):
 *   stalled    → no diff ≥ stallDiffPct for 60s         → fast 4s
 *   writing    → last 3 diffs all > writingDiffPct      → fast 6s
 *   idle       → last 3 diffs all < idleDiffPct         → slow 15s
 *   normal     → otherwise                              → user-set base
 *
 * The hook exposes only React-safe primitives (state, callbacks, refs to
 * pass into JSX). Everything else stays inside refs to avoid re-renders.
 */

export type CaptureStatus = "normal" | "idle" | "writing" | "stalled";

export type CycleEntry = {
  id: number;
  ts: number;
  diffPct: number;
  type: "baseline" | "encoded" | "skipped";
  kb?: number;
};

export type CaptureStats = {
  cyclesRun: number;
  cyclesSkipped: number;
  totalEncodedBytes: number;
  status: CaptureStatus;
  effectiveInterval: number;
  lastCycleAt: number | null;
};

export type CaptureError = {
  headline: string;
  body: string;
} | null;

const DIFF_THRESHOLD_PCT = 5;
const WRITING_DIFF_PCT = 10;
const IDLE_DIFF_PCT = 2;
const STALL_AFTER_MS = 60_000;
const STALLED_INTERVAL_MS = 4_000;
const WRITING_INTERVAL_MS = 6_000;
const IDLE_INTERVAL_MS = 15_000;
const RECENT_DIFFS_KEEP = 24;
const LOG_KEEP = 240;
const COST_PER_SKIP = 0.005;

/**
 * Region of interest, expressed in normalized 0..1 coordinates relative to
 * the full source frame. (0,0) is the top-left, (1,1) the bottom-right.
 * If supplied, the frame is cropped before WebP encode and before diff —
 * so we don't waste tokens on the rest of the screen.
 */
export type RoiRect = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type UseScreenCaptureOptions = {
  /** Slider value in seconds, default cadence between cycles. Default 8. */
  baseIntervalSec?: number;
  /** Optional callback fired whenever a frame is encoded and would be sent. */
  onFrameEncoded?: (blob: Blob, meta: { ts: number; diffPct: number }) => void;
  /** If set, frames are cropped to this region before diff + encode. */
  roi?: RoiRect | null;
};

export type UseScreenCaptureResult = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isRunning: boolean;
  isStarting: boolean;
  stats: CaptureStats;
  log: CycleEntry[];
  error: CaptureError;
  videoSize: { width: number; height: number } | null;
  start: () => Promise<void>;
  stop: () => void;
  setBaseIntervalSec: (s: number) => void;
  baseIntervalSec: number;
  dismissError: () => void;
  /** True when the SecureContext supports getDisplayMedia. */
  isSupported: boolean;
  /** Total dollars saved by the diff gate (skipped × $0.005, mock). */
  costSaved: number;
};

export function useScreenCapture(
  opts: UseScreenCaptureOptions = {},
): UseScreenCaptureResult {
  const onFrameEncoded = opts.onFrameEncoded;
  const roi = opts.roi ?? null;
  const [baseIntervalSec, setBaseIntervalSec] = useState(
    opts.baseIntervalSec ?? 8,
  );
  const [isRunning, setIsRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<CaptureError>(null);
  const [videoSize, setVideoSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [stats, setStats] = useState<CaptureStats>({
    cyclesRun: 0,
    cyclesSkipped: 0,
    totalEncodedBytes: 0,
    status: "normal",
    effectiveInterval: (opts.baseIntervalSec ?? 8) * 1000,
    lastCycleAt: null,
  });
  const [log, setLog] = useState<CycleEntry[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Mutable bag — kept off React state so we don't thrash renders mid-tick.
  const runtime = useRef({
    stream: null as MediaStream | null,
    track: null as MediaStreamTrack | null,
    imageCapture: null as ImageCapture | null,
    cycleTimer: null as ReturnType<typeof setTimeout> | null,
    isRunning: false, // mirrors React state but readable from async closures
    prevDiffData: null as ImageData | null,
    cyclesRun: 0,
    cyclesSkipped: 0,
    totalEncodedBytes: 0,
    recentDiffs: [] as number[],
    lastBigDiffTime: 0,
    captureStartTime: 0,
    status: "normal" as CaptureStatus,
    effectiveInterval: (opts.baseIntervalSec ?? 8) * 1000,
    baseInterval: (opts.baseIntervalSec ?? 8) * 1000,
    nextEntryId: 1,
  });

  // Reusable canvases live across cycles to avoid allocation churn.
  const canvases = useRef<{
    diff: HTMLCanvasElement | null;
    diffCtx: CanvasRenderingContext2D | null;
    encode: HTMLCanvasElement | null;
    encodeCtx: CanvasRenderingContext2D | null;
    crop: HTMLCanvasElement | null;
    cropCtx: CanvasRenderingContext2D | null;
  }>({
    diff: null,
    diffCtx: null,
    encode: null,
    encodeCtx: null,
    crop: null,
    cropCtx: null,
  });

  const roiRef = useRef<RoiRect | null>(roi);
  useEffect(() => {
    roiRef.current = roi;
  }, [roi]);

  const ensureCanvases = () => {
    if (!canvases.current.diff) {
      const d = document.createElement("canvas");
      d.width = 64;
      d.height = 64;
      canvases.current.diff = d;
      canvases.current.diffCtx = d.getContext("2d", {
        willReadFrequently: true,
      });
    }
    if (!canvases.current.encode) {
      const e = document.createElement("canvas");
      canvases.current.encode = e;
      canvases.current.encodeCtx = e.getContext("2d");
    }
    if (!canvases.current.crop) {
      const c = document.createElement("canvas");
      canvases.current.crop = c;
      canvases.current.cropCtx = c.getContext("2d");
    }
  };

  // Keep runtime baseInterval synced with React state so the slider applies
  // on the *next* cycle without restarting the loop.
  useEffect(() => {
    runtime.current.baseInterval = baseIntervalSec * 1000;
  }, [baseIntervalSec]);

  const isSupported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === "function";

  const dismissError = useCallback(() => setError(null), []);

  // ── Cycle loop ─────────────────────────────────────────────────────────
  const scheduleNext = useCallback((ms: number) => {
    if (!runtime.current.isRunning) return;
    if (runtime.current.cycleTimer) {
      clearTimeout(runtime.current.cycleTimer);
    }
    runtime.current.cycleTimer = setTimeout(runCycleRef.current, ms);
  }, []);

  // Stable ref so scheduleNext can call the latest runCycle even though
  // runCycle closes over `onFrameEncoded` etc.
  const runCycleRef = useRef<() => Promise<void>>(async () => {});

  const computeAdaptive = useCallback(() => {
    const r = runtime.current;
    const now = Date.now();
    const recent3 = r.recentDiffs.slice(-3);
    const have3 = recent3.length === 3;
    const sinceBig = now - r.lastBigDiffTime;

    if (r.cyclesRun >= 2 && sinceBig > STALL_AFTER_MS) {
      r.effectiveInterval = STALLED_INTERVAL_MS;
      r.status = "stalled";
      return;
    }
    if (have3 && recent3.every((d) => d > WRITING_DIFF_PCT)) {
      r.effectiveInterval = WRITING_INTERVAL_MS;
      r.status = "writing";
      return;
    }
    if (have3 && recent3.every((d) => d < IDLE_DIFF_PCT)) {
      r.effectiveInterval = IDLE_INTERVAL_MS;
      r.status = "idle";
      return;
    }
    r.effectiveInterval = r.baseInterval;
    r.status = "normal";
  }, []);

  const runCycle = useCallback(async () => {
    const r = runtime.current;
    if (!r.isRunning) return;
    const cycleStart = Date.now();

    let frame: ImageBitmap | HTMLCanvasElement | null = null;
    try {
      frame = await grabFrame(r.imageCapture, videoRef.current);
    } catch (err) {
      console.warn("[capture] grabFrame failed", err);
      scheduleNext(r.effectiveInterval);
      return;
    }
    if (!frame) {
      scheduleNext(r.effectiveInterval);
      return;
    }

    // Apply ROI crop (if set) so diff + encode see only the math region.
    if (roiRef.current) {
      ensureCanvases();
      frame = cropFrame(
        frame,
        roiRef.current,
        canvases.current.crop as HTMLCanvasElement,
        canvases.current.cropCtx as CanvasRenderingContext2D,
      );
    }

    r.cyclesRun += 1;

    // Diff against previous frame at 64×64.
    ensureCanvases();
    const currDiffData = drawToDiff(
      frame,
      canvases.current.diffCtx as CanvasRenderingContext2D,
    );
    const isBaseline = r.prevDiffData === null;
    const diffPct = isBaseline
      ? 0
      : computeDiff(currDiffData, r.prevDiffData as ImageData);
    const shouldEncode = isBaseline || diffPct >= DIFF_THRESHOLD_PCT;

    let entry: CycleEntry;
    const id = r.nextEntryId++;

    if (shouldEncode) {
      let blob: Blob | null = null;
      try {
        blob = await encodeWebp(
          frame,
          canvases.current.encode as HTMLCanvasElement,
          canvases.current.encodeCtx as CanvasRenderingContext2D,
        );
      } catch (err) {
        console.warn("[capture] encode failed", err);
      }
      if (blob) {
        r.totalEncodedBytes += blob.size;
        entry = {
          id,
          ts: cycleStart,
          diffPct,
          type: isBaseline ? "baseline" : "encoded",
          kb: blob.size / 1024,
        };
        if (onFrameEncoded && !isBaseline) {
          try {
            onFrameEncoded(blob, { ts: cycleStart, diffPct });
          } catch (err) {
            console.warn("[capture] onFrameEncoded callback threw", err);
          }
        }
      } else {
        entry = { id, ts: cycleStart, diffPct, type: "baseline" };
      }
    } else {
      r.cyclesSkipped += 1;
      entry = { id, ts: cycleStart, diffPct, type: "skipped" };
    }

    if (!isBaseline) {
      r.recentDiffs.push(diffPct);
      if (r.recentDiffs.length > RECENT_DIFFS_KEEP) r.recentDiffs.shift();
      if (diffPct >= DIFF_THRESHOLD_PCT) r.lastBigDiffTime = cycleStart;
    }
    r.prevDiffData = currDiffData;

    if (frame && "close" in frame && typeof frame.close === "function") {
      try {
        frame.close();
      } catch {
        // ImageBitmap.close() can throw on some platforms; ignore.
      }
    }

    computeAdaptive();

    setStats({
      cyclesRun: r.cyclesRun,
      cyclesSkipped: r.cyclesSkipped,
      totalEncodedBytes: r.totalEncodedBytes,
      status: r.status,
      effectiveInterval: r.effectiveInterval,
      lastCycleAt: cycleStart,
    });
    setLog((prev) => {
      const next = [entry, ...prev];
      if (next.length > LOG_KEEP) next.length = LOG_KEEP;
      return next;
    });

    scheduleNext(r.effectiveInterval);
  }, [scheduleNext, computeAdaptive, onFrameEncoded]);

  useEffect(() => {
    runCycleRef.current = runCycle;
  }, [runCycle]);

  // ── start / stop ───────────────────────────────────────────────────────
  const stop = useCallback(() => {
    const r = runtime.current;
    r.isRunning = false;
    if (r.cycleTimer) {
      clearTimeout(r.cycleTimer);
      r.cycleTimer = null;
    }
    if (r.stream) {
      for (const t of r.stream.getTracks()) {
        try {
          t.stop();
        } catch {
          // already stopped
        }
      }
    }
    r.stream = null;
    r.track = null;
    r.imageCapture = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsRunning(false);
    setVideoSize(null);
  }, []);

  const start = useCallback(async () => {
    if (!isSupported) {
      setError({
        headline: "Screen sharing isn't available.",
        body: "This browser or context doesn't support getDisplayMedia. Try Chrome on a desktop with HTTPS or localhost.",
      });
      return;
    }
    if (runtime.current.isRunning || isStarting) return;

    setError(null);
    setIsStarting(true);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 1, max: 5 } },
        audio: false,
      });
    } catch (err) {
      const e = err as DOMException;
      if (e?.name === "NotAllowedError" || e?.name === "AbortError") {
        setError({
          headline: "Permission declined.",
          body: "The browser cancelled the share. Click start again and pick the QuickTime window mirroring your iPad.",
        });
      } else {
        setError({
          headline: "Capture failed.",
          body: e?.message ?? String(err),
        });
      }
      setIsStarting(false);
      return;
    }

    // Wire stream into runtime + DOM.
    const r = runtime.current;
    r.prevDiffData = null;
    r.cyclesRun = 0;
    r.cyclesSkipped = 0;
    r.totalEncodedBytes = 0;
    r.recentDiffs = [];
    r.status = "normal";
    r.effectiveInterval = r.baseInterval;
    r.captureStartTime = Date.now();
    r.lastBigDiffTime = r.captureStartTime;
    r.stream = stream;
    r.track = stream.getVideoTracks()[0] ?? null;
    r.isRunning = true;

    setStats({
      cyclesRun: 0,
      cyclesSkipped: 0,
      totalEncodedBytes: 0,
      status: "normal",
      effectiveInterval: r.effectiveInterval,
      lastCycleAt: null,
    });
    setLog([]);

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }

    if (typeof window !== "undefined" && "ImageCapture" in window && r.track) {
      try {
        r.imageCapture = new ImageCapture(r.track);
      } catch {
        r.imageCapture = null;
      }
    }

    if (r.track) {
      // User clicks Chrome's "Stop sharing" pill → tear down too.
      r.track.addEventListener("ended", () => {
        if (r.isRunning) stop();
      });
    }

    // Wait for video metadata so we know the real resolution.
    await waitForVideo(videoRef.current);
    if (videoRef.current) {
      setVideoSize({
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
      });
    }

    setIsRunning(true);
    setIsStarting(false);
    scheduleNext(0);
  }, [isSupported, isStarting, scheduleNext, stop]);

  // Always tear down on unmount — leaving a MediaStream attached is rude.
  useEffect(() => {
    return () => {
      const r = runtime.current;
      r.isRunning = false;
      if (r.cycleTimer) clearTimeout(r.cycleTimer);
      if (r.stream) {
        for (const t of r.stream.getTracks()) {
          try {
            t.stop();
          } catch {
            // ignore
          }
        }
      }
    };
  }, []);

  return {
    videoRef,
    isRunning,
    isStarting,
    stats,
    log,
    error,
    videoSize,
    start,
    stop,
    setBaseIntervalSec,
    baseIntervalSec,
    dismissError,
    isSupported,
    costSaved: stats.cyclesSkipped * COST_PER_SKIP,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────

async function grabFrame(
  imageCapture: ImageCapture | null,
  video: HTMLVideoElement | null,
): Promise<ImageBitmap | HTMLCanvasElement | null> {
  if (imageCapture) {
    try {
      // grabFrame() exists on ImageCapture in supporting browsers; lib.dom
      // sometimes ships only the constructor, so we type the call through
      // a structural shim rather than a global redeclaration.
      const ic = imageCapture as { grabFrame?: () => Promise<ImageBitmap> };
      if (ic.grabFrame) return await ic.grabFrame();
    } catch {
      // fall through to canvas path — Safari, some Chromes on iPads, etc.
    }
  }
  if (!video) return null;
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  return c;
}

function drawToDiff(
  src: ImageBitmap | HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): ImageData {
  ctx.drawImage(src as CanvasImageSource, 0, 0, 64, 64);
  return ctx.getImageData(0, 0, 64, 64);
}

function computeDiff(curr: ImageData, prev: ImageData): number {
  const a = curr.data;
  const b = prev.data;
  const len = a.length;
  let sum = 0;
  for (let i = 0; i < len; i += 4) {
    sum +=
      Math.abs(a[i] - b[i]) +
      Math.abs(a[i + 1] - b[i + 1]) +
      Math.abs(a[i + 2] - b[i + 2]);
  }
  return (sum / (64 * 64 * 3 * 255)) * 100;
}

function cropFrame(
  src: ImageBitmap | HTMLCanvasElement,
  roi: RoiRect,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): HTMLCanvasElement {
  const sw = (src as { width: number }).width;
  const sh = (src as { height: number }).height;
  const x = clamp(roi.x0, 0, 1) * sw;
  const y = clamp(roi.y0, 0, 1) * sh;
  const w = Math.max(8, (clamp(roi.x1, 0, 1) - clamp(roi.x0, 0, 1)) * sw);
  const h = Math.max(8, (clamp(roi.y1, 0, 1) - clamp(roi.y0, 0, 1)) * sh);
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src as CanvasImageSource, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function encodeWebp(
  src: ImageBitmap | HTMLCanvasElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const w = (src as { width: number }).width;
    const h = (src as { height: number }).height;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(src as CanvasImageSource, 0, 0);
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("toBlob returned null")),
      "image/webp",
      0.7,
    );
  });
}

function waitForVideo(video: HTMLVideoElement | null): Promise<void> {
  return new Promise((resolve) => {
    if (!video) return resolve();
    if (video.videoWidth > 0) return resolve();
    const onLoaded = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      resolve();
    };
    video.addEventListener("loadedmetadata", onLoaded);
  });
}

// ImageCapture support varies by browser; lib.dom sometimes declares the
// constructor but not grabFrame(). We avoid redeclaring it globally — see
// the structural cast inside grabFrame() above.
