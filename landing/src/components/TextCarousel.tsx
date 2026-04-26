import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

interface TextCarouselProps {
  /** Phrases to cycle through, in order. Loops back to the first. */
  items: string[];
  /** Milliseconds each phrase stays on screen before swapping. Default: 2400 */
  interval?: number;
  /** Tailwind / utility className for typography (font, size, letter-spacing). */
  className?: string;
  /** Inline style — color goes here, plus any layout overrides. */
  style?: React.CSSProperties;
  /** Vertical (slide up) or horizontal (slide from right). Default: "vertical". */
  axis?: "vertical" | "horizontal";
  /** Travel distance for the in/out slide, in em. Default: 0.4 */
  distance?: number;
  /**
   * Optional fixed width (in CSS units, e.g. "12ch") to prevent layout
   * shift while the longest phrase is animating in. Defaults to none —
   * the container shrink-wraps each phrase.
   */
  width?: string;
}

/**
 * A self-contained vertical (or horizontal) text carousel — phrases slide
 * in, hold, and slide out on a fixed cadence.  Mirrors the canonical
 * Framer "Text Carousel" module the user linked, but written locally
 * since Framer's hosted ESM modules require Framer's runtime.
 */
export function TextCarousel({
  items,
  interval = 2400,
  className = "",
  style,
  axis = "vertical",
  distance = 0.4,
  width,
}: TextCarouselProps) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % items.length);
    }, interval);
    return () => window.clearInterval(id);
  }, [items, interval]);

  if (items.length === 0) return null;

  const enter =
    axis === "vertical"
      ? { opacity: 0, y: distance + "em" }
      : { opacity: 0, x: distance + "em" };
  const center =
    axis === "vertical" ? { opacity: 1, y: 0 } : { opacity: 1, x: 0 };
  const exit =
    axis === "vertical"
      ? { opacity: 0, y: -distance + "em" }
      : { opacity: 0, x: -distance + "em" };

  return (
    <span
      className={className}
      style={{
        position: "relative",
        display: "inline-block",
        verticalAlign: "baseline",
        // Use overflow hidden so the slide-in/out is masked by the box.
        overflow: "hidden",
        width,
        // Reserve a single line of height so the slide is contained.
        lineHeight: 1.1,
        ...style,
      }}
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={idx}
          initial={enter}
          animate={center}
          exit={exit}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: "inline-block", whiteSpace: "nowrap" }}
        >
          {items[idx]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
