import { useEffect, useRef, useState } from "react";
import { Nav } from "../components/Nav";
import { TitlePage } from "../components/TitlePage";
import { Hero } from "../components/Hero";
import { Pipeline } from "../components/Pipeline";
import { Demo } from "../components/Demo";
import { Closer } from "../components/Closer";
import { SKIP_FX } from "../lib/prerender";

const PAGE_BG = "#f2f2f2";

// How many viewport-heights of scroll equal one full pass through the video.
// Higher = the clip advances more slowly as you scroll and “owns” more of the page.
const SCRUB_RANGE_VH = 2.75;

// Where (within the scrub range) the video starts fading out.
// Lower = fade begins sooner and runs longer (less abrupt handoff to page bg).
const FADE_START_T = 0.48;

// How many frames to pre-decode from /bg.mp4. Higher = smoother scrub
// (smaller steps through the clip) at the cost of memory + longer preload.
const FRAME_COUNT = 400;

// rAF lerp toward target frame. Higher = the head catches scroll faster; paired
// with dual-frame blend below so motion stays smooth without visible stepping.
const FRAME_LERP = 0.9;

// ─────────────────────────────────────────────────────────────────────
// Pre-decode N frames from /bg.mp4 → ImageBitmap[].
// Drawing bitmaps to a canvas during scroll has zero decode cost, so
// scrubbing is silky smooth regardless of the source file's keyframe
// spacing. The trade-off is ~1–3s of "preload" before the bg appears.
// ─────────────────────────────────────────────────────────────────────
async function preloadFrames(count: number): Promise<{
  frames: ImageBitmap[];
  width: number;
  height: number;
}> {
  const video = document.createElement("video");
  video.src = "/bg.mp4";
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("video error")), {
      once: true,
    });
  });

  const duration = video.duration || 0;
  if (!duration) throw new Error("zero duration");

  const frames: ImageBitmap[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / Math.max(1, count - 1)) * duration;
    await new Promise<void>((resolve) => {
      video.addEventListener("seeked", () => resolve(), { once: true });
      video.currentTime = Math.min(t, duration - 0.001);
    });
    // Wait one rAF for the seeked frame to actually paint into the element.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const bitmap = await createImageBitmap(video);
    frames.push(bitmap);
  }

  return { frames, width: video.videoWidth, height: video.videoHeight };
}

