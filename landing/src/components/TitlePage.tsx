import { motion } from "motion/react";
import { TextCarousel } from "./TextCarousel";

const CAROUSEL_ITEMS = [
  "the tutor in the margin.",
  "the silent observer.",
  "the patient companion.",
  "the watcher of stalls.",
  "the page-respecter.",
];

// ─── Handwriting choreography for the wordmark ────────────────────────
// Each letter reveals via a clip-path inset.  Numbers below are tuned
// so the cadence feels like a hand writing — quick downstrokes, brief
// settle between letters, and the i-tittle popping in after the
// integral stroke (the way a hand lifts to dot the i).
const STROKE_START = 0.3; // seconds before the first stroke begins
const STROKE_DUR = 0.42; // duration of a single letter stroke
const STROKE_GAP = 0.12; // brief pause between letters (pen lifts)

// Convenience: when does each letter start / end?
function strokeAt(index: number) {
  const start = STROKE_START + index * (STROKE_DUR + STROKE_GAP);
  return { start, end: start + STROKE_DUR };
}

// Hand-like ease — a touch of acceleration at the start, settles at end.
const HAND_EASE = [0.65, 0, 0.35, 1] as const;

function HandwrittenWordmark() {
  // Stroke order: ∫ stem, then o, n, e, then the period.
  const integral = strokeAt(0);
  const o = strokeAt(1);
  const n = strokeAt(2);
  const e = strokeAt(3);
  const period = strokeAt(4);
  // The i-tittle pops in just after the integral stroke completes.
  const tittleAt = integral.end + 0.06;
  // The whole writing window — used to time the moving pen tip.
  const lastStrokeEnd = period.end;

  // Each letter reveals with opacity + a tiny lift — no clip-path,
  // since clipping italic glyphs slices off their side bearings and
  // tops/bottoms.  Cadence still feels like a hand writing because the
  // letters arrive in sequence, paced by STROKE_DUR / STROKE_GAP.
  const letterMotionProps = (start: number) => ({
    initial: { opacity: 0, y: "0.06em" },
    animate: { opacity: 1, y: "0em" },
    transition: { delay: start, duration: STROKE_DUR, ease: HAND_EASE },
    style: {
      display: "inline-block",
      position: "relative" as const,
    },
  });

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      {/* "i" — integral as the stem, with a tittle that pops in after. */}
      <motion.span {...letterMotionProps(integral.start)}>
        <span
          aria-hidden
          style={{
            position: "relative",
            display: "inline-block",
            fontSize: "0.88em",
            marginRight: "-0.04em",
            transform: "translateY(0.08em)",
          }}
        >
          ∫
        </span>
      </motion.span>

      {/* i-tittle — pops in (scale + opacity) after the integral stroke,
          like a hand lifting to dot the i. */}
      <motion.span
        aria-hidden
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          delay: tittleAt,
          duration: 0.22,
          // Slight overshoot for a written-by-hand bounce.
          ease: [0.34, 1.56, 0.64, 1],
        }}
        style={{
          position: "absolute",
          // Match the i-tittle position from the static layout.  The
          // 0.88em fontSize on the integral wrapper means these em
          // values resolve in the title's outer font-size since this
          // span lives outside that inner wrapper — adjust if needed.
          top: "-0.10em",
          left: "0.18em",
          width: "0.13em",
          height: "0.13em",
          borderRadius: "9999px",
          backgroundColor: "currentColor",
          transformOrigin: "50% 50%",
        }}
      />

      {/* o */}
      <motion.span {...letterMotionProps(o.start)}>
        <span aria-hidden>o</span>
      </motion.span>

      {/* n */}
      <motion.span {...letterMotionProps(n.start)}>
        <span aria-hidden>n</span>
      </motion.span>

      {/* e */}
      <motion.span {...letterMotionProps(e.start)}>
        <span aria-hidden>e</span>
      </motion.span>

      {/* . — accent red, drawn last */}
      <motion.span
        {...letterMotionProps(period.start)}
        style={{
          ...letterMotionProps(period.start).style,
          color: "#c4302b",
          fontStyle: "normal",
        }}
      >
        .
      </motion.span>

      {/* Yellow "pen-tip" glow — moves left → right across the writing
          window, fades in at the start and out as the last stroke
          finishes.  Reads as the highlighter actually drawing the
          letters. */}
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          top: "-6%",
          bottom: "-14%",
          width: "0.05em",
          backgroundColor: "#FFD84A",
          boxShadow:
            "0 0 24px 8px rgba(255, 216, 74, 0.55)," +
            " 0 0 60px 16px rgba(255, 200, 30, 0.30)",
          borderRadius: "999px",
          pointerEvents: "none",
          filter: "blur(0.4px)",
        }}
        initial={{ left: "0%", opacity: 0 }}
        animate={{
          left: ["0%", "0%", "100%", "100%"],
          opacity: [0, 1, 1, 0],
        }}
        transition={{
          delay: integral.start,
          duration: lastStrokeEnd - integral.start,
          times: [0, 0.05, 0.92, 1],
          ease: HAND_EASE,
        }}
      />
    </span>
  );
}

