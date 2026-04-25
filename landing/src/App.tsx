import { useEffect, useRef, useState } from "react";
import { Nav } from "./components/Nav";
import { TitlePage } from "./components/TitlePage";
import { Hero } from "./components/Hero";
import { Pedagogy } from "./components/Pedagogy";
import { Pipeline } from "./components/Pipeline";
import { Signal } from "./components/Signal";
import { Closer } from "./components/Closer";

// Two-screen scrub.  Scrub fills the first 1.5 screens; fade lasts 0.5.
const SCRUB_VH = 1.5;
const FADE_VH = 0.5;
const TOTAL_VH = SCRUB_VH + FADE_VH;

// Lower = smoother, more lag.  0.18 is a good comfort point.
const LERP_SPEED = 0.18;

// Don't seek for tiny deltas — most browsers throw extra cost on every seek.
const SEEK_EPSILON = 0.012;

const FALLBACK_BG = "#f2f2f2";

function ScrubbingBackgroundVideo({
  onSampledBg,
}: {
  onSampledBg: (color: string) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sampledRef = useRef(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const video = videoRef.current;
    if (!wrapper || !video) return;

    video.pause();

    let targetTime = 0;
    let displayTime = 0;
    let lastSeekTime = -1;
    let lastOpacity = 1;
    let isHidden = false;
    let scrollDirty = true;
    let rafId = 0;
    let running = true;

    // Cache window.innerHeight; only refresh on resize.  Reading it on
    // every scroll causes layout thrash on some browsers.
    let cachedVh = window.innerHeight || 1;

    // Use the faster seek API when available — Firefox/Safari have it,
    // Chrome falls back to plain assignment.
    const supportsFastSeek = typeof (video as HTMLVideoElement & {
      fastSeek?: (t: number) => void;
    }).fastSeek === "function";

    function compute() {
      const vh = cachedVh;
      const scrollPx = window.scrollY;

      const scrubProgress = scrollPx / (SCRUB_VH * vh);
      const clampedScrub = scrubProgress < 0 ? 0 : scrubProgress > 1 ? 1 : scrubProgress;
      targetTime = clampedScrub * (video!.duration || 0);

      const fadeStart = SCRUB_VH * vh;
      const fadeEnd = TOTAL_VH * vh;
      let nextOpacity = 1;
      if (scrollPx > fadeStart) {
        const t = (scrollPx - fadeStart) / (fadeEnd - fadeStart);
        nextOpacity = t >= 1 ? 0 : 1 - t;
      }
      // Write directly to the DOM — no React re-render.
      if (Math.abs(nextOpacity - lastOpacity) > 0.005) {
        wrapper!.style.opacity = String(nextOpacity);
        lastOpacity = nextOpacity;
      }

      // Hard hide past the 2-screen cap.  display:none also frees up
      // the GPU layer + paint cost.
      const shouldHide = scrollPx >= fadeEnd;
      if (shouldHide !== isHidden) {
        wrapper!.style.display = shouldHide ? "none" : "block";
        isHidden = shouldHide;
        if (shouldHide && !video!.paused) video!.pause();
      }
    }

    function trySampleBg() {
      if (sampledRef.current || !video || video.readyState < 2) return;
      try {
        const c = document.createElement("canvas");
        c.width = 16;
        c.height = 16;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, 16, 16);
        const corners = [
          ctx.getImageData(0, 0, 1, 1).data,
          ctx.getImageData(15, 0, 1, 1).data,
          ctx.getImageData(0, 15, 1, 1).data,
          ctx.getImageData(15, 15, 1, 1).data,
        ];
        let r = 0, g = 0, b = 0;
        for (const p of corners) {
          r += p[0]; g += p[1]; b += p[2];
        }
        onSampledBg(`rgb(${(r / 4) | 0}, ${(g / 4) | 0}, ${(b / 4) | 0})`);
        sampledRef.current = true;
      } catch {
        /* noop — fallback bg stays */
      }
    }

    function frame() {
      if (!running) return;

      // Recompute scroll-derived values at most once per frame.
      if (scrollDirty) {
        compute();
        scrollDirty = false;
      }

      if (!isHidden) {
        const delta = targetTime - displayTime;
        const absDelta = delta < 0 ? -delta : delta;

        // Snap when we're already there — saves a wasted seek every frame.
        if (absDelta > 0.001) {
          displayTime += delta * LERP_SPEED;

          if (
            Number.isFinite(displayTime) &&
            Math.abs(displayTime - lastSeekTime) > SEEK_EPSILON
          ) {
            try {
              if (supportsFastSeek) {
                (video as HTMLVideoElement & { fastSeek: (t: number) => void })
                  .fastSeek(displayTime);
              } else {
                video!.currentTime = displayTime;
              }
              lastSeekTime = displayTime;
            } catch {
              /* metadata not ready or seek unsupported */
            }
          }
        }
      }

      rafId = requestAnimationFrame(frame);
    }

    // Coalesce scroll events into one rAF tick.
    function onScroll() {
      scrollDirty = true;
    }

    function onResize() {
      cachedVh = window.innerHeight || 1;
      scrollDirty = true;
    }

    function onMeta() {
      scrollDirty = true;
      trySampleBg();
    }

    function onLoadedData() {
      trySampleBg();
    }

    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("loadeddata", onLoadedData);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    if (video.readyState >= 1) compute();
    if (video.readyState >= 2) trySampleBg();

    rafId = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("loadeddata", onLoadedData);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [onSampledBg]);

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        // contained paint = browser only invalidates this layer on opacity
        // changes, not the whole page.
        contain: "strict",
        willChange: "opacity",
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
        opacity: 1,
      }}
    >
      <video
        ref={videoRef}
        src="/bg.mp4"
        muted
        playsInline
        preload="auto"
        // Disable bg machinery the browser would otherwise spin up.
        disablePictureInPicture
        disableRemotePlayback
        crossOrigin="anonymous"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          transform: "translateZ(0)",
          willChange: "transform",
          filter: "saturate(1.08) contrast(1.04)",
        }}
      />
    </div>
  );
}

export default function App() {
  const [bg, setBg] = useState(FALLBACK_BG);

  useEffect(() => {
    document.body.style.backgroundColor = bg;
    document.documentElement.style.backgroundColor = bg;
  }, [bg]);

  return (
    <div style={{ backgroundColor: bg, position: "relative" }}>
      <ScrubbingBackgroundVideo onSampledBg={setBg} />
      <div style={{ position: "relative", zIndex: 1 }}>
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
