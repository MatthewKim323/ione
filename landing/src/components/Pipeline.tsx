import { motion } from "motion/react";
import { SectionLabel } from "./SectionLabel";

/** Same clip as the capture step — lives in /public. */
const PIPELINE_BG_VIDEO = "/pipeline-capture-bg.mp4";

/** Match Landing flower dim: readable type over footage. */
const VIDEO_DIM = "rgba(0, 0, 0, 0.18)";

function VideoDimBackdrop({ className = "" }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 ${className}`}
      aria-hidden
    >
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={PIPELINE_BG_VIDEO}
        muted
        playsInline
        loop
        autoPlay
        preload="metadata"
      />
      <div
        className="absolute inset-0"
        style={{ backgroundColor: VIDEO_DIM }}
      />
    </div>
  );
}

const STEPS = [
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
    <section
      id="pipeline"
      className="relative px-6 sm:px-10 py-32 sm:py-44 border-t border-ink-line"
    >
      <div className="max-w-[1380px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.6 }}
        >
          <SectionLabel number="002" name="pipeline" />
        </motion.div>

        {/* Full-bleed strip: video + same dim as flower bg behind the
            “from pixels → insight” headline and intro copy. */}
        <div className="relative left-1/2 mt-12 w-screen max-w-none -translate-x-1/2 overflow-hidden">
          <VideoDimBackdrop />
          <div className="relative z-10 mx-auto max-w-[1380px] px-6 py-14 sm:px-10 sm:py-20">
            <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <motion.h2
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10%" }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                  className="h-display text-[clamp(2.4rem,5vw,4.6rem)] text-paper drop-shadow-[0_2px_24px_rgba(0,0,0,0.35)]"
                >
                  <span className="block">from pixels</span>
                  <span className="block">
                    to <span style={{ fontStyle: "italic" }}>insight</span>
                    <span className="text-red-pencil">.</span>
                  </span>
                </motion.h2>
              </div>
              <div className="lg:col-span-5 lg:pt-4">
                <motion.p
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true, margin: "-10%" }}
                  transition={{ duration: 0.7, delay: 0.1 }}
                  className="text-paper/90 text-[15px] leading-[1.7] font-mono drop-shadow-[0_1px_12px_rgba(0,0,0,0.35)]"
                >
                  Every eight seconds your screen becomes a JSON document.
                  Three specialised agents read it in series — each one
                  cheaper, faster, and more skeptical than the last.
                </motion.p>
              </div>
            </div>
          </div>
        </div>

        {/* the four-step diagram */}
        <div className="mt-24 relative">
          {/* connecting line behind the steps */}
          <div
            aria-hidden
            className="hidden md:block absolute top-[68px] left-0 right-0 h-px bg-ink-line"
          />

          <div className="grid grid-cols-1 md:grid-cols-4 gap-px md:gap-8 lg:gap-12">
            {STEPS.map((step, i) => {
              const isCapture = step.name === "capture";
              return (
                <motion.div
                  key={step.n}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10%" }}
                  transition={{
                    duration: 0.7,
                    delay: i * 0.15,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className={`relative pt-8 ${
                    isCapture
                      ? "overflow-hidden rounded-sm md:min-h-[420px]"
                      : ""
                  }`}
                >
                  {isCapture && <VideoDimBackdrop />}

                  {/* number marker on the connecting line */}
                  <div className="absolute top-0 left-0 z-10 flex items-center gap-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        step.color === "red-pencil"
                          ? "bg-red-pencil"
                          : step.color === "brass"
                            ? "bg-brass"
                            : step.color === "moss"
                              ? "bg-moss"
                              : "bg-paper-dim"
                      }`}
                    />
                    <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-mute tabular-nums">
                      {step.n}
                    </span>
                  </div>

                  <div
                    className={`relative z-10 pt-12 ${
                      isCapture ? "px-1 sm:px-2 pb-4" : ""
                    }`}
                  >
                    <h3
                      className={`text-[2.6rem] leading-[0.95] mb-1 ${
                        isCapture
                          ? "text-paper drop-shadow-[0_2px_16px_rgba(0,0,0,0.4)]"
                          : "text-paper"
                      }`}
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {step.name}
                    </h3>
                    <div
                      className={`meta-label mb-6 ${
                        isCapture ? "text-paper/80" : ""
                      }`}
                    >
                      {step.sub}
                    </div>
                    <p
                      className={`text-[13px] leading-[1.65] font-mono mb-8 ${
                        isCapture
                          ? "text-paper/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]"
                          : "text-paper-dim"
                      }`}
                    >
                      {step.body}
                    </p>
                    <div
                      className={`font-mono text-[10px] tracking-[0.12em] uppercase pt-4 border-t flex items-center gap-2 ${
                        isCapture
                          ? "border-white/20 text-paper/80"
                          : "border-ink-line text-paper-mute"
                      }`}
                    >
                      <span className="text-red-pencil">→</span>
                      <span className="truncate">{step.out}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* aside: why this works */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.7 }}
          className="mt-32 grid grid-cols-1 md:grid-cols-12 gap-8 border-t border-ink-line pt-12"
        >
          <div className="md:col-span-4">
            <span className="meta-label">cost model</span>
            <h4
              className="text-paper text-[1.6rem] mt-3"
              style={{ fontFamily: "var(--font-display)" }}
            >
              two cents per cycle, mostly skipped.
            </h4>
          </div>
          <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              ["~ 95%", "of frames skipped", "(no diff, no work)"],
              ["~ 4%", "reach the OCR agent", "(diff but trivial)"],
              ["~ 1%", "reach intervene", "(and most stay silent)"],
            ].map(([n, top, bot]) => (
              <div key={top} className="border-l border-ink-line pl-5">
                <div
                  className="text-paper text-[1.8rem] leading-none mb-1 tabular-nums"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {n}
                </div>
                <div className="meta-label text-paper-dim">{top}</div>
                <div className="font-mono text-[11px] text-paper-mute mt-1">
                  {bot}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
