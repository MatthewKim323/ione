import { motion, useReducedMotion } from "motion/react";
import { type CSSProperties, type ReactNode } from "react";

/**
 * Port of Framer "Text_Clip_Path_Reveal" — per-line clip-path + slight offset,
 * staggered when the block scrolls into view. See:
 * framer.com/m/Text-Clip-Path-Reveal-LM9j.js
 */
export type RevealDirection = "top" | "bottom" | "left" | "right" | "center";

const EASE: [number, number, number, number] = [0.2, 0.65, 0.3, 0.9];

function getHidden(
  d: RevealDirection,
): Record<string, string | number> {
  switch (d) {
    case "top":
      return { clipPath: "inset(100% 0% 0% 0%)", y: -40 };
    case "bottom":
      return { clipPath: "inset(0% 0% 100% 0%)", y: 40 };
    case "left":
      return { clipPath: "inset(0% 100% 0% 0%)", x: -40 };
    case "right":
      return { clipPath: "inset(0% 0% 0% 100%)", x: 40 };
    case "center":
      return { clipPath: "inset(50% 50% 50% 50%)", scale: 0.8 };
    default:
      return { clipPath: "inset(0% 0% 100% 0%)", y: 40 };
  }
}

const lineVisible: Record<string, string | number> = {
  clipPath: "inset(0% 0% 0% 0%)",
  y: 0,
  x: 0,
  scale: 1,
};

type RevealBase = {
  className?: string;
  /** Applied to each line wrapper. Use `block` for stacked headline lines. */
  lineClassName?: string;
  style?: CSSProperties;
  revealDirection?: RevealDirection;
  /** Seconds between each line (Framer default 0.15) */
  staggerDelay?: number;
  duration?: number;
  /** 0–1 of element visible to trigger (Framer: 0.3) */
  amount?: number;
  once?: boolean;
  /** Extra viewport margin, e.g. "-10% 0px" */
  margin?: string;
};

export type TextClipPathRevealProps = RevealBase & {
  text: string;
  /** If true, empty lines in `text` are dropped (default) */
  trimEmpty?: boolean;
};

/**
 * Splits on `\n` and reveals each line with a clip-path (Framer string API).
 */
export function TextClipPathReveal({
  text,
  className = "",
  lineClassName = "",
  style,
  revealDirection = "bottom",
  staggerDelay = 0.15,
  duration = 0.8,
  amount = 0.3,
  once = true,
  margin = "-10% 0px -8% 0px",
  trimEmpty = true,
}: TextClipPathRevealProps) {
  const lines = trimEmpty
    ? text.split("\n").filter((l) => l.length > 0)
    : text.split("\n");
  return (
    <TextClipPathRevealLines
      className={className}
      lineClassName={lineClassName}
      style={style}
      lines={lines}
      revealDirection={revealDirection}
      staggerDelay={staggerDelay}
      duration={duration}
      amount={amount}
      once={once}
      margin={margin}
    />
  );
}

export type TextClipPathRevealLinesProps = RevealBase & {
  /** One React node per “line” (row) — Framer’s split-by-line, but with rich text. */
  lines: ReactNode[];
};

export function TextClipPathRevealLines({
  className = "",
  lineClassName = "",
  style,
  lines,
  revealDirection = "bottom",
  staggerDelay = 0.15,
  duration = 0.8,
  amount = 0.3,
  once = true,
  margin = "-10% 0px -8% 0px",
}: TextClipPathRevealLinesProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div className={className} style={style}>
        {lines.map((line, i) => (
          <div key={i} className={lineClassName}>
            {line}
          </div>
        ))}
      </div>
    );
  }

  const hidden = getHidden(revealDirection);

  return (
    <motion.div
      className={className}
      style={style}
      initial="hidden"
      whileInView="visible"
      viewport={{ amount, once, margin }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: staggerDelay } },
      }}
    >
      {lines.map((line, i) => (
        <motion.div
          key={i}
          className={lineClassName}
          style={{ willChange: "clip-path" }}
          variants={{
            hidden: hidden as { clipPath: string; y?: number; x?: number; scale?: number },
            visible: {
              ...lineVisible,
              transition: { duration, ease: EASE },
            },
          }}
        >
          {line}
        </motion.div>
      ))}
    </motion.div>
  );
}
