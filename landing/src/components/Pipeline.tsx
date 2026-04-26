import { motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { AnimatedNeonUnderlink } from "./AnimatedNeonUnderlink";
import { TextClipPathRevealLines } from "./TextClipPathReveal";
import { PipelineStepCarousel, type PipelineStep } from "./PipelineStepCarousel";
import { SKIP_FX } from "../lib/prerender";

/** Same clip as the capture step — lives in /public. Loop seamlessness depends on the file (first/last frames). */
const PIPELINE_BG_VIDEO = "/pipeline-capture-bg.mp4";

function PipelineLoopBackground({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const root = containerRef.current;
    if (!video || !root) return;

    if (SKIP_FX) {
      const freeze = () => {
        const d = Number.isFinite(video.duration) ? video.duration : 0;
        if (d > 0) {
          try {
            video.pause();
            video.currentTime = d * 0.45;
          } catch {
            /* ignore */
          }
        }
      };
      if (video.readyState >= 1) freeze();
      else video.addEventListener("loadedmetadata", freeze, { once: true });
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            void video.play().catch(() => {});
          } else {
            video.pause();
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -5% 0px" }
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative left-1/2 w-screen min-h-[max(100svh,56.25vw)] max-w-none -translate-x-1/2 overflow-hidden"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 h-full w-full">
          <video
            ref={videoRef}
            className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 min-h-full min-w-full object-cover object-center"
            src={PIPELINE_BG_VIDEO}
            muted
            loop
            playsInline
            preload="auto"
            autoPlay={!SKIP_FX}
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
    <section id="pipeline" className="relative scroll-mt-28">
      {/*
        Full-bleed video loops in the background; play/pause with visibility.
        Min height 16:9-friendly; soft top blend from demo.
      */}
      <PipelineLoopBackground>
        <div className="relative z-10 mx-auto flex min-h-[max(100svh,56.25vw)] max-w-[1380px] flex-col justify-between px-6 sm:px-10">
          <div className="grid flex-1 grid-cols-1 content-center gap-x-12 gap-y-10 pb-12 pt-24 sm:pb-16 sm:pt-28 lg:grid-cols-12 lg:pt-32">
            <div className="lg:col-span-7">
              <h2 className="h-display text-[clamp(2.4rem,5vw,4.6rem)] text-bark drop-shadow-[0_1px_2px_rgba(255,255,255,0.35)]">
                <TextClipPathRevealLines
                  lineClassName="block"
                  lines={[
                    "from pixels",
                    <>
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
                    </>,
                  ]}
                />
              </h2>
            </div>
            <div className="lg:col-span-5 lg:pt-2">
              <div className="text-bark/95 text-sm sm:text-base font-sub font-bold leading-[1.75] tracking-[0.1em] drop-shadow-[0_1px_1px_rgba(255,255,255,0.4)]">
                <TextClipPathRevealLines
                  lineClassName="block"
                  lines={[
                    <>
                      Every eight seconds your screen becomes a{" "}
                      <span className="font-extrabold text-bark">JSON</span>{" "}
                      document.
                    </>,
                    <>
                      Three specialised agents read it in series — each one cheaper,
                    </>,
                    <>faster, and more skeptical than the last.</>,
                  ]}
                />
              </div>
            </div>
          </div>

          <motion.div
            className="w-full max-w-xl pb-12 pt-4 sm:max-w-2xl sm:pb-16 sm:pt-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-8%" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="relative rounded-2xl border border-ink/15 bg-[#e4ded2]/45 p-3 shadow-[0_10px_32px_-14px_rgba(22,19,16,0.12),0_0_0_1px_rgba(255,255,255,0.18)_inset] backdrop-blur-[2px] sm:p-4">
              <PipelineStepCarousel steps={STEPS} />
            </div>
          </motion.div>
        </div>
      </PipelineLoopBackground>

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
              <TextClipPathRevealLines
                lines={[
                  <>
                    two cents per cycle, mostly skipped
                    <span className="text-neon">.</span>
                  </>,
                ]}
              />
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
