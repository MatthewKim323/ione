import { useAuth } from "../lib/auth";
import { GlowButton } from "./design/GlowButton";

interface EnterCTAProps {
  variant?: "primary" | "ghost";
  className?: string;
  children?: React.ReactNode;
}

/**
 * The landing page's primary "open the tutor" button. Auth-aware:
 * routes signed-out users to /signup and signed-in users to /dashboard
 * (or /onboarding if their profile isn't filled out yet).
 */
export function EnterCTA({
  variant = "primary",
  className = "",
  children,
}: EnterCTAProps) {
  const { session, profile } = useAuth();
  const to =
    session && profile && profile.onboarded_at
      ? "/dashboard"
      : session
        ? "/onboarding"
        : "/signup";

  const isHeroSkin = className.includes("hero-primary");
  const tone =
    variant === "ghost" ? "ghost" : isHeroSkin ? "hero" : "default";

  return (
    <GlowButton as="link" to={to} tone={tone} className={className}>
      {children ?? "open the tutor"}
      <span aria-hidden>→</span>
    </GlowButton>
  );
}
