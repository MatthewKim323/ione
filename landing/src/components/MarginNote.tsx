import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import type { MotionValue } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

interface MarginNoteProps {
  children: ReactNode;
  meta?: string;
  /** Stagger index (0, 1, 2) — used for default `scrollAt` if unset. */
  index?: number;
  /** Reveal this note after page scroll (px) hits this Y (ignored if `revealByProgress` is set). */
  scrollAt?: number;
  /**
   * Reveal when section scroll progress crosses `revealAt` (0–1). Uses `scrollYProgress` from
   * `useScroll({ target: sectionRef })` so notes appear one by one as you move through the hero.
   */
  scrollYProgress?: MotionValue<number>;
  /** Trigger when `scrollYProgress` &gt; this (e.g. 0.1, 0.38, 0.66). */
  revealAt?: number;
  arrow?: boolean;
  /** Stronger R→L slide + fade when revealed (e.g. first margin notes in hero). */
  slideInFromRight?: boolean;
  tilt?: number;
  className?: string;
}

const baseTransition = {
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

/**
 * Handwritten margin note: either after scroll Y (`scrollAt`) or after section
 * `scrollYProgress` crosses `revealAt` (scroll-driven, one by one through the page).
 */
export function MarginNote({
  children,
  meta,
  index = 0,
  scrollAt: scrollAtProp,
  scrollYProgress,
  revealAt: revealAtProp,
  arrow = true,
  slideInFromRight = false,
  tilt = -1.5,
  className = "",
}: MarginNoteProps) {
  const { scrollY } = useScroll();
  const [triggered, setTriggered] = useState(false);
  const reduce = useReducedMotion() ?? false;
  const safeProgress = scrollYProgress ?? useMotionValue(0.5);

  const useProgress = Boolean(scrollYProgress) && typeof revealAtProp === "number";
  const scrollAt = scrollAtProp ?? 70 + index * 160;
  const revealAt = revealAtProp ?? 0;

  /** Fades 0 → 1 as hero `scrollYProgress` moves through a band before/after `revealAt` */
  const scrollFadeOpacity = useTransform(
    safeProgress,
    useProgress && scrollYProgress
      ? [Math.max(0, revealAt - 0.14), Math.min(1, revealAt + 0.1)]
      : [0, 1],
    useProgress && scrollYProgress ? [0, 1] : [1, 1],
    { clamp: true },
  );

  useEffect(() => {
    if (useProgress && scrollYProgress) {
      const check = (v: number) => {
        if (v >= Math.max(0, revealAt - 0.1)) setTriggered(true);
      };
      check(scrollYProgress.get());
      return scrollYProgress.on("change", check);
    }
    const check = (y: number) => {
      if (y >= scrollAt) setTriggered(true);
    };
    check(scrollY.get());
    return scrollY.on("change", check);
  }, [useProgress, scrollYProgress, scrollY, revealAt, scrollAt]);

  useEffect(() => {
    if (reduce && useProgress) setTriggered(true);
  }, [reduce, useProgress]);

  const scrollDriven = !reduce && useProgress && Boolean(scrollYProgress);

  const fromRight = {
    atRest: { opacity: 0, x: 52 },
    active: { opacity: 1, x: 0 },
    t: { ...baseTransition, duration: 1.75 },
  } as const;

  const slideInAtRest = scrollDriven ? { x: 52 } : fromRight.atRest;
  const slideInActive = scrollDriven ? { x: 0 } : fromRight.active;
  const plainAtRest = scrollDriven ? { x: 20 } : { opacity: 0, x: 20 };
  const plainActive = scrollDriven ? { x: 0, opacity: 1 } : { opacity: 1, x: 0 };
  const plainInitial = scrollDriven ? { x: 20 } : { opacity: 0, x: 20 };

  const inner = (
    <motion.div
      initial={slideInFromRight ? slideInAtRest : plainInitial}
      animate={
        triggered
          ? slideInFromRight
            ? slideInActive
            : plainActive
          : slideInFromRight
            ? slideInAtRest
            : plainAtRest
      }
      transition={slideInFromRight ? fromRight.t : { ...baseTransition, duration: 1.4, delay: 0 }}
      whileHover={{ scale: 1.03, transition: { duration: 0.2 } }}
      className="flex cursor-default select-none items-start gap-0"
    >
      {arrow && (
        <div className="flex items-center shrink-0 mt-[1.0rem] mr-1.5">
          <motion.div
            initial={{ scaleX: 0, opacity: 0, x: 12 }}
            animate={
              triggered
                ? { scaleX: 1, opacity: 1, x: 0 }
                : { scaleX: 0, opacity: 0, x: 12 }
            }
            transition={
              slideInFromRight
                ? { ...baseTransition, duration: 1.2, delay: 0.2 }
                : {
                    ...baseTransition,
                    duration: 0.95,
                    delay: 0.16,
                  }
            }
            style={{
              width: "36px",
              height: "1px",
              background:
                "linear-gradient(to right, rgba(212,43,43,0.1), rgba(212,43,43,0.45))",
              transformOrigin: "right center",
            }}
          />
          <motion.span
            initial={{ opacity: 0, x: 6 }}
            animate={triggered ? { opacity: 0.7, x: 0 } : { opacity: 0, x: 6 }}
            transition={{ duration: 0.75, delay: slideInFromRight ? 0.5 : 0.42, ease: baseTransition.ease }}
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

      <div className="relative">
        {meta && (
          <motion.div
            initial={{ opacity: 0, x: slideInFromRight ? 18 : 0 }}
            animate={triggered ? { opacity: 1, x: 0 } : { opacity: 0, x: slideInFromRight ? 18 : 0 }}
            transition={{
              duration: slideInFromRight ? 1.05 : 0.6,
              delay: slideInFromRight ? 0.12 : 0.1,
              ease: baseTransition.ease,
            }}
            className="font-sub tracking-[0.2em] uppercase mb-0.5"
            style={{ fontSize: "0.52rem", color: "rgba(212,43,43,0.55)" }}
          >
            {meta}
          </motion.div>
        )}

        <motion.div
          initial={
            slideInFromRight
              ? { clipPath: "inset(0 0 0 100%)", opacity: 0, x: 16 }
              : { clipPath: "inset(0 100% 0 0)" }
          }
          animate={
            triggered
              ? slideInFromRight
                ? { clipPath: "inset(0 0 0 0)", opacity: 1, x: 0 }
                : { clipPath: "inset(0 0% 0 0)" }
              : slideInFromRight
                ? { clipPath: "inset(0 0 0 100%)", opacity: 0, x: 16 }
                : { clipPath: "inset(0 100% 0 0)" }
          }
          transition={{
            ...baseTransition,
            duration: slideInFromRight ? 1.45 : 1.05,
            delay: slideInFromRight ? 0.16 : 0.14,
          }}
          className="hand"
          style={{
            fontSize: "clamp(1.5rem, 2.2vw, 1.85rem)",
            lineHeight: 1.15,
            color: "#d42b2b",
            rotate: tilt,
            textShadow: "0 1px 6px rgba(0,0,0,0.28)",
            fontWeight: 600,
            willChange: "clip-path, opacity, transform",
          }}
        >
          {children}
        </motion.div>
      </div>
    </motion.div>
  );

  if (scrollDriven) {
    return (
      <motion.div
        className={`w-full min-w-0 ${className}`}
        style={{ opacity: scrollFadeOpacity }}
      >
        {inner}
      </motion.div>
    );
  }

  return <div className={className}>{inner}</div>;
}
