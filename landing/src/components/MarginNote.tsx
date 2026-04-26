import { motion, useScroll } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

interface MarginNoteProps {
  children: ReactNode;
  meta?: string;
  /** Stagger index (0, 1, 2). Each note waits longer than the previous. */
  index?: number;
  arrow?: boolean;
  tilt?: number;
  className?: string;
}

/**
 * Handwritten margin annotation that only begins animating after the user
 * has scrolled at least 60 px — so it never fires on initial page load.
 * Each note fades + draws in very slowly, editorial-pace.
 */
export function MarginNote({
  children,
  meta,
  index = 0,
  arrow = true,
  tilt = -1.5,
  className = "",
}: MarginNoteProps) {
  const { scrollY } = useScroll();
  const [triggered, setTriggered] = useState(false);

  // Fire once the user has scrolled > 60 px
  useEffect(() => {
    return scrollY.on("change", (y) => {
      if (y > 60) setTriggered(true);
    });
  }, [scrollY]);

  // Large stagger so each note arrives well after the previous one
  const stagger = index * 1.4;

  const baseTransition = {
    ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={triggered ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
      transition={{ ...baseTransition, duration: 2.2, delay: stagger }}
      whileHover={{ scale: 1.03, transition: { duration: 0.2 } }}
      className={`flex items-start gap-0 cursor-default select-none ${className}`}
    >
      {/* ── Connecting line + arrow ─────────────────────────── */}
      {arrow && (
        <div className="flex items-center shrink-0 mt-[1.0rem] mr-1.5">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={triggered ? { scaleX: 1 } : { scaleX: 0 }}
            transition={{
              ...baseTransition,
              duration: 1.2,
              delay: stagger + 0.9,
            }}
            style={{
              width: "36px",
              height: "1px",
              background:
                "linear-gradient(to right, rgba(212,43,43,0.1), rgba(212,43,43,0.45))",
              transformOrigin: "left center",
            }}
          />
          <motion.span
            initial={{ opacity: 0 }}
            animate={triggered ? { opacity: 0.7 } : { opacity: 0 }}
            transition={{ duration: 1.0, delay: stagger + 1.8 }}
            style={{
              color: "#d42b2b",
              fontSize: "0.62rem",
              lineHeight: 1,
              marginLeft: "1px",
            }}
          >
            ◀
          </motion.span>
        </div>
      )}

      {/* ── Annotation body ──────────────────────────────────── */}
      <div className="relative">
        {meta && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={triggered ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 1.4, delay: stagger + 1.0 }}
            className="font-mono tracking-[0.2em] uppercase mb-0.5"
            style={{ fontSize: "0.52rem", color: "rgba(212,43,43,0.4)" }}
          >
            {meta}
          </motion.div>
        )}

        {/* ink draw — left to right, very slow */}
        <motion.div
          initial={{ clipPath: "inset(0 100% 0 0)" }}
          animate={
            triggered
              ? { clipPath: "inset(0 0% 0 0)" }
              : { clipPath: "inset(0 100% 0 0)" }
          }
          transition={{
            ...baseTransition,
            duration: 1.6,
            delay: stagger + 1.0,
          }}
          className="hand"
          style={{
            fontSize: "clamp(1.5rem, 2.2vw, 1.85rem)",
            lineHeight: 1.15,
            color: "#d42b2b",
            transform: `rotate(${tilt}deg)`,
            textShadow: "0 1px 6px rgba(0,0,0,0.28)",
            fontWeight: 600,
          }}
        >
          {children}
        </motion.div>
      </div>
    </motion.div>
  );
}
