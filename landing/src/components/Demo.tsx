import { useEffect, useRef, useState } from "react";

// ── Tunables ───────────────────────────────────────────────────────────
// How tall the demo section is, in viewport heights. The video scrubs
// from frame 0 → last frame across (SECTION_VH - 1)vh of scroll, since
// the canvas itself is `position: sticky; top: 0; height: 100vh`.
// Bump higher = slower scrub (more scroll per frame).
const SECTION_VH = 2.2;

// How many bitmaps to pre-decode. Fewer than the flowers (240) so we
// don't compete with their preload, but enough to feel glass-smooth.
const FRAME_COUNT = 180;

// rAF lerp toward target frame. Lower = more inertia / smoother glide.
const FRAME_LERP = 0.22;

// Start pre-decoding when the section is within this many viewports of
// being on screen. Keeps the flower preload uncontested at page load.
const PRELOAD_ROOT_MARGIN = "150% 0px";

// Match the surrounding page background so any letterbox around the
// contain-fit video reads as part of the page, not as a hard rectangle.
const PAGE_BG = "#f2f2f2";

// Inset the framed plate from the viewport edges so the video sits
// inside the page like every other section, instead of edge-bleeding.
// Tuned to leave a comfortable margin without shrinking the plate too
// much on small laptops.
const PLATE_INSET_VH = 8; // top/bottom margin in vh
const PLATE_INSET_VW = 5; // left/right margin in vw

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
    let cssWidth = 0;
    let cssHeight = 0;

    function syncCanvas() {
      // Read the canvas's own rendered size — it's CSS-inset from the
      // viewport (PLATE_INSET_*) so we don't want window dimensions.
      const rect = canvas!.getBoundingClientRect();
      cssWidth = Math.max(1, rect.width);
      cssHeight = Math.max(1, rect.height);
      canvas!.width = Math.floor(cssWidth * dpr);
      canvas!.height = Math.floor(cssHeight * dpr);
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
      // contain-fit so nothing is cropped — screen-recording content
      // is information-dense and cropping looks broken.
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
      className="relative"
      style={{
        height: `${SECTION_VH * 100}vh`,
        backgroundColor: PAGE_BG,
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          width: "100%",
          overflow: "hidden",
          backgroundColor: PAGE_BG,
          // Center the framed plate within the viewport.
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "relative",
            // Plate is inset from the viewport edges so the section
            // reads as a framed piece sitting inside the page rather
            // than a full-bleed video punching through it.
            width: `calc(100% - ${PLATE_INSET_VW * 2}vw)`,
            height: `calc(100% - ${PLATE_INSET_VH * 2}vh)`,
            backgroundColor: PAGE_BG,
            // Soft, low-contrast shadow so it lifts off the page without
            // looking like a heavy chrome'd window.
            boxShadow:
              "0 24px 60px -28px rgba(0,0,0,0.18)," +
              " 0 4px 18px -8px rgba(0,0,0,0.10)",
            overflow: "hidden",
          }}
        >
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
        </div>
      </div>
    </section>
  );
}
