import type { Variants } from "motion/react";

/** Framer “Shift”–style: slight overshoot, then settle (see Shift Button on Framer). */
export const HERO_CTA_WRAPPER: Variants = { rest: {}, hover: {} };

const spring = {
  type: "spring" as const,
  stiffness: 480,
  damping: 26,
  mass: 0.5,
};

const springTight: typeof spring = {
  ...spring,
  stiffness: 520,
  damping: 24,
  mass: 0.45,
};

export const HERO_CTA_LABEL: Variants = {
  rest: { x: 0, transition: { ...spring, stiffness: 420, damping: 32 } },
  hover: {
    x: [0, 5.5, -3.2],
    transition: {
      x: { duration: 0.5, times: [0, 0.32, 1], ease: "easeInOut" },
    },
  },
};

export const HERO_CTA_ARROW: Variants = {
  rest: {
    opacity: 0,
    maxWidth: 0,
    x: 14,
    transition: { ...spring, stiffness: 400, damping: 35 },
  },
  hover: {
    opacity: 1,
    maxWidth: 40,
    x: 0,
    transition: { ...springTight, delay: 0.05 },
  },
};

export function getHeroCtaLabelVariants(
  reduced: boolean
): Variants {
  if (reduced) {
    return {
      rest: { x: 0, transition: { type: "spring", stiffness: 400, damping: 35 } },
      hover: { x: -2, transition: { type: "spring", stiffness: 500, damping: 30 } },
    };
  }
  return HERO_CTA_LABEL;
}

export function getHeroCtaArrowVariants(
  reduced: boolean
): Variants {
  if (reduced) {
    return {
      rest: { opacity: 0, x: 10, maxWidth: 0 },
      hover: {
        opacity: 1,
        x: 0,
        maxWidth: 40,
        transition: { duration: 0.2, ease: "easeOut" },
      },
    };
  }
  return HERO_CTA_ARROW;
}
