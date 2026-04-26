import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatedNeonUnderlink } from "./AnimatedNeonUnderlink";
import { PipelineStepCarousel, type PipelineStep } from "./PipelineStepCarousel";
import { SKIP_FX } from "../lib/prerender";
import { preloadVideoFrames } from "../lib/preloadVideoFrames";

/** Same clip as the capture step — lives in /public. */
const PIPELINE_BG_VIDEO = "/pipeline-capture-bg.mp4";

/** More samples = smoother scrub (smaller steps). Decoded smaller via maxFrame* in preload. */
const PIPELINE_FRAME_COUNT = 520;
/** ~480p cap — faster decode, less GPU memory per frame. */
const MAX_FRAME_W = 854;
const MAX_FRAME_H = 480;
/** Drop the very start of the file from the decode range (less dead air on first scroll). */
const TRIM_START = 0.05;
/** Map scroll 0→1 to this subrange of the trimmed clip so motion starts earlier on screen. */
const SCRUB_START = 0.12;

/** Higher = display catches scroll faster (less “lag”). */
const FRAME_LERP = 0.97;

/** <1 = more video progress per px scroll (“more frames per scroll”). */
const SCRUB_RANGE_MULT = 0.82;
/** rAF lerp for native <video> fallback (pre-bitmap or decode error). */
const SEEK_LERP_VIDEO = 0.72;
const MIN_SEEK_INTERVAL_SEC = 0.028;

