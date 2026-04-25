import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { LoadingScreen } from "./LoadingScreen";

/**
 * For pages that should only render when signed in.
 * - `requireOnboarded=true`  → redirect to /onboarding if profile.onboarded_at is null
 * - `requireOnboarded=false` → render even pre-onboarding (used for the onboarding page itself)
 */
export function ProtectedRoute({
  children,
  requireOnboarded,
}: {
  children: ReactNode;
  requireOnboarded: boolean;
}) {
  const { session, profile } = useAuth();
  const location = useLocation();

  if (session === undefined) return <LoadingScreen />;
  if (session === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requireOnboarded) {
    if (profile === undefined) return <LoadingScreen />;
    if (!profile || !profile.onboarded_at) {
      return <Navigate to="/onboarding" replace />;
    }
  } else {
    // Onboarding page itself: if already onboarded, send to dashboard so we
    // don't ask the same questions twice.
    if (profile && profile.onboarded_at) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}

/**
 * For /login and /signup — if the user is already signed in,
 * skip the form and bounce them where they belong.
 */
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  if (session === undefined) return <LoadingScreen />;
  if (session) {
    if (profile === undefined) return <LoadingScreen />;
    return (
      <Navigate
        to={profile?.onboarded_at ? "/dashboard" : "/onboarding"}
        replace
      />
    );
  }
  return <>{children}</>;
}
