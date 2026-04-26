import { motion } from "motion/react";
import type { ReactNode } from "react";

interface MarginNoteProps {
  children: ReactNode;
  /** Optional: small caption above the handwritten note (e.g. "stall · 92s") */
  meta?: string;
  /** delay in seconds for the staggered fade-in */
  delay?: number;
  /** show the leading arrow + connecting line pointing left into the page */
  arrow?: boolean;
  /** tilt in degrees, alternated for personality */
  tilt?: number;
  className?: string;
}

/**
 * A handwritten margin annotation — rendered in vivid red Caveat as if a
 * live tutor just scrawled it beside the student's work.
 *
 * Entrance: slides in from the right with an ink-draw connector line.
 * At rest: pulses softly to signal it's alive.
 * On hover: lifts and brightens.
 */
export function MarginNote({
  children,
  meta,
  delay = 0,
  arrow = true,
  tilt = -1.5,
  className = "",
}: MarginNoteProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 28 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-8%" }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{
        scale: 1.04,
        transition: { duration: 0.18, ease: "easeOut" },
      }}
      className={`flex items-start gap-0 group cursor-default select-none ${className}`}
    >
      {/* ── Connecting line + arrow ─────────────────────────────── */}
      {arrow && (
        <div className="flex items-center shrink-0 mt-[1.05rem] mr-1.5">
          {/* the horizontal ink line, draws in from the page side */}
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{
              duration: 0.38,
              delay: delay + 0.32,
              ease: [0.4, 0, 0.2, 1],
            }}
            style={{
              width: "36px",
              height: "1px",
              background:
                "linear-gradient(to right, rgba(232,41,42,0.3), rgba(232,41,42,0.85))",
              transformOrigin: "left center",
            }}
          />
          {/* pulsing arrowhead */}
          <motion.span
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{
              duration: 2.8,
              repeat: Infinity,
              ease: "easeInOut",
              delay: delay + 1.1,
            }}
            style={{
              color: "#e8292a",
              fontSize: "0.7rem",
              lineHeight: 1,
              marginLeft: "1px",
              filter: "drop-shadow(0 0 4px rgba(232,41,42,0.6))",
            }}
          >
            ◀
          </motion.span>
        </div>
      )}

      {/* ── Annotation body ────────────────────────────────────── */}
      <div
        className="relative rounded px-2.5 py-1.5 transition-all duration-200"
        style={{
          background: "rgba(8, 5, 3, 0.45)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          boxShadow:
            "0 4px 18px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(232,41,42,0.18), inset 0 0 0 0.5px rgba(255,255,255,0.03)",
        }}
      >
        {/* meta timestamp label */}
        {meta && (
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: delay + 0.5 }}
            className="font-mono tracking-[0.2em] uppercase mb-1"
            style={{ fontSize: "0.55rem", color: "rgba(232,41,42,0.55)" }}
          >
            {meta}
          </motion.div>
        )}

        {/* the handwritten annotation text — drawn on via clip-path */}
        <motion.div
          initial={{ clipPath: "inset(0 100% 0 0)" }}
          whileInView={{ clipPath: "inset(0 0% 0 0)" }}
          viewport={{ once: true }}
          transition={{
            duration: 0.55,
            delay: delay + 0.42,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="hand"
          style={{
            fontSize: "clamp(1.65rem, 2.4vw, 2.05rem)",
            lineHeight: 1.12,
            color: "#e8292a",
            transform: `rotate(${tilt}deg)`,
            textShadow:
              "0 0 14px rgba(232,41,42,0.45), 0 0 4px rgba(232,41,42,0.25), 0 1px 4px rgba(0,0,0,0.6)",
            fontWeight: 600,
          }}
        >
          {children}
        </motion.div>

        {/* subtle red glow that pulses at rest — "alive" signal */}
        <motion.div
          aria-hidden
          animate={{ opacity: [0.08, 0.18, 0.08] }}
          transition={{
            duration: 3.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: delay + 1.5,
          }}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            background:
              "radial-gradient(ellipse at 30% 50%, rgba(232,41,42,0.4) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
      </div>
    </motion.div>
  );
}
