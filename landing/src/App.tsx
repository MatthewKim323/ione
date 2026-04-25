import { useEffect, useRef, useState } from "react";
import { Nav } from "./components/Nav";
import { TitlePage } from "./components/TitlePage";
import { Hero } from "./components/Hero";
import { Pedagogy } from "./components/Pedagogy";
import { Pipeline } from "./components/Pipeline";
import { Signal } from "./components/Signal";
import { Closer } from "./components/Closer";

// ── Tunables ───────────────────────────────────────────────────────────
const FRAME_COUNT = 120;        // pre-decoded frames for buttery scrubbing

const SCRUB_VH = 1.0;           // video advances over first 1 viewport
const BLUR_START_VH = 0.5;      // start blurring midway through page 1
const BLUR_FULL_VH = 2.0;       // full blur reached by end of page 2
const VEIL_START_VH = 1.5;      // white veil starts creeping in
const VEIL_FULL_VH = 3.0;       // page is fully white by end of page 3

const MAX_BLUR_PX = 36;
const LERP_SPEED = 0.22;
const SEEK_EPSILON = 0.005;

const FALLBACK_BG = "#f2f2f2";
const VEIL_COLOR = "#f2f2f2";

function smoothstep(t: number) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

// ─────────────────────────────────────────────────────────────────────
// Pre-decode N frames from /bg.mp4 → ImageBitmap[].
// Drawing bitmaps to a canvas during scroll = silky smooth scrubbing,
// no keyframe choppiness.
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
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const bitmap = await createImageBitmap(video);
    frames.push(bitmap);
  }

  return { frames, width: video.videoWidth, height: video.videoHeight };
}

