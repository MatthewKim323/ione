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
 *
 * Hero: pass `glow-btn--see-how` (with `shrink-0` / `no-underline` as needed) to match
 * the “see how it works” glow pill. Other placements use `GlowButton` (e.g. `glow-btn--closer`).
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

  const isHeroSeeHowStyle = className.includes("glow-btn--see-how");

  if (isHeroSeeHowStyle && variant === "primary") {
    return (
      <GlowButton as="link" to={to} className={className || undefined}>
        <span className="whitespace-nowrap font-bold sm:text-[0.72rem]">
          {children ?? "open the tutor"}
        </span>
      </GlowButton>
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
