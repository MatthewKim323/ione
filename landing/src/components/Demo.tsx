import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { SectionLabel } from "./SectionLabel";

// ── Tunables ───────────────────────────────────────────────────────────
// How tall the demo section is, in viewport heights. The video scrubs
// from frame 0 → last frame across (SECTION_VH - 1)vh of scroll, since
// the canvas itself is `position: sticky; top: 0; height: 100vh`.
// Bump higher = slower scrub (more scroll per frame).
const SECTION_VH = 2.2;

// How many bitmaps to pre-decode. We deliberately use fewer than the
// flowers (240) because:
//   1. We don't want to compete with the flower preload on first paint.
//   2. Screen-recording content has less per-frame motion than the
//      flowers, so 180 already feels glass-smooth.
const FRAME_COUNT = 180;

// rAF lerp toward target frame. Lower = more inertia / smoother glide.
const FRAME_LERP = 0.22;

// Start pre-decoding when the section is within this many viewports of
// being on screen. Keeps the flower preload uncontested at page load.
const PRELOAD_ROOT_MARGIN = "150% 0px";

async function preloadFrames(
  src: string,
  count: number,
): Promise<{ frames: ImageBitmap[]; width: number; height: number }> {
  const video = document.createElement("video");
  video.src = src;
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

export function Demo() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<ImageBitmap[]>([]);
  const dimsRef = useRef({ vw: 0, vh: 0 });
  const [shouldLoad, setShouldLoad] = useState(false);
  const [ready, setReady] = useState(false);

  // Only start the heavy preload once the section is within ~1.5 viewports.
  // This keeps the flowers' preload uncontested on first paint.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldLoad(true);
            io.disconnect();
            return;
          }
        }
      },
      { rootMargin: PRELOAD_ROOT_MARGIN, threshold: 0 },
    );
    io.observe(section);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoad) return;
    let cancelled = false;
    preloadFrames("/demo.mp4", FRAME_COUNT)
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
        /* swallow — section just stays empty */
      });

    return () => {
      cancelled = true;
      framesRef.current.forEach((f) => f.close?.());
      framesRef.current = [];
    };
  }, [shouldLoad]);

  useEffect(() => {
    if (!ready) return;
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
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

    let targetIdx = 0;
    let displayIdx = 0;
    let lastDrawnIdx = -1;
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
      // contain-fit so nothing is cropped — screen recordings are
      // information-dense and cropping looks broken.
      const scale = Math.min(cssWidth / vw, cssHeight / vhPx);
      const w = vw * scale;
      const h = vhPx * scale;
      const x = (cssWidth - w) / 2;
      const y = (cssHeight - h) / 2;
      ctx!.clearRect(0, 0, cssWidth, cssHeight);
      ctx!.drawImage(bmp, x, y, w, h);
    }

    function compute() {
      const rect = section!.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const scrubPx = Math.max(1, rect.height - vh);
      const t = -rect.top / scrubPx;
      const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
      targetIdx = clamped * (total - 1);
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
    <section
      ref={sectionRef}
      id="demo"
      aria-label="demo"
      className="relative border-t border-ink-line"
      style={{ height: `${SECTION_VH * 100}vh` }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          width: "100%",
          overflow: "hidden",
        }}
      >
        {/* Canvas underlay — fills the viewport, fades in when frames are ready. */}
        <canvas
          ref={canvasRef}
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "block",
            width: "100%",
            height: "100%",
            opacity: ready ? 1 : 0,
            transition: "opacity 0.6s ease",
            willChange: "opacity",
          }}
        />

        {/* Subtle vignette so the chrome label reads cleanly over any frame. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "linear-gradient(to bottom," +
              " rgba(0,0,0,0.35) 0%," +
              " rgba(0,0,0,0)    18%," +
              " rgba(0,0,0,0)    72%," +
              " rgba(0,0,0,0.45) 100%)",
          }}
        />

        {/* Section chrome — same language as the rest of the page. */}
        <div className="absolute inset-x-0 top-0 px-6 sm:px-10 pt-10">
          <div className="max-w-[1380px] mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-15%" }}
              transition={{ duration: 0.6 }}
            >
              <SectionLabel number="004" name="demo" />
            </motion.div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 px-6 sm:px-10 pb-10">
          <div className="max-w-[1380px] mx-auto flex items-end justify-between gap-6 font-mono text-[10px] uppercase tracking-[0.22em] text-paper">
            <span>scroll · scrubs · capture</span>
            <span>excerpt · 2026.04.25</span>
          </div>
        </div>
      </div>
    </section>
  );
}
