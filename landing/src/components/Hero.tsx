import { flushSync } from "react-dom";
import { useRef, useState } from "react";
import {
  useReducedMotion,
  useScroll,
  motion,
  type Variants,
  type MotionValue,
} from "motion/react";
import { AnimatedNeonUnderlink } from "./AnimatedNeonUnderlink";
import { FlowerCtaShape } from "./FlowerCtaShape";
import { MarginNote } from "./MarginNote";
import { EnterCTA } from "./EnterCTA";
import { TextClipPathReveal, TextClipPathRevealLines } from "./TextClipPathReveal";

/**
 * Flat neon L→R wipe (same as Closer) when the span scrolls into view; dark text on `bg-neon`.
 */
function HeroNeonWipe({
  children,
  delay = 0,
  reduced,
}: {
  children: React.ReactNode;
  delay?: number;
  reduced: boolean;
}) {
  return (
    <span className="relative inline-block">
      <motion.span
        aria-hidden
        className="absolute -inset-x-0.5 -inset-y-0.5 -z-0"
        initial={{ scaleX: reduced ? 1 : 0 }}
        whileInView={{ scaleX: 1 }}
        transition={{
          duration: reduced ? 0 : 0.75,
          delay: reduced ? 0 : delay,
          ease: [0.16, 1, 0.3, 1],
        }}
        viewport={{ once: true, margin: "-8% 0px -5% 0px" }}
        style={{ transformOrigin: "0% 50%" }}
      >
        <span className="block h-full w-full rounded-sm bg-neon" />
      </motion.span>
      <span className="relative z-10 text-ink [text-shadow:none]">{children}</span>
    </span>
  );
}

const MATH_LINES = [
  { i: 0, text: "problem 4.", kind: "label" as const },
  { i: 1, text: "", kind: "blank" as const },
  { i: 2, text: "∫\u2080\u2074 (2x + 3) dx", kind: "math" as const },
  { i: 3, text: "", kind: "blank" as const },
  { i: 4, text: "= [x² + 3x]\u2080\u2074", kind: "math" as const },
  { i: 5, text: "", kind: "blank" as const },
  { i: 6, text: "= (16 + 12) − 0", kind: "math" as const },
  { i: 7, text: "", kind: "blank" as const },
  { i: 8, text: "= 28", kind: "math" as const },
];

