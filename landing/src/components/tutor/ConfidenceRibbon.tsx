import { motion } from "motion/react";

/**
 * Vertical 12-px ribbon down the left edge of the tutor workspace. Color
 * tracks the policy verdict — moss = on track, graphite = waiting, sienna
 * variants = struggling. The transition is slow on purpose (700ms) so the
 * student peripherally notices a tone shift, not a flash.
 */

export type ConfidenceLevel = "moss" | "graphite" | "sienna_soft" | "sienna";

const TONES: Record<ConfidenceLevel, string> = {
  moss: "var(--color-moss)",
  graphite: "var(--color-paper-faint)",
  sienna_soft: "var(--color-rust)",
  sienna: "var(--color-red-pencil)",
};

const REASON_HINT: Record<ConfidenceLevel, string> = {
  moss: "on track",
  graphite: "watching",
  sienna_soft: "wobble",
  sienna: "stop",
};

export function ConfidenceRibbon({
  level,
  reason,
  className,
}: {
  level: ConfidenceLevel;
  reason?: string;
  className?: string;
}) {
  const tone = TONES[level];
  return (
    <div
      className={[
        "relative flex items-stretch",
        className ?? "",
      ].join(" ")}
      aria-label={`tutor confidence: ${REASON_HINT[level]}`}
      title={reason ?? REASON_HINT[level]}
    >
      <motion.div
        animate={{ backgroundColor: tone }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="w-[12px] min-h-full"
      />
      <span
        className="absolute left-[18px] top-2 font-mono text-[9px] tracking-[0.22em] uppercase text-paper-mute select-none"
      >
        {REASON_HINT[level]}
      </span>
    </div>
  );
}