// ─────────────────────────────────────────────────────────────────────
// Hybrid background: <video> paints instantly on mount (Phase A — scrub
// via currentTime), while we silently decode FRAME_COUNT ImageBitmaps in
// the background. Once those are ready, we crossfade to a canvas
// (Phase B — pixel-perfect bitmap blits, no codec hitch) and stop
// touching the video. If the decode fails, Phase A persists forever.
// ─────────────────────────────────────────────────────────────────────
function FlowerBackground() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<ImageBitmap[]>([]);
  const dimsRef = useRef({ vw: 0, vh: 0 });
  const [framesReady, setFramesReady] = useState(false);

  // Background-decode the bitmaps. Don't gate the UI on this; the
  // <video> below is already painting the bloom in real time.
  useEffect(() => {
    if (SKIP_FX) return;

    let cancelled = false;
    preloadFrames(FRAME_COUNT)
      .then(({ frames, width, height }) => {
        if (cancelled) {
          frames.forEach((f) => f.close?.());
          return;
        }
        framesRef.current = frames;
        dimsRef.current = { vw: width, vh: height };
        setFramesReady(true);
      })
      .catch(() => {
        // Decode failed — Phase A (native video) keeps running.
      });

    return () => {
      cancelled = true;
      framesRef.current.forEach((f) => f.close?.());
      framesRef.current = [];
    };
  }, []);

  // The single rAF loop. Always running. Reads scroll, drives whichever
  // renderer is currently active.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !video || !canvas) return;

    if (SKIP_FX) {
      wrapper.style.opacity = "1";
      return;
    }

    const ctx = canvas.getContext("2d", { alpha: false });

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cssWidth = window.innerWidth;
    let cssHeight = window.innerHeight;

    const syncCanvas = () => {
      cssWidth = window.innerWidth;
      cssHeight = window.innerHeight;
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      canvas.style.width = cssWidth + "px";
      canvas.style.height = cssHeight + "px";
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    syncCanvas();

    let cachedVh = window.innerHeight || 1;
    let videoDuration = 0;
    let renderedTime = 0;
    let lastSeekTime = -1;
    let displayIdx = 0;
    let lastOpacity = -1;
    let rafId = 0;
    let running = true;

    // Native-video scrub — keep closer to scroll than heavy smoothing.
    const SEEK_LERP_VIDEO = 0.55;

    const getProgress = () => {
      const t = window.scrollY / (cachedVh * SCRUB_RANGE_VH);
      return t < 0 ? 0 : t > 1 ? 1 : t;
    };

    /** 0→1 Perlin smootherstep — softer in/out than smoothstep for long fades. */
    const smoother01 = (x: number) => {
      const u = x < 0 ? 0 : x > 1 ? 1 : x;
      return u * u * u * (u * (u * 6 - 15) + 10);
    };

    const updateOpacity = (t: number) => {
      const fadeT =
        t < FADE_START_T
          ? 0
          : (t - FADE_START_T) / Math.max(0.001, 1 - FADE_START_T);
      const u = fadeT > 1 ? 1 : fadeT;
      const opacity = 1 - smoother01(u);
      if (Math.abs(opacity - lastOpacity) > 0.005) {
        wrapper.style.opacity = String(opacity);
        lastOpacity = opacity;
      }
    };

    const coverRect = () => {
      const { vw, vh: vhPx } = dimsRef.current;
      const coverBoost = 1.07;
      const scale = Math.max(cssWidth / vw, cssHeight / vhPx) * coverBoost;
      return {
        w: vw * scale,
        h: vhPx * scale,
        x: (cssWidth - vw * scale) / 2,
        y: (cssHeight - vhPx * scale) / 2,
      };
    };

    /** Blend two neighbour bitmaps from fractional index — removes “stair step” choppiness. */
    const drawFrameBlend = (f: number) => {
      if (!ctx) return;
      const frames = framesRef.current;
      const total = frames.length;
      if (!total) return;
      const clamped = Math.max(0, Math.min(f, total - 1 - 1e-6));
      const i0 = Math.floor(clamped);
      const i1 = Math.min(i0 + 1, total - 1);
      const a = clamped - i0;
      const { x, y, w, h } = coverRect();
      const b0 = frames[i0];
      const b1 = frames[i1];
      if (!b0) return;
      ctx.clearRect(0, 0, cssWidth, cssHeight);
      if (a < 0.001 || i0 === i1) {
        ctx.globalAlpha = 1;
        ctx.drawImage(b0, x, y, w, h);
        return;
      }
      if (!b1) {
        ctx.globalAlpha = 1;
        ctx.drawImage(b0, x, y, w, h);
        return;
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(b0, x, y, w, h);
      ctx.globalAlpha = a;
      ctx.drawImage(b1, x, y, w, h);
      ctx.globalAlpha = 1;
    };

    const tick = () => {
      if (!running) return;
      const t = getProgress();
      updateOpacity(t);

      const total = framesRef.current.length;
      if (total > 0) {
        // ── Phase B: canvas blit ──────────────────────────────────────
        const targetIdx = t * (total - 1);
        const delta = targetIdx - displayIdx;
        if (Math.abs(delta) > 0.005) {
          displayIdx += delta * FRAME_LERP;
        } else {
          displayIdx = targetIdx;
        }
        drawFrameBlend(displayIdx);
      } else if (videoDuration > 0) {
        // ── Phase A: native-video scrub ───────────────────────────────
        const target = t * videoDuration;
        renderedTime += (target - renderedTime) * SEEK_LERP_VIDEO;
        if (Math.abs(target - renderedTime) < 0.005) renderedTime = target;
        if (Math.abs(renderedTime - lastSeekTime) > 0.012) {
          if (!video.paused) video.pause();
          try {
            video.currentTime = renderedTime;
          } catch {
            // metadata not quite ready; will retry next tick
          }
          lastSeekTime = renderedTime;
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    const onMeta = () => {
      videoDuration = Number.isFinite(video.duration) ? video.duration : 0;
      renderedTime = getProgress() * videoDuration;
      try {
        if (!video.paused) video.pause();
        video.currentTime = renderedTime;
      } catch {
        // ignore
      }
    };

    const onResize = () => {
      cachedVh = window.innerHeight || 1;
      syncCanvas();
    };

    if (video.readyState >= 1) onMeta();
    else video.addEventListener("loadedmetadata", onMeta, { once: true });

    window.addEventListener("resize", onResize, { passive: true });
    rafId = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      video.removeEventListener("loadedmetadata", onMeta);
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        contain: "strict",
        willChange: "opacity",
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
        opacity: 1,
      }}
    >
      {/* Phase A renderer — paints instantly. Faded out once Phase B
          (canvas) takes over. */}
      <video
        ref={videoRef}
        src="/bg.mp4"
        muted
        playsInline
        preload="auto"
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: "scale(1.07)",
          transformOrigin: "50% 50%",
          opacity: framesReady ? 0 : 1,
          transition: "opacity 0.85s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
      {/* Phase B renderer — drawn into once frames are decoded. */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          display: "block",
          width: "100%",
          height: "100%",
          opacity: framesReady ? 1 : 0,
          transition: "opacity 0.85s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </div>
  );
}

export default function Landing() {
  useEffect(() => {
    document.body.style.backgroundColor = PAGE_BG;
    document.documentElement.style.backgroundColor = PAGE_BG;
  }, []);

  return (
    <div style={{ backgroundColor: PAGE_BG, position: "relative" }}>
      <FlowerBackground />

      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
          background:
            "linear-gradient(to right," +
            " rgba(0,0,0,0.12) 0%," +
            " rgba(0,0,0,0.08) 12%," +
            " rgba(0,0,0,0.05) 22%," +
            " rgba(0,0,0,0.025) 38%," +
            " rgba(0,0,0,0)    50%," +
            " rgba(0,0,0,0.025) 62%," +
            " rgba(0,0,0,0.05) 78%," +
            " rgba(0,0,0,0.08) 88%," +
            " rgba(0,0,0,0.12) 100%)",
          mixBlendMode: "multiply",
        }}
      />

      <div style={{ position: "relative", zIndex: 2 }}>
        <Nav />
        <main>
          <TitlePage />
          <Hero />
          <Demo />
          <Pipeline />
          <Closer />
        </main>
      </div>
    </div>
  );
}
