import { motion } from "motion/react";
import type { ReactNode } from "react";

interface MarginNoteProps {
  children: ReactNode;
  /** Optional: small caption above the handwritten note (e.g. "stall · 92s") */
  meta?: string;
  /** delay in seconds for the staggered fade-in */
  delay?: number;
  /** show the leading arrow pointing left into the page */
  arrow?: boolean;
  className?: string;
}

/**
 * A handwritten margin annotation, rendered in red Caveat as if a tutor
 * left a note beside the student's work. Fades in with a slight upward
 * lift on scroll-into-view to feel like it was just written.
 */
export function MarginNote({
  children,
  meta,
  delay = 0,
  arrow = true,
  className = "",
}: MarginNoteProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8, y: 4 }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`flex items-start gap-2 ${className}`}
    >
      {arrow ? (
        <span className="text-red-pencil text-base leading-none mt-1.5 select-none">
          ◀
        </span>
      ) : null}
      <div>
        {meta ? (
          <div className="font-mono text-[9px] tracking-[0.22em] uppercase text-paper-faint mb-0.5">
            {meta}
          </div>
        ) : null}
        <div
          className="hand text-[1.55rem] sm:text-[1.7rem]"
          style={{ transform: "rotate(-1.2deg)" }}
        >
          {children}
        </div>
      </div>
    </motion.div>
  );
}
