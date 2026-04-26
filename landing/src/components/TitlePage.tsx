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

      {/* THE TITLE — IONE
          Sketched-on entrance: the glyph reveals left → right via a
          clip-path inset animation, with a yellow "pen-tip" glow that
          tracks the writing edge and fades out at the end. */}
      <motion.h1
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="h-display"
        style={{
          fontSize: "clamp(7rem, 22vw, 22rem)",
          letterSpacing: "-0.04em",
          lineHeight: 0.9,
          color: "#FFFFFF",
          fontStyle: "italic",
          // Layered shadow keeps white legible on cream paper.
          textShadow:
            "0 1px 0 rgba(0,0,0,0.22)," +
            " 0 6px 18px rgba(0,0,0,0.28)," +
            " 0 18px 48px rgba(0,0,0,0.22)",
          position: "relative",
          display: "inline-block",
        }}
      >
        <motion.span
          style={{ display: "inline-block", position: "relative" }}
          // Inset clipping reveals the glyph left → right.
          // -10% on the bottom keeps the integral's tail from being
          // clipped by the inset's own bottom edge while animating.
          initial={{ clipPath: "inset(-2% 100% -10% 0)" }}
          animate={{ clipPath: "inset(-2% 0% -10% 0)" }}
          transition={{
            delay: 0.25,
            duration: 1.7,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          {/* "i" rendered as ∫ — slightly smaller than the rest of the
              letters with a tittle directly above so the whole glyph
              reads as a proper lowercase i. */}
          <span
            aria-hidden
            style={{
              position: "relative",
              display: "inline-block",
              // Slightly smaller than the surrounding letters so the
              // ∫ feels like a slim italic i stem, not a tall flourish.
              fontSize: "0.88em",
              marginRight: "-0.04em",
              // Drop it so the smaller glyph's baseline aligns with
              // the adjacent lowercase letters.
              transform: "translateY(0.10em)",
            }}
          >
            ∫
            {/* i-tittle — sized + placed where an italic lowercase i's
                dot naturally sits in a display italic. */}
            <span
              style={{
                position: "absolute",
                top: "0.04em",
                left: "0.40em",
                width: "0.14em",
                height: "0.14em",
                borderRadius: "9999px",
                backgroundColor: "currentColor",
              }}
            />
          </span>
          <span aria-hidden>one</span>
          <span style={{ color: "#c4302b", fontStyle: "normal" }}>.</span>
        </motion.span>

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

        {/* Yellow "pen-tip" glow — tracks the right edge of the
            reveal, then fades out as the title finishes. */}
        <motion.span
          aria-hidden
          style={{
            position: "absolute",
            top: "-2%",
            bottom: "-12%",
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
            delay: 0.25,
            duration: 1.7,
            times: [0, 0.06, 0.92, 1],
            ease: [0.16, 1, 0.3, 1],
          }}
        />
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
