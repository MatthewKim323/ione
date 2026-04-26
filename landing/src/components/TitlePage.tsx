import { motion } from "motion/react";
import { TextCarousel } from "./TextCarousel";

const CAROUSEL_ITEMS = [
  "the tutor in the margin.",
  "the silent observer.",
  "the patient companion.",
  "the watcher of stalls.",
  "the page-respecter.",
];

// ─── Handwriting wordmark — vector-traced ─────────────────────────────
// Each glyph is a real SVG <path> whose stroke is drawn by animating
// pathLength 0 → 1, so the pen visibly *traces* the letter's outline
// instead of swiping over it.  Once the stroke completes, the path's
// fill fades in to give the glyph its body.
//
// Stroke order: ∫ stem → o loop → n arch → e curl → "." period.
// The i-tittle pops in after the ∫ stroke, the way a hand lifts to
// dot the i.

const STROKE_START = 0.3;
const STROKE_DUR = 0.55;
const STROKE_GAP = 0.10;
const HAND_EASE = [0.65, 0, 0.35, 1] as const;

function strokeAt(index: number) {
  const start = STROKE_START + index * (STROKE_DUR + STROKE_GAP);
  return { start, end: start + STROKE_DUR };
}

// Stylized italic "∫one." paths. Coordinates inside a 360 × 120 viewBox,
// hand-tuned so the strokes read as cursive italic letters.  Not a
// pixel-perfect tracing of the display font — the goal is the writing
// motion, not glyph identity.
const STROKES: Array<{ d: string; color: string }> = [
  // ∫ — top hook → slanted stem → bottom tail.  One continuous curve.
  {
    d: "M 58,8 C 42,16 36,40 46,72 C 54,98 42,108 22,112",
    color: "#FFFFFF",
  },
  // o — italic oval, drawn clockwise from the top-right.
  {
    d: "M 124,52 C 86,52 84,108 116,108 C 150,108 152,52 124,52 Z",
    color: "#FFFFFF",
  },
  // n — down-stem, then arch up and over to a second down-stem.
  {
    d: "M 174,52 L 168,108 M 174,64 C 188,52 220,52 226,72 L 222,108",
    color: "#FFFFFF",
  },
  // e — horizontal cross-bar, then curl underneath.
  {
    d: "M 254,82 L 296,80 C 296,58 256,56 250,84 C 246,108 286,114 300,96",
    color: "#FFFFFF",
  },
  // . — small filled disk in the brand red.
  {
    d: "M 322,104 a 4 4 0 1 0 0.01 0 Z",
    color: "#c4302b",
  },
];

function HandwrittenWordmark() {
  const integral = strokeAt(0);
  const o = strokeAt(1);
  const n = strokeAt(2);
  const e = strokeAt(3);
  const period = strokeAt(4);
  const allStrokes = [integral, o, n, e, period];
  const tittleAt = integral.end + 0.04;

  return (
    <svg
      // viewBox extends above y=0 so the i-tittle (sits above the ∫'s
      // top hook) is inside the box and never clipped by an ancestor.
      viewBox="0 -16 360 140"
      preserveAspectRatio="xMidYMid meet"
      style={{
        // Tuned so the wordmark reads at roughly the same visual size
        // as the old static title.  Width is auto so the SVG keeps its
        // natural aspect ratio (≈2.57 : 1).
        height: "0.95em",
        width: "auto",
        display: "block",
        // SVG stroke + fill gets the same layered shadow the static
        // title used to have, via chained drop-shadow filters.
        filter:
          "drop-shadow(0 1px 0 rgba(0,0,0,0.22))" +
          " drop-shadow(0 6px 18px rgba(0,0,0,0.28))" +
          " drop-shadow(0 18px 48px rgba(0,0,0,0.22))",
        overflow: "visible",
      }}
    >
      {STROKES.map((s, i) => {
        const { start } = allStrokes[i];
        return (
          <motion.path
            key={i}
            d={s.d}
            stroke={s.color}
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={s.color}
            initial={{ pathLength: 0, fillOpacity: 0 }}
            animate={{ pathLength: 1, fillOpacity: 1 }}
            transition={{
              pathLength: {
                delay: start,
                duration: STROKE_DUR,
                ease: HAND_EASE,
              },
              fillOpacity: {
                // Body fades in as the stroke is finishing.
                delay: start + STROKE_DUR * 0.78,
                duration: 0.32,
              },
            }}
          />
        );
      })}

      {/* i-tittle — round disk popping in after the integral stroke.
          Sits ABOVE the integral's top hook (which starts at y≈8) so
          the glyph reads as a dotted i. */}
      <motion.circle
        cx={44}
        cy={-6}
        r={4}
        fill="#FFFFFF"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          delay: tittleAt,
          duration: 0.22,
          ease: [0.34, 1.56, 0.64, 1], // slight overshoot
        }}
        style={{ transformOrigin: "44px -6px" }}
      />
    </svg>
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
          The wordmark is rendered as inline SVG paths that animate
          their pathLength 0 → 1 in sequence, so each letter is *traced*
          like a vector being drawn rather than swept onto the page.
          Once each stroke completes the path's fill fades in.  The
          i-tittle pops in after the integral's stroke — the way a hand
          lifts to dot the i.  The h1 is kept for semantics + sets the
          font-size that the SVG sizes itself off of via em units. */}
      <motion.h1
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.25 }}
        className="h-display"
        style={{
          fontSize: "clamp(7rem, 22vw, 22rem)",
          lineHeight: 0.9,
          color: "#FFFFFF",
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
