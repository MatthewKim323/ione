/**
 * DashboardShell — wraps a sub-page with the same header + section nav as
 * /dashboard. Pulled out so memory / patterns / sessions / sources don't
 * each re-implement the header and accidentally drift.
 *
 * Aesthetic: light "desk" surface — warm off-white page (#f2f2f2) inherited
 * from the landing, ink-dark text, hairline borders in warm tan, and the
 * red-pencil dot in the wordmark for continuity with the landing nav.
 */
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useAuth } from "../../lib/auth";
import { DashboardNav } from "./DashboardNav";

export function DashboardShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();

  // Keep <body> in sync with the desk page bg so the area outside the
  // main column (overscroll, browser chrome) doesn't flash dark.
  useEffect(() => {
    const prevBody = document.body.style.backgroundColor;
    const prevHtml = document.documentElement.style.backgroundColor;
    document.body.style.backgroundColor = "#f2f2f2";
    document.documentElement.style.backgroundColor = "#f2f2f2";
    return () => {
      document.body.style.backgroundColor = prevBody;
      document.documentElement.style.backgroundColor = prevHtml;
    };
  }, []);

  return (
    <div className="min-h-screen desk-page">
      <header className="border-b border-line px-6 sm:px-10 py-5 flex items-center justify-between bg-desk/80 backdrop-blur-[2px] sticky top-0 z-20">
        <Link
          to="/dashboard"
          aria-label="back to desk"
          className="text-ink-deep text-2xl leading-none hover:opacity-80 transition-opacity"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
        >
          ione<span className="text-neon">.</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link
            to="/dashboard/graph"
            className="font-sub text-[11px] tracking-[0.14em] uppercase pencil-link-light"
          >
            memory & graph
          </Link>
          <Link
            to="/"
            className="hidden sm:inline-block font-sub text-[11px] tracking-[0.14em] uppercase pencil-link-light"
          >
            ← landing
          </Link>
          <span className="hidden md:inline-block font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
            {user?.email}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="font-sub text-[11px] tracking-[0.14em] uppercase pencil-link-light"
          >
            sign out
          </button>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 sm:px-10 pt-10 pb-24">
        <DashboardNav />
        {children}
      </main>
    </div>
  );
}
