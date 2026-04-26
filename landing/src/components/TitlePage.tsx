import { motion } from "motion/react";
import { TextCarousel } from "./TextCarousel";

const CAROUSEL_ITEMS = [
  "the tutor in the margin.",
  "the silent observer.",
  "the patient companion.",
  "the watcher of stalls.",
  "the page-respecter.",
];

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

      {/* THE TITLE — IONE */}
      <motion.h1
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
        className="h-display"
        style={{
          fontSize: "clamp(7rem, 22vw, 22rem)",
          letterSpacing: "-0.04em",
          lineHeight: 0.9,
          color: "#990257",
          fontStyle: "italic",
          // Layered shadow: tight contact, mid carry, wide diffuse halo
          // so the magenta wordmark detaches from the cream paper with
          // real depth instead of just sitting on it.
          textShadow:
            "0 1px 0 rgba(0,0,0,0.18)," +
            " 0 6px 18px rgba(0,0,0,0.22)," +
            " 0 18px 48px rgba(0,0,0,0.20)",
        }}
      >
        {/* "i" rendered as ∫ — math integral with a tittle floating
            directly above it, so the glyph still reads as a lowercase
            "i" with the integral as its stem. */}
        <span
          aria-hidden
          style={{
            position: "relative",
            display: "inline-block",
            // Smaller integral so it reads more like a slim "i" stem
            // alongside the regular-weight letters.
            fontSize: "0.72em",
            // Pull tighter to the rest of the wordmark — the integral
            // has a generous left side-bearing in italic display fonts.
            marginRight: "-0.04em",
            // Drop it slightly so the smaller glyph still rests on the
            // baseline of the adjacent lowercase letters.
            transform: "translateY(0.18em)",
          }}
        >
          ∫
          {/* The "i" tittle — smaller and seated lower so it reads as a
              proper lowercase i dot perched just above the integral. */}
          <span
            style={{
              position: "absolute",
              // Lower than before — closer to the top of the integral.
              top: "-0.04em",
              // Centered over the visual middle of the integral's stem.
              left: "0.18em",
              width: "0.16em",
              height: "0.16em",
              borderRadius: "9999px",
              backgroundColor: "currentColor",
              // Match the wordmark's layered shadow so the dot reads as
              // part of the same glyph, not a floating decal.
              boxShadow:
                "0 1px 0 rgba(0,0,0,0.18)," +
                " 0 6px 18px rgba(0,0,0,0.22)",
            }}
          />
        </span>
        <span aria-hidden>one</span>
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
          ione
        </span>
        <span style={{ color: "#c4302b", fontStyle: "normal" }}>.</span>
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