function ScrubbingFlowers({
  onSampledBg,
  veilRef,
}: {
  onSampledBg: (color: string) => void;
  veilRef: React.RefObject<HTMLDivElement>;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<ImageBitmap[]>([]);
  const dimsRef = useRef({ vw: 0, vh: 0 });
  const [ready, setReady] = useState(false);

  // Preload frames once on mount.
  useEffect(() => {
    let cancelled = false;
    preloadFrames(FRAME_COUNT)
      .then(({ frames, width, height }) => {
        if (cancelled) {
          frames.forEach((f) => f.close?.());
          return;
        }
        framesRef.current = frames;
        dimsRef.current = { vw: width, vh: height };

        // Sample bg color from the first frame.
        try {
          const c = document.createElement("canvas");
          c.width = 16;
          c.height = 16;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(frames[0], 0, 0, 16, 16);
            const corners = [
              ctx.getImageData(0, 0, 1, 1).data,
              ctx.getImageData(15, 0, 1, 1).data,
              ctx.getImageData(0, 15, 1, 1).data,
              ctx.getImageData(15, 15, 1, 1).data,
            ];
            let r = 0, g = 0, b = 0;
            for (const p of corners) { r += p[0]; g += p[1]; b += p[2]; }
            onSampledBg(`rgb(${(r/4)|0}, ${(g/4)|0}, ${(b/4)|0})`);
          }
        } catch { /* noop */ }

        setReady(true);
      })
      .catch(() => {
        /* noop — fallback bg stays */
      });

    return () => {
      cancelled = true;
      framesRef.current.forEach((f) => f.close?.());
      framesRef.current = [];
    };
  }, [onSampledBg]);

  // Frame loop: scroll → frame index, scroll → blur, scroll → veil opacity.
  useEffect(() => {
    if (!ready) return;
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cssWidth = window.innerWidth;
    let cssHeight = window.innerHeight;

    function syncCanvas() {
      cssWidth = window.innerWidth;
      cssHeight = window.innerHeight;
      canvas!.width = Math.floor(cssWidth * dpr);
      canvas!.height = Math.floor(cssHeight * dpr);
      canvas!.style.width = cssWidth + "px";
      canvas!.style.height = cssHeight + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    syncCanvas();

    let cachedVh = window.innerHeight || 1;
    let targetIdx = 0;
    let displayIdx = 0;
    let lastDrawnIdx = -1;
    let lastBlur = -1;
    let lastVeil = 0;
    let scrollDirty = true;
    let rafId = 0;
    let running = true;

    const total = framesRef.current.length;

    function drawFrame(idx: number) {
      const frames = framesRef.current;
      const i = Math.max(0, Math.min(total - 1, idx | 0));
      const bmp = frames[i];
      if (!bmp) return;
      const { vw, vh: vhPx } = dimsRef.current;
      const scale = Math.max(cssWidth / vw, cssHeight / vhPx);
      const w = vw * scale;
      const h = vhPx * scale;
      const x = (cssWidth - w) / 2;
      const y = (cssHeight - h) / 2;
      ctx!.drawImage(bmp, x, y, w, h);
    }

    function compute() {
      const vh = cachedVh;
      const scrollPx = window.scrollY;

      // 1. frame index
      const scrub = scrollPx / (SCRUB_VH * vh);
      const clamped = scrub < 0 ? 0 : scrub > 1 ? 1 : scrub;
      targetIdx = clamped * (total - 1);

      // 2. blur
      const blurT = smoothstep(
        (scrollPx / vh - BLUR_START_VH) / (BLUR_FULL_VH - BLUR_START_VH)
      );
      const nextBlur = blurT * MAX_BLUR_PX;
      if (Math.abs(nextBlur - lastBlur) > 0.4) {
        wrapper!.style.filter = `blur(${nextBlur.toFixed(2)}px)`;
        lastBlur = nextBlur;
      }

      // 3. veil
      const veilT = smoothstep(
        (scrollPx / vh - VEIL_START_VH) / (VEIL_FULL_VH - VEIL_START_VH)
      );
      if (veilRef.current && Math.abs(veilT - lastVeil) > 0.005) {
        veilRef.current.style.opacity = String(veilT);
        lastVeil = veilT;
      }
    }

    function frame() {
      if (!running) return;
      if (scrollDirty) {
        compute();
        scrollDirty = false;
      }
      const delta = targetIdx - displayIdx;
      if (Math.abs(delta) > SEEK_EPSILON) {
        displayIdx += delta * LERP_SPEED;
      }
      const rounded = Math.round(displayIdx);
      if (rounded !== lastDrawnIdx) {
        drawFrame(rounded);
        lastDrawnIdx = rounded;
      }
      rafId = requestAnimationFrame(frame);
    }

    function onScroll() { scrollDirty = true; }
    function onResize() {
      cachedVh = window.innerHeight || 1;
      syncCanvas();
      lastDrawnIdx = -1;
      scrollDirty = true;
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    compute();
    drawFrame(0);
    rafId = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [ready, veilRef]);

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        contain: "strict",
        willChange: "filter",
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
        opacity: ready ? 1 : 0,
        transition: "opacity 0.4s ease",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}

export default function App() {
  const [bg, setBg] = useState(FALLBACK_BG);
  const veilRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.backgroundColor = bg;
    document.documentElement.style.backgroundColor = bg;
  }, [bg]);

  return (
    <div style={{ backgroundColor: bg, position: "relative" }}>
      <ScrubbingFlowers onSampledBg={setBg} veilRef={veilRef} />

      {/* White veil — fades in over the video instead of fading the
          video out, so the flowers never disappear or glitch. */}
      <div
        ref={veilRef}
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
          backgroundColor: VEIL_COLOR,
          opacity: 0,
          willChange: "opacity",
        }}
      />

      {/* Horizontal vignette overlay — 15% max edge shadow, smooth gradient. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2,
          pointerEvents: "none",
          background:
            "linear-gradient(to right," +
            " rgba(0,0,0,0.15) 0%," +
            " rgba(0,0,0,0.10) 8%," +
            " rgba(0,0,0,0.06) 16%," +
            " rgba(0,0,0,0.02) 28%," +
            " rgba(0,0,0,0)    50%," +
            " rgba(0,0,0,0.02) 72%," +
            " rgba(0,0,0,0.06) 84%," +
            " rgba(0,0,0,0.10) 92%," +
            " rgba(0,0,0,0.15) 100%)",
          mixBlendMode: "multiply",
        }}
      />

      <div style={{ position: "relative", zIndex: 3 }}>
        <Nav />
        <main>
          <TitlePage />
          <Hero />
          <Pedagogy />
          <Pipeline />
          <Signal />
          <Closer />
        </main>
      </div>
    </div>
  );
}
