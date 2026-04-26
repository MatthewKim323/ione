/**
 * DashboardShell — wraps a sub-page with the same header + section nav as
 * /dashboard. Pulled out so memory / patterns / sessions / sources don't
 * each re-implement the header and accidentally drift.
 */
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../../lib/auth";
import { DashboardNav } from "./DashboardNav";

export function DashboardShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-ink">
      <header className="border-b border-ink-line px-6 sm:px-10 py-5 flex items-center justify-between">
        <Link
          to="/dashboard"
          aria-label="back to desk"
          className="text-paper text-2xl leading-none hover:opacity-80 transition-opacity"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
        >
          ione<span className="text-neon">.</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="hidden sm:inline-block font-sub text-[11px] tracking-[0.14em] uppercase pencil-link"
          >
            ← landing
          </Link>
          <span className="hidden md:inline-block font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
            {user?.email}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="font-sub text-[11px] tracking-[0.14em] uppercase pencil-link"
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
