import { useEffect, useRef } from "react";
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
// Bump higher to slow the bloom; lower to make it whip past faster.
const SCRUB_RANGE_VH = 1.6;

// Where (within the scrub range) the video starts fading out.
// 0.78 = video stays fully opaque until you've scrolled ~78% of the range,
// then fades out over the last ~22%. Tweak alongside SCRUB_RANGE_VH if you
// want the fade to happen earlier/later inside the bloom.
const FADE_START_T = 0.78;

function FlowerBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (SKIP_FX) {
      video.style.opacity = "1";
      return;
    }

    // Native video scrubbing — the video's currentTime is mapped 1:1 to the
    // user's scroll position. We never call .play(); the browser only seeks.
    // This is the same UX the canvas-frames version had, but the file streams
    // immediately instead of waiting on 120 ImageBitmap decodes.
    let lastOpacity = -1;
    let lastTargetTime = -1;
    let scrollDirty = true;
    let rafId = 0;
    let running = true;
    let cachedVh = window.innerHeight || 1;
    let duration = 0;

    // currentTime is interpolated toward target so a fast scroll doesn't
    // demand a single huge seek (which can hitch). 0.18 = catches up in
    // ~6 frames at 60fps. Pure CSS — no easing libs needed.
    const SEEK_LERP = 0.18;
    let renderedTime = 0;

    const computeProgress = () => {
      const t = window.scrollY / (cachedVh * SCRUB_RANGE_VH);
      return t < 0 ? 0 : t > 1 ? 1 : t;
    };

    const apply = () => {
      const t = computeProgress();

      // ── opacity ────────────────────────────────────────────────────
      const fadeT =
        t < FADE_START_T
          ? 0
          : (t - FADE_START_T) / Math.max(0.001, 1 - FADE_START_T);
      const opacity = 1 - (fadeT > 1 ? 1 : fadeT);
      if (Math.abs(opacity - lastOpacity) > 0.005) {
        video.style.opacity = String(opacity);
        lastOpacity = opacity;
      }

      // ── scrub ──────────────────────────────────────────────────────
      if (duration > 0) {
        const target = t * duration;
        // Smooth toward target so flicks of the wheel don't cause stutters.
        renderedTime += (target - renderedTime) * SEEK_LERP;
        // Snap when we're close enough to avoid trailing forever.
        if (Math.abs(target - renderedTime) < 0.005) renderedTime = target;
        if (Math.abs(renderedTime - lastTargetTime) > 0.012) {
          // Pause the video before seeking — Safari ignores currentTime
          // assignments on a playing element in some versions.
          if (!video.paused) video.pause();
          try {
            video.currentTime = renderedTime;
          } catch {
            // ignore — happens if metadata isn't quite ready
          }
          lastTargetTime = renderedTime;
        }
      }
    };

    const frame = () => {
      if (!running) return;
      // Keep ticking even when scroll is idle so the seek-lerp catches up.
      apply();
      rafId = requestAnimationFrame(frame);
    };

    const onScroll = () => {
      scrollDirty = true;
    };
    const onResize = () => {
      cachedVh = window.innerHeight || 1;
      scrollDirty = true;
    };

    const onMeta = () => {
      duration = Number.isFinite(video.duration) ? video.duration : 0;
      // Land on the correct first frame for whatever scroll position we
      // already have (e.g. user reloaded mid-page).
      renderedTime = computeProgress() * duration;
      try {
        if (!video.paused) video.pause();
        video.currentTime = renderedTime;
      } catch {
        // ignore
      }
    };

    if (video.readyState >= 1) {
      onMeta();
    } else {
      video.addEventListener("loadedmetadata", onMeta, { once: true });
    }

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    rafId = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      video.removeEventListener("loadedmetadata", onMeta);
      // Suppress the unused-var warning for scrollDirty — kept on purpose
      // in case we re-enable scroll-gated rendering later.
      void scrollDirty;
    };
  }, []);

  return (
    <video
      ref={videoRef}
      src="/bg.mp4"
      muted
      playsInline
      preload="auto"
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        zIndex: 0,
        pointerEvents: "none",
        opacity: 1,
        willChange: "opacity",
        transform: "translateZ(0)",
      }}
    />
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
          <Pedagogy />
          <Pipeline />
          <Demo />
          <Signal />
          <Closer />
        </main>
      </div>
    </div>
  );
}