function PipelineScrollBackground({ children }: { children: ReactNode }) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<ImageBitmap[]>([]);
  const dimsRef = useRef({ w: 0, h: 0 });
  const displayIdxRef = useRef(0);
  const [framesReady, setFramesReady] = useState(false);

  useEffect(() => {
    if (SKIP_FX) return;
    let cancelled = false;
    preloadVideoFrames(PIPELINE_BG_VIDEO, PIPELINE_FRAME_COUNT, {
      maxFrameWidth: MAX_FRAME_W,
      maxFrameHeight: MAX_FRAME_H,
      trimStart: TRIM_START,
      trimEnd: 0,
    })
      .then(({ frames, width, height }) => {
        if (cancelled) {
          frames.forEach((f) => f.close?.());
          return;
        }
        framesRef.current = frames;
        dimsRef.current = { w: width, h: height };
        setFramesReady(true);
      })
      .catch(() => {
        // Leave frames empty; video fallback below keeps working.
      });
    return () => {
      cancelled = true;
      framesRef.current.forEach((f) => f.close?.());
      framesRef.current = [];
    };
  }, []);

  useEffect(() => {
    const field = fieldRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!field || !video || !canvas) return;

    if (SKIP_FX) {
      const onMeta = () => {
        const d = Number.isFinite(video.duration) ? video.duration : 0;
        if (d > 0) {
          try {
            video.pause();
            const t0 = d * TRIM_START;
            video.currentTime = t0 + (d - t0) * 0.45;
          } catch {
            /* ignore */
          }
        }
      };
      if (video.readyState >= 1) onMeta();
      else video.addEventListener("loadedmetadata", onMeta, { once: true });
      return () => video.removeEventListener("loadedmetadata", onMeta);
    }

    const ctx = canvas.getContext("2d", { alpha: false });
    const durationRef = { current: 0 };
    const renderedTimeRef = { current: 0 };
    const lastSeekRef = { current: -1 };
    let rafId = 0;
    let running = true;
    let cssW = 0;
    let cssH = 0;

    /** Scroll 0→1, then push into [SCRUB_START, 1] so motion starts earlier in-frame. */
    const readU = () => {
      const vh = window.innerHeight || 1;
      const rect = field.getBoundingClientRect();
      const scrubPx = Math.max(1, (rect.height - vh) * SCRUB_RANGE_MULT);
      const uScroll = -rect.top / scrubPx;
      const u = uScroll < 0 ? 0 : uScroll > 1 ? 1 : uScroll;
      return SCRUB_START + u * (1 - SCRUB_START);
    };

    const readUNorm = () => {
      const uMapped = readU();
      const div = 1 - SCRUB_START;
      if (div < 1e-6) return 0;
      return Math.max(0, Math.min(1, (uMapped - SCRUB_START) / div));
    };

    const coverRect = () => {
      const { w: fw, h: fh } = dimsRef.current;
      if (!fw || !fh) {
        return { x: 0, y: 0, w: cssW, h: cssH };
      }
      const coverBoost = 1.02;
      const scale = Math.max(cssW / fw, cssH / fh) * coverBoost;
      return {
        w: fw * scale,
        h: fh * scale,
        x: (cssW - fw * scale) / 2,
        y: (cssH - fh * scale) / 2,
      };
    };

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
      ctx.clearRect(0, 0, cssW, cssH);
      if (a < 0.001 || i0 === i1) {
        ctx.globalAlpha = 1;
        ctx.drawImage(b0, x, y, w, h);
        return;
      }
      if (!b1) {
        ctx.drawImage(b0, x, y, w, h);
        return;
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(b0, x, y, w, h);
      ctx.globalAlpha = a;
      ctx.drawImage(b1, x, y, w, h);
      ctx.globalAlpha = 1;
    };

    const syncCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssW = field.clientWidth;
      cssH = field.clientHeight;
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const tick = () => {
      rafId = 0;
      if (!running) return;
      const uNorm = readUNorm();
      const totalF = framesRef.current.length;
      if (totalF > 0 && ctx) {
        const targetIdx = uNorm * (totalF - 1);
        const di = displayIdxRef.current;
        const delta = targetIdx - di;
        if (Math.abs(delta) > 0.002) {
          displayIdxRef.current += delta * FRAME_LERP;
        } else {
          displayIdxRef.current = targetIdx;
        }
        drawFrameBlend(displayIdxRef.current);
      } else {
        const dur = durationRef.current;
        if (dur > 0) {
          const t0 = dur * TRIM_START;
          const target = t0 + uNorm * (dur - t0);
          let rt = renderedTimeRef.current;
          rt += (target - rt) * SEEK_LERP_VIDEO;
          if (Math.abs(target - rt) < 0.006) rt = target;
          renderedTimeRef.current = rt;
          const last = lastSeekRef.current;
          if (last < 0 || Math.abs(rt - last) >= MIN_SEEK_INTERVAL_SEC) {
            if (!video.paused) video.pause();
            try {
              video.currentTime = rt;
              lastSeekRef.current = rt;
            } catch {
              /* ignore */
            }
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    const kick = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(tick);
    };

    const onMeta = () => {
      const d = Number.isFinite(video.duration) ? video.duration : 0;
      durationRef.current = d;
      const t0 = d * TRIM_START;
      const uN = readUNorm();
      if (d > 0) {
        renderedTimeRef.current = t0 + uN * (d - t0);
        lastSeekRef.current = -1;
        try {
          if (!video.paused) video.pause();
          video.currentTime = renderedTimeRef.current;
          lastSeekRef.current = renderedTimeRef.current;
        } catch {
          /* ignore */
        }
        kick();
      }
    };

    const onActivity = () => {
      syncCanvas();
      kick();
    };

    const onResize = () => onActivity();

    syncCanvas();
    if (video.readyState >= 1) onMeta();
    else video.addEventListener("loadedmetadata", onMeta, { once: true });

    window.addEventListener("scroll", onActivity, { passive: true });
    window.addEventListener("wheel", onActivity, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    onActivity();

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      video.removeEventListener("loadedmetadata", onMeta);
      window.removeEventListener("scroll", onActivity);
      window.removeEventListener("wheel", onActivity);
      window.removeEventListener("resize", onResize);
    };
  }, [framesReady]);

  return (
    <div
      ref={fieldRef}
      className="relative left-1/2 w-screen min-h-[max(100svh,56.25vw)] max-w-none -translate-x-1/2 overflow-hidden"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 h-full w-full">
          <video
            ref={videoRef}
            className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 min-h-full min-w-full object-cover object-center"
            src={PIPELINE_BG_VIDEO}
            muted
            playsInline
            preload="auto"
            style={{
              opacity: framesReady ? 0 : 1,
              transition: "opacity 0.5s ease",
            }}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 block h-full w-full"
            style={{
              opacity: framesReady ? 1 : 0,
              transition: "opacity 0.5s ease",
            }}
            aria-hidden
          />
        </div>
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-28 bg-gradient-to-b from-[#f2f2f2] from-5% via-[#f2f2f2]/40 via-35% to-transparent sm:h-40 sm:from-10%"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-36 bg-gradient-to-t from-[#f2f2f2] from-10% via-[#f2f2f2]/50 to-transparent sm:h-44"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-8 bg-gradient-to-r from-[#f2f2f2]/50 to-transparent sm:w-12"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-8 bg-gradient-to-l from-[#f2f2f2]/50 to-transparent sm:w-12"
        aria-hidden
      />

      {children}
    </div>
  );
}

const STEPS: readonly PipelineStep[] = [
  {
    n: "01",
    name: "capture",
    sub: "every 8 seconds",
    body: "A frame from your iPad surface is grabbed via getDisplayMedia and diff'd locally. If less than 4 % changed, the cycle ends. Capture is the cheapest and most-fired stage.",
    out: "image/png · 1.04 MB · diff Δ",
    color: "paper-dim",
  },
  {
    n: "02",
    name: "ocr",
    sub: "vision + mathpix",
    body: "Sonnet sees the page and emits a structured page state — problem text, the canonical setup, every line of student work, what's circled, what's crossed out.",
    out: "page_state.json · t≈420ms",
    color: "brass",
  },
  {
    n: "03",
    name: "reason",
    sub: "skeptical solver",
    body: "Compares the student's most recent line against a cached canonical solution. Classifies each step: correct, minor_error, major_error, off_track. Cheap because most pages only added one line.",
    out: "step_status · severity 0–10",
    color: "moss",
  },
  {
    n: "04",
    name: "intervene",
    sub: "biased toward silence",
    body: "Reads the reasoning agent's verdict and the student's longitudinal struggle profile, then decides whether to speak. Default: false. If yes, generates one Socratic prompt — never the answer.",
    out: "should_speak · type · text",
    color: "red-pencil",
  },
];

export function Pipeline() {
  return (
    <section id="pipeline" className="relative">
      {/*
        Full-bleed video: scroll-scrubbed via pre-decoded ImageBitmaps (smooth),
        with <video> fallback before decode and if preload fails. Min height
        16:9-friendly; soft top blend from demo.
      */}
      <PipelineScrollBackground>
        <div className="relative z-10 mx-auto flex min-h-[max(100svh,56.25vw)] max-w-[1380px] flex-col justify-between px-6 sm:px-10">
          <div className="grid flex-1 grid-cols-1 content-center gap-x-12 gap-y-10 pb-12 pt-24 sm:pb-16 sm:pt-28 lg:grid-cols-12 lg:pt-32">
            <div className="lg:col-span-7">
              <motion.h2
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10%" }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                className="h-display text-[clamp(2.4rem,5vw,4.6rem)] text-bark drop-shadow-[0_1px_2px_rgba(255,255,255,0.35)]"
              >
                <span className="block">from pixels</span>
                <span className="block">
                  to{" "}
                  <AnimatedNeonUnderlink
                    className="text-bark [font-style:italic]"
                    viewDelay={0.06}
                    gap={5}
                    durationSec={1.35}
                  >
                    insight
                  </AnimatedNeonUnderlink>
                  <span className="text-neon">.</span>
                </span>
              </motion.h2>
            </div>
            <div className="lg:col-span-5 lg:pt-2">
              <motion.p
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: "-10%" }}
                transition={{ duration: 0.7, delay: 0.1 }}
                className="text-bark/95 text-[15px] leading-[1.7] font-sub drop-shadow-[0_1px_1px_rgba(255,255,255,0.4)]"
              >
                Every eight seconds your screen becomes a JSON document. Three
                specialised agents read it in series — each one cheaper, faster,
                and more skeptical than the last.
              </motion.p>
            </div>
          </div>

          <motion.div
            className="w-full max-w-xl pb-12 pt-4 sm:max-w-2xl sm:pb-16 sm:pt-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-8%" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="relative rounded-2xl border border-ink/10 bg-[#f2f2f2]/50 p-3 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.12)] backdrop-blur-[2px] sm:p-4">
              <PipelineStepCarousel steps={STEPS} />
            </div>
          </motion.div>
        </div>
      </PipelineScrollBackground>

      <div className="mx-auto max-w-[1380px] px-6 sm:px-10">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.7 }}
          className="mt-20 grid grid-cols-1 gap-8 border-t border-ink-line bg-[#f2f2f2] py-20 pt-16 sm:mt-24 sm:pt-20 md:grid-cols-12"
        >
          <div className="md:col-span-4">
            <span className="meta-label">cost model</span>
            <h4
              className="mt-3 text-ink text-[1.6rem]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              two cents per cycle, mostly skipped
              <span className="text-neon">.</span>
            </h4>
          </div>
          <div className="md:col-span-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              ["~ 95%", "of frames skipped", "(no diff, no work)"],
              ["~ 4%", "reach the OCR agent", "(diff but trivial)"],
              ["~ 1%", "reach intervene", "(and most stay silent)"],
            ].map(([n, top, bot]) => (
              <div key={top} className="border-l border-ink-line pl-5">
                <div
                  className="text-ink text-[1.8rem] leading-none mb-1 tabular-nums"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {n}
                </div>
                <div className="meta-label text-ink/70">{top}</div>
                <div className="mt-1 font-sub text-[11px] text-ink/55">{bot}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
