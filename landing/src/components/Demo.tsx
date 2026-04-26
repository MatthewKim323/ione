import { useEffect, useRef, useState } from "react";

// ── Tunables ───────────────────────────────────────────────────────────
// How tall the demo section is, in viewport heights. The video scrubs
// from frame 0 → last frame across (SECTION_VH - 1)vh of scroll, since
// the canvas itself is `position: sticky; top: 0; height: 100vh`.
// Bump higher = slower scrub (more scroll per frame).
const SECTION_VH = 2.5;

// How many bitmaps to pre-decode. More = smoother. 240 is the sweet
// spot for a short clip on a typical laptop.
const FRAME_COUNT = 240;

// rAF lerp toward target frame. Lower = more inertia / smoother glide.
const FRAME_LERP = 0.22;

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
  const stickyRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<ImageBitmap[]>([]);
  const dimsRef = useRef({ vw: 0, vh: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!ready) return;
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;

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
      // cover-fit so the video fills the viewport on any aspect ratio
      const scale = Math.max(cssWidth / vw, cssHeight / vhPx);
      const w = vw * scale;
      const h = vhPx * scale;
      const x = (cssWidth - w) / 2;
      const y = (cssHeight - h) / 2;
      ctx!.drawImage(bmp, x, y, w, h);
    }

    function compute() {
      // Map the section's vertical scroll progress (0 → 1) to frame index.
      // Section is SECTION_VH tall and the sticky canvas is 1vh, so scrub
      // length = (SECTION_VH - 1) * viewport-height.
      const rect = section!.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const scrubPx = Math.max(1, rect.height - vh);
      // -rect.top = pixels of the section already scrolled past viewport top
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
      style={{
        position: "relative",
        height: `${SECTION_VH * 100}vh`,
        // Black gives the cover-fit a clean letterbox before frames load.
        backgroundColor: "#000",
      }}
    >
      <div
        ref={stickyRef}
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          width: "100%",
          overflow: "hidden",
          opacity: ready ? 1 : 0,
          transition: "opacity 0.5s ease",
          willChange: "opacity",
        }}
      >
        <canvas
          ref={canvasRef}
          aria-hidden
          style={{
            display: "block",
            width: "100%",
            height: "100%",
          }}
        />
      </div>
    </section>
  );
}
