import { motion } from "motion/react";
import { MarginNote } from "./MarginNote";
import { EnterCTA } from "./EnterCTA";

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
  return (
    <section
      data-hero
      className="relative min-h-screen flex items-center px-6 sm:px-10 pt-32 pb-24"
    >
      <div className="relative w-full max-w-[1380px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-16 items-center">
        {/* ── Left: headline + CTAs ─────────────────────────────────── */}
        <div className="lg:col-span-7 relative">
          {/* tiny upper-left meta */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="font-sub text-[10px] tracking-[0.22em] uppercase text-ink/55 mb-12 flex items-center gap-3"
          >
            <span className="inline-block h-px w-8 bg-ink/25" />
            <span>an AI math tutor · est. 2026</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="h-display text-[clamp(3.2rem,8.4vw,8.6rem)]"
            style={{
              color: "#FFFFFF",
              textShadow:
                "0 1px 0 rgba(0,0,0,0.22)," +
                " 0 6px 18px rgba(0,0,0,0.28)," +
                " 0 18px 48px rgba(0,0,0,0.22)",
            }}
          >
            <span className="block">the tutor in</span>
            <span className="block">
              the{" "}
              <span className="text-white/95" style={{ fontStyle: "italic" }}>
                margin
              </span>
            </span>
            <span className="block">
              of your page<span className="text-red-pencil">.</span>
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.7 }}
            className="mt-10 max-w-[42ch] text-ink/80 text-[15px] leading-[1.7] font-sub"
          >
            ione watches you do math on your iPad and intervenes only
            when intervention will help. it is mostly silent. when it speaks,
            it asks the question that gets you unstuck — never the answer.
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.85, duration: 0.6 }}
            className="mt-12 flex flex-wrap items-center gap-5"
          >
            <EnterCTA className="hero-primary-cta" />
            <a
              href="#pipeline"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "120px",
                height: "120px",
                borderRadius: "50%",
                background: "rgba(37, 99, 235, 0.18)",
                border: "1px solid rgba(37, 99, 235, 0.5)",
                color: "#000",
                fontFamily: "var(--font-sub)",
                fontSize: "0.6rem",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                textAlign: "center",
                lineHeight: 1.4,
                padding: "0 16px",
                textDecoration: "none",
                transition: "background 0.3s ease",
                backdropFilter: "blur(4px)",
              }}
            >
              see how<br />it works
            </a>
          </motion.div>

          {/* tagline strip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.05, duration: 0.6 }}
            className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-y-3 gap-x-8 max-w-2xl border-t border-ink-line pt-6"
          >
            {[
              ["silent observation", "watches, doesn't narrate"],
              ["scaffolded hints", "questions, not answers"],
              ["longitudinal memory", "remembers your stalls"],
            ].map(([title, sub], i) => (
              <div key={title} className="flex flex-col gap-1">
                <span className="meta-label text-ink">
                  <span className="text-red-pencil mr-2">{`0${i + 1}`}</span>
                  {title}
                </span>
                <span className="text-[11px] font-sub text-ink/55">
                  {sub}
                </span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* ── Right: notebook page render ──────────────────────────── */}
        <div className="lg:col-span-5 relative">
          <NotebookPage />
        </div>

        {/* bottom-corner scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.6 }}
          className="hidden md:flex absolute bottom-[-6rem] left-0 right-0 items-center justify-between px-2 font-sub text-[10px] tracking-[0.22em] uppercase text-ink/50"
        >
          <span className="flex items-center gap-3">
            <span>scroll</span>
            <span className="inline-block h-px w-8 bg-ink/25" />
          </span>
          <span className="tabular-nums text-ink/60">
            01 <span className="text-ink/35">/ 04</span>
          </span>
        </motion.div>
      </div>
    </section>
  );
}

function NotebookPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, rotate: -0.4 }}
      animate={{ opacity: 1, y: 0, rotate: -0.6 }}
      transition={{ delay: 0.4, duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto max-w-[480px]"
    >
      {/* the page itself */}
      <div className="relative bg-ink-deep border border-ink-line ruled-paper px-7 py-10 pr-16 sm:pr-20 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)]">
        {/* top-left page meta */}
        <div className="flex items-center justify-between mb-8 font-sub text-[9px] tracking-[0.22em] uppercase" style={{ color: "#b89a78" }}>
          <span>calculus i · sec 5.3</span>
          <span>p. 4</span>
        </div>

        {/* the problem + worked solution */}
        <div className="space-y-3">
          {MATH_LINES.map((line) => {
            if (line.kind === "blank") {
              return <div key={line.i} className="h-3" />;
            }
            if (line.kind === "label") {
              return (
                <motion.div
                  key={line.i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 + line.i * 0.06 }}
                  className="text-paper-dim text-[15px]"
                  style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
                >
                  {line.text}
                </motion.div>
              );
            }
            return (
              <motion.div
                key={line.i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + line.i * 0.08, duration: 0.5 }}
                className="font-sub text-[16px] text-paper tracking-tight"
              >
                {line.text}
              </motion.div>
            );
          })}
        </div>

        {/* red margin rule on the right */}
        <div
          aria-hidden
          className="absolute top-0 bottom-0 right-12 w-px bg-red-pencil/60"
        />
      </div>

      {/* margin annotations — editorial notes in the right margin */}
      <div className="absolute -right-3 sm:-right-8 md:-right-16 top-10 flex flex-col gap-10 w-[185px]">
        <MarginNote meta="t = 0s" index={0} tilt={-1.2}>
          silent.
        </MarginNote>
        <MarginNote meta="t = 92s · stall" index={1} tilt={-2.1}>
          check the sign
          <br />
          on line three.
        </MarginNote>
        <MarginNote meta="t = 148s · solved" index={2} tilt={-0.8}>
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
