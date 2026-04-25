import { useEffect, useRef, useState } from "react";
import { Nav } from "./components/Nav";
import { TitlePage } from "./components/TitlePage";
import { Hero } from "./components/Hero";
import { Pedagogy } from "./components/Pedagogy";
import { Pipeline } from "./components/Pipeline";
import { Signal } from "./components/Signal";
import { Closer } from "./components/Closer";

// Page boundaries (measured in viewport heights).
const BLUR_START_VH = 0.5; // start blurring midway through page 1
const BLUR_FULL_VH = 2.0; // fully blurred by end of page 2
const FADE_OUT_END_VH = 3.0; // fully gone by end of page 3

// Unfocused blur prop range used at each phase.
const BLUR_MIN = 0; // razor sharp
const BLUR_MAX = 600; // heavy directional blur

const FALLBACK_BG = "#f2f2f2";

function smoothstep(t: number) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

function UnfocusedBackground({
  onSampledBg,
}: {
  onSampledBg: (color: string) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sampledRef = useRef(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const iframe = iframeRef.current;
    if (!wrapper || !iframe) return;

    let cachedVh = window.innerHeight || 1;
    let lastBlur = -1;
    let lastOpacity = 1;
    let isHidden = false;
    let scrollDirty = true;
    let rafId = 0;
    let running = true;
    let iframeReady = false;

    function postBlur(blur: number) {
      if (!iframeReady || !iframe.contentWindow) return;
      iframe.contentWindow.postMessage(
        { type: "unfocused:update", props: { blur } },
        "*"
      );
    }

    function compute() {
      const vh = cachedVh;
      const scrollPx = window.scrollY;

      const blurT = smoothstep(
        (scrollPx / vh - BLUR_START_VH) / (BLUR_FULL_VH - BLUR_START_VH)
      );
      const nextBlur = BLUR_MIN + blurT * (BLUR_MAX - BLUR_MIN);

      const fadeT = smoothstep(
        (scrollPx / vh - BLUR_FULL_VH) / (FADE_OUT_END_VH - BLUR_FULL_VH)
      );
      const nextOpacity = 1 - fadeT;

      if (Math.abs(nextBlur - lastBlur) > 4) {
        postBlur(nextBlur);
        lastBlur = nextBlur;
      }
      if (Math.abs(nextOpacity - lastOpacity) > 0.005) {
        wrapper!.style.opacity = String(nextOpacity);
        lastOpacity = nextOpacity;
      }

      const shouldHide = scrollPx >= FADE_OUT_END_VH * vh;
      if (shouldHide !== isHidden) {
        wrapper!.style.display = shouldHide ? "none" : "block";
        isHidden = shouldHide;
      }
    }

    function tick() {
      if (!running) return;
      if (scrollDirty) {
        compute();
        scrollDirty = false;
      }
      rafId = requestAnimationFrame(tick);
    }

    function onScroll() {
      scrollDirty = true;
    }
    function onResize() {
      cachedVh = window.innerHeight || 1;
      scrollDirty = true;
    }

    function onMsg(e: MessageEvent) {
      if (!e.data) return;
      if (e.data.type === "unfocused:ready") {
        iframeReady = true;
        sampleBgColor();
        scrollDirty = true;
      }
    }

    // Sample the iframe's video element's first frame to extract the
    // dominant background color, so the page seam is invisible.
    async function sampleBgColor() {
      if (sampledRef.current) return;
      try {
        // Easier path: load a fresh video off-screen just to grab the color.
        const probe = document.createElement("video");
        probe.src = "/bg.mp4";
        probe.muted = true;
        probe.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          probe.addEventListener("loadeddata", () => resolve(), { once: true });
          probe.addEventListener("error", () => reject(), { once: true });
        });
        const c = document.createElement("canvas");
        c.width = 16;
        c.height = 16;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(probe, 0, 0, 16, 16);
        const corners = [
          ctx.getImageData(0, 0, 1, 1).data,
          ctx.getImageData(15, 0, 1, 1).data,
          ctx.getImageData(0, 15, 1, 1).data,
          ctx.getImageData(15, 15, 1, 1).data,
        ];
        let r = 0,
          g = 0,
          b = 0;
        for (const p of corners) {
          r += p[0];
          g += p[1];
          b += p[2];
        }
        onSampledBg(`rgb(${(r / 4) | 0}, ${(g / 4) | 0}, ${(b / 4) | 0})`);
        sampledRef.current = true;
      } catch {
        /* noop — fallback bg stays */
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("message", onMsg);

    rafId = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("message", onMsg);
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
        contain: "strict",
        willChange: "opacity",
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
        opacity: 1,
      }}
    >
      <iframe
        ref={iframeRef}
        title="background"
        src={`/unfocused.html?blur=${BLUR_MIN}`}
        style={{
          width: "100%",
          height: "100%",
          border: "0",
          display: "block",
          background: "transparent",
        }}
        // Allow autoplay etc.
        allow="autoplay"
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
      <UnfocusedBackground onSampledBg={setBg} />

      {/* Horizontal vignette overlay — 15% max edge shadow, smooth gradient. */}
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
          <Signal />
          <Closer />
        </main>
      </div>
    </div>
  );
}