export function TitlePage() {
  return (
    <section
      className="relative min-h-screen flex flex-col items-center justify-center px-6 sm:px-10 text-center"
      style={{ minHeight: "100vh" }}
    >
      {/* tiny meta line — same eyebrow style as the hero */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.6 }}
        className="font-mono text-[10px] tracking-[0.32em] uppercase mb-10 flex items-center gap-3"
        style={{ color: "rgba(0,0,0,0.55)" }}
      >
        <span
          className="inline-block h-px w-10"
          style={{ background: "rgba(0,0,0,0.25)" }}
        />
        <span>an AI math tutor · est. 2026</span>
        <span
          className="inline-block h-px w-10"
          style={{ background: "rgba(0,0,0,0.25)" }}
        />
      </motion.div>

      {/* THE TITLE — IONE
          Per-letter handwriting reveal: each glyph is its own clip-path
          inset that animates in sequence with a hand-like ease, so it
          reads as the title being *written* rather than swept onto the
          page.  The i-tittle pops in AFTER the integral's stroke
          finishes — the way a hand lifts to dot the i. */}
      <motion.h1
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.25 }}
        className="h-display"
        style={{
          fontSize: "clamp(7rem, 22vw, 22rem)",
          letterSpacing: "-0.04em",
          lineHeight: 0.9,
          color: "#FFFFFF",
          fontStyle: "italic",
          textShadow:
            "0 1px 0 rgba(0,0,0,0.22)," +
            " 0 6px 18px rgba(0,0,0,0.28)," +
            " 0 18px 48px rgba(0,0,0,0.22)",
          position: "relative",
          display: "inline-block",
          overflow: "visible",
        }}
      >
        <HandwrittenWordmark />

        {/* Accessible text for screen readers / SEO. */}
        <span
          style={{
            position: "absolute",
            width: "1px",
            height: "1px",
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            clipPath: "inset(50%)",
            whiteSpace: "nowrap",
          }}
        >
          ione.
        </span>
      </motion.h1>

      {/* SEMI-HEADER TAGLINE — cycling carousel in electric lime. */}
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.9 }}
        className="h-editorial mt-6 sm:mt-8"
        style={{
          fontSize: "clamp(1.4rem, 3.4vw, 2.6rem)",
          fontStyle: "italic",
          letterSpacing: "-0.01em",
          maxWidth: "26ch",
        }}
      >
        <TextCarousel
          items={CAROUSEL_ITEMS}
          interval={2600}
          style={{
            // Original tagline color — the lime moved up to the wordmark,
            // so the carousel returns to its supporting role.
            color: "rgba(0,0,0,0.78)",
          }}
        />
      </motion.h2>

      {/* the actual tagline */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.85, duration: 0.7 }}
        className="mt-10 sm:mt-12 font-mono"
        style={{
          fontSize: "13px",
          letterSpacing: "0.02em",
          lineHeight: 1.7,
          color: "rgba(0,0,0,0.6)",
          maxWidth: "52ch",
        }}
      >
        watches you do math, intervenes only when intervention helps, and
        remembers what you specifically struggle with — across every session.
      </motion.p>

      {/* scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.6 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.28em] uppercase flex flex-col items-center gap-2"
        style={{ color: "rgba(0,0,0,0.5)" }}
      >
        <span>scroll</span>
        <span
          className="inline-block w-px h-8"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0))",
          }}
        />
      </motion.div>
    </section>
  );
}
