import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { GlowButton } from "./design/GlowButton";
import {
  getHeroCtaArrowVariants,
  getHeroCtaLabelVariants,
  HERO_CTA_WRAPPER,
} from "../lib/heroNeonCtaMotion";

const MotionLink = motion(Link);

interface EnterCTAProps {
  variant?: "primary" | "ghost";
  className?: string;
  children?: React.ReactNode;
}

/**
 * The landing page's primary "open the tutor" button. Auth-aware:
 * routes signed-out users to /signup and signed-in users to /dashboard
 * (or /onboarding if their profile isn't filled out yet).
 *
 * The hero pass uses `className` containing `hero-primary-cta` (Shift + neon styles).
 * Other placements use the shared `GlowButton`.
 */
export function EnterCTA({
  variant = "primary",
  className = "",
  children,
}: EnterCTAProps) {
  const reduced = useReducedMotion() ?? false;
  const { session, profile } = useAuth();
  const to =
    session && profile && profile.onboarded_at
      ? "/dashboard"
      : session
        ? "/onboarding"
        : "/signup";

  const isHeroCta = className.includes("hero-primary-cta");

  if (isHeroCta && variant === "primary") {
    const labelVars = getHeroCtaLabelVariants(reduced);
    const arrowVars = getHeroCtaArrowVariants(reduced);

    return (
      <MotionLink
        to={to}
        initial="rest"
        whileHover="hover"
        whileTap={{ scale: 0.985 }}
        variants={HERO_CTA_WRAPPER}
        className={[
          "cta",
          "hero-primary-cta__motion overflow-hidden",
          className,
        ].join(" ")}
      >
        <motion.span
          className="hero-primary-cta__label inline-block will-change-transform"
          variants={labelVars}
        >
          {children ?? "open the tutor"}
        </motion.span>
        <motion.span
          className="hero-primary-cta__arrow inline-block overflow-hidden will-change-transform"
          aria-hidden
          variants={arrowVars}
        >
          →
        </motion.span>
      </MotionLink>
    );
  }

  const tone = variant === "ghost" ? "ghost" : "default";

  return (
    <GlowButton as="link" to={to} tone={tone} className={className || undefined}>
      {children ?? "open the tutor"}
      {variant === "primary" && <span aria-hidden>→</span>}
    </GlowButton>
  );
}
