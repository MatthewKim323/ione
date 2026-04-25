import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

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
  className,
  children,
}: EnterCTAProps) {
  const { session, profile } = useAuth();
  // Treat undefined (still loading) as logged-out so the link is always usable;
  // if loading finishes and they're authed, the route guards will redirect.
  const to =
    session && profile && profile.onboarded_at
      ? "/dashboard"
      : session
        ? "/onboarding"
        : "/signup";

  return (
    <Link
      to={to}
      className={[
        "cta",
        variant === "ghost" ? "cta-ghost" : "",
        className ?? "",
      ].join(" ")}
    >
      {children ?? "open the tutor"}
      <span aria-hidden>→</span>
    </Link>
  );
}