export function Hero() {
  const [seeHowSpin, setSeeHowSpin] = useState(0);
  const reduced = useReducedMotion() ?? false;
  const heroRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress: marginScrollYProgress } = useScroll({
    target: heroRef,
    // Longer band → progress eases 0–1 over more page scroll, so each note can fire slower / one at a time
    offset: ["start 0.94", "end 0.06"],
  });

  return (
    <section
      ref={heroRef}
      data-hero
      className="relative min-h-screen flex items-center px-6 sm:px-10 pt-32 pb-24"
    >
      <div className="relative w-full max-w-[1380px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-16 items-center">
        {/* ── Left: headline + CTAs ─────────────────────────────────── */}
        <div className="lg:col-span-7 relative">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.95, ease: [0.16, 1, 0.3, 1] }}
            className="h-display text-[clamp(3.2rem,8.4vw,8.6rem)]"
            style={{
              color: "#FFFFFF",
              textShadow:
                "0 2px 0 rgba(0,0,0,0.32)," +
                " 0 8px 22px rgba(0,0,0,0.4)," +
                " 0 20px 52px rgba(0,0,0,0.32)",
            }}
          >
            <span className="block [text-rendering:optimizeLegibility]">
              the tutor in
            </span>
            <span className="block [text-rendering:optimizeLegibility]">
              the{" "}
              <AnimatedNeonUnderlink
                className="text-white [font-style:italic]"
                viewDelay={0.08}
                gap={4}
              >
                margin
              </AnimatedNeonUnderlink>
            </span>
            <span className="block [text-rendering:optimizeLegibility]">
              of your page<span className="text-neon">.</span>
            </span>
          </motion.h1>

          <div
            className="mt-10 max-w-[48ch] text-[15px] leading-[1.7] font-sub text-white"
            style={{
              textShadow:
                "0 1px 0 rgba(0,0,0,0.2)," +
                " 0 4px 14px rgba(0,0,0,0.28)," +
                " 0 10px 32px rgba(0,0,0,0.22)",
            }}
          >
            <TextClipPathRevealLines
              lineClassName="block"
              lines={[
                <>
                  The one{" "}
                  <HeroNeonWipe reduced={reduced} delay={0.5}>
                    watches you do math on your iPad
                  </HeroNeonWipe>{" "}
                  and <span className="font-bold">intervenes</span> only when
                  intervention will help. it is mostly silent. when it speaks, it
                </>,
                <>
                  asks the question that gets you <span className="font-bold">unstuck</span>{" "}
                  — <HeroNeonWipe reduced={reduced} delay={0.9}>
                    never the answer
                  </HeroNeonWipe>
                  .
                </>,
              ]}
            />
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="mt-12 flex flex-wrap items-center gap-5"
          >
            <EnterCTA className="hero-primary-cta" />
            <a
              href="#pipeline"
              onPointerEnter={() => {
                if (reduced) return;
                flushSync(() => {
                  setSeeHowSpin((k) => k + 1);
                });
              }}
              className="group relative box-border inline-flex aspect-square w-max min-w-[10.25rem] min-h-[10.25rem] max-w-full shrink-0 items-center justify-center rounded-full p-3 no-underline transition-shadow duration-300 sm:min-w-[11.5rem] sm:min-h-[11.5rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon/80 hover:shadow-[0_0_0_2px_rgba(191,227,42,0.65),0_0_28px_rgba(191,227,42,0.4)]"
            >
              <div
                key={seeHowSpin}
                className="see-how-flower-spin pointer-events-none absolute inset-1.5 will-change-transform sm:inset-2"
                style={
                  seeHowSpin === 0 || reduced
                    ? { animation: "none" }
                    : undefined
                }
                aria-hidden
              >
                <FlowerCtaShape
                  variant="heroGreen"
                  className="h-full w-full"
                />
              </div>
              <span
                className="relative z-10 max-w-[11ch] px-0.5 text-center text-[0.72rem] sm:text-[0.76rem] font-bold uppercase leading-[1.2] text-ink transition-colors duration-300 group-hover:text-ink/90"
                style={{
                  fontFamily: "var(--font-sub)",
                  letterSpacing: "0.12em",
                }}
              >
                see how
                <br />
                it works
              </span>
            </a>
          </motion.div>

          {/* tagline strip — horizontal progress bars (Framer-style track + fill) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.05, duration: 0.6 }}
            className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-y-6 sm:gap-y-0 gap-x-8 max-w-2xl border-t border-ink-line pt-6"
          >
            {[
              ["silent observation", "watches, doesn't narrate"],
              ["scaffolded hints", "questions, not answers"],
              ["longitudinal memory", "remembers your stalls"],
            ].map(([title, sub], i) => (
              <div key={title} className="flex min-w-0 flex-col gap-2">
                <TextClipPathRevealLines
                  lineClassName="block"
                  lines={[
                    <div
                      key="t"
                      className="font-sub text-[10px] sm:text-[11px] tracking-[0.2em] uppercase text-ink font-bold"
                    >
                      <span className="text-red-pencil font-bold tabular-nums">
                        {`0${i + 1}`}
                      </span>
                      <span className="ml-2">{title}</span>
                    </div>,
                  ]}
                />
                <div
                  className="h-[2px] w-full overflow-hidden rounded-full"
                  style={{ backgroundColor: "rgba(0,0,0,0.1)" }}
                  aria-hidden
                >
                  <motion.div
                    className="h-full w-full origin-left bg-red-pencil"
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true, amount: 0.6 }}
                    transition={{
                      delay: 0.08 * i,
                      duration: 0.55,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  />
                </div>
                <TextClipPathReveal
                  text={sub}
                  className="text-[11px] font-sub text-ink/55 leading-snug"
                  lineClassName="block"
                />
              </div>
            ))}
          </motion.div>
        </div>

        {/* ── Right: notebook page render ──────────────────────────── */}
        <div className="lg:col-span-5 relative">
          <NotebookPage marginScrollYProgress={marginScrollYProgress} />
        </div>

        {/* bottom-corner scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.6 }}
          className="hidden md:flex absolute bottom-[-6rem] left-0 right-0 items-center justify-start px-2 font-sub text-[10px] tracking-[0.22em] uppercase text-ink/50"
        >
          <span className="flex items-center gap-3">
            <span>scroll</span>
            <span className="inline-block h-px w-8 bg-ink/25" />
          </span>
        </motion.div>
      </div>
    </section>
  );
}

/** Graph cell + paper (one rhythm: text rows snap to 1.5rem lines). */
const NB_CELL = "1.5rem";
const NB_PAPER = "#e0d6c4";

const notebookPageVariants: Variants = {
  hidden: { opacity: 0, y: 56, rotate: -0.2 },
  show: {
    opacity: 1,
    y: 0,
    rotate: -0.6,
    transition: {
      delay: 0.15,
      duration: 0.95,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

function NotebookPage({
  marginScrollYProgress,
}: {
  marginScrollYProgress: MotionValue<number>;
}) {
  const reduced = useReducedMotion() ?? false;

  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.22, margin: "0px 0px -10% 0px" }}
      variants={reduced ? { hidden: { opacity: 0 }, show: { opacity: 1 } } : notebookPageVariants}
      className="relative mx-auto max-w-[540px]"
    >
      <div
        className="relative overflow-hidden border border-ink/20 pr-16 pb-12 pl-6 pt-6 sm:pr-20"
        style={{
          backgroundColor: NB_PAPER,
          backgroundImage: [
            "linear-gradient(rgba(34, 29, 24, 0.12) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(34, 29, 24, 0.12) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: `${NB_CELL} ${NB_CELL}`,
          backgroundPosition: "0 0",
          boxShadow:
            "0 30px 80px -30px rgba(0,0,0,0.28),0 0 0 1px rgba(0,0,0,0.05) inset",
        }}
      >
        {/* one grid row: meta (height = one cell) + one row gap; then work lines each min-h = one cell */}
        <div className="mb-6 flex h-6 items-center justify-between font-sub text-[11px] leading-none tracking-[0.2em] text-bark/80">
          <span>calculus i · sec 5.3</span>
          <span>p. 4</span>
        </div>

        <div className="space-y-6">
          {MATH_LINES.map((line) => {
            if (line.kind === "blank") {
              return <div key={line.i} className="h-6 shrink-0" aria-hidden />;
            }
            if (line.kind === "label") {
              return (
                <div
                  key={line.i}
                  className="flex min-h-6 items-end text-ink/85 text-base leading-6"
                  style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
                >
                  {line.text}
                </div>
              );
            }
            return (
              <div
                key={line.i}
                className="font-sub min-h-6 text-lg leading-6 text-ink tracking-tight"
              >
                {line.text}
              </div>
            );
          })}
        </div>

        {/* red margin rule on the right */}
        <div
          aria-hidden
          className="absolute top-0 bottom-0 right-12 w-px bg-red-pencil/55"
        />
      </div>

      {/* margin annotations — editorial notes in the right margin */}
      <div className="absolute right-0 z-10 sm:-right-0 md:-right-4 -translate-x-4 sm:-translate-x-5 md:-translate-x-7 top-20 sm:top-[5.25rem] flex flex-col gap-12 w-[185px]">
        <MarginNote
          meta="t = 0s"
          index={0}
          scrollYProgress={marginScrollYProgress}
          revealAt={0.1}
          slideInFromRight
          tilt={-1.2}
        >
          silent.
        </MarginNote>
        <MarginNote
          meta="t = 92s · stall"
          index={1}
          scrollYProgress={marginScrollYProgress}
          revealAt={0.38}
          slideInFromRight
          tilt={-2.1}
        >
          check the sign
          <br />
          on line three.
        </MarginNote>
        <MarginNote
          meta="t = 148s · solved"
          index={2}
          scrollYProgress={marginScrollYProgress}
          revealAt={0.64}
          slideInFromRight
          tilt={-0.8}
        >
          nice — that&apos;s
          <br />
          it.
        </MarginNote>
      </div>

      {/* tape strip / corner mark */}
      <div className="absolute -top-3 left-12 w-20 h-5 bg-brass/15 border border-brass/30 rotate-[-3deg]" />
    </motion.div>
  );
}
