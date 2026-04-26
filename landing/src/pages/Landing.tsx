import { useEffect, useRef, useState } from "react";
import { Nav } from "../components/Nav";
import { TitlePage } from "../components/TitlePage";
import { Hero } from "../components/Hero";
import { Pedagogy } from "../components/Pedagogy";
import { Pipeline } from "../components/Pipeline";
import { Demo } from "../components/Demo";
import { Signal } from "../components/Signal";
import { Closer } from "../components/Closer";
import { SKIP_FX } from "../lib/prerender";

const PAGE_BG = "#f2f2f2";

// How many viewport-heights of scroll equal one full pass through the video.
// 1.6 = the video's entire duration plays out over ~1.6 screens of scrolling.
const SCRUB_RANGE_VH = 1.6;

// Where (within the scrub range) the video starts fading out.
// 0.78 = video stays fully opaque until you've scrolled ~78% of the range,
// then fades out over the last ~22%.
const FADE_START_T = 0.78;

// How many frames to pre-decode from /bg.mp4. Higher = smoother scrub,
// at the cost of memory + a longer initial preload. 240 looks buttery on
// a typical short clip; bump to 360 if you still see steps on a fast wheel.
const FRAME_COUNT = 240;

// rAF lerp toward target frame. Lower = more inertia / smoother glide.
const FRAME_LERP = 0.22;

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

function FlowerBackground() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<ImageBitmap[]>([]);
  const dimsRef = useRef({ vw: 0, vh: 0 });
  const [ready, setReady] = useState(false);

  // Preload bitmaps once on mount.
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
        setReady(true);
      })
      .catch(() => {
        /* fallback bg stays */
      });

    return () => {
      cancelled = true;
      framesRef.current.forEach((f) => f.close?.());
      framesRef.current = [];
    };
  }, []);

  // Frame loop: scroll → frame index, scroll → opacity.
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
    let lastOpacity = -1;
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
      // cover-fit
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

      const t = scrollPx / (vh * SCRUB_RANGE_VH);
      const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
      targetIdx = clamped * (total - 1);

      const fadeT =
        clamped < FADE_START_T
          ? 0
          : (clamped - FADE_START_T) / Math.max(0.001, 1 - FADE_START_T);
      const opacity = 1 - (fadeT > 1 ? 1 : fadeT);
      if (Math.abs(opacity - lastOpacity) > 0.005) {
        wrapper!.style.opacity = String(opacity);
        lastOpacity = opacity;
      }
    }

    function frame() {
      if (!running) return;
      if (scrollDirty) {
        compute();
        scrollDirty = false;
      }
      const delta = targetIdx - displayIdx;
      if (Math.abs(delta) > 0.005) {
        displayIdx += delta * FRAME_LERP;
      }
      const rounded = Math.round(displayIdx);
      if (rounded !== lastDrawnIdx) {
        drawFrame(rounded);
        lastDrawnIdx = rounded;
      }
      rafId = requestAnimationFrame(frame);
    }

    function onScroll() {
      scrollDirty = true;
    }
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
  }, [ready]);

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
        opacity: ready ? 1 : 0,
        transition: "opacity 0.5s ease",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      {/* Dim overlay — sits on top of the flowers (still inside the
          wrapper) so it fades out together with them on scroll, leaving
          the rest of the page un-darkened once they're gone. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.32)",
          pointerEvents: "none",
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

      <div style={{ position: "relative", zIndex: 2 }}>
        <Nav />
        <main>
          <TitlePage />
          <Hero />
          <Demo />
          <Pedagogy />
          <Pipeline />
          <Signal />
          <Closer />
        </main>
      </div>
    </div>
  );
}
