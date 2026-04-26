/**
 * DashboardNav — secondary navigation rail used by /dashboard/* sub-pages.
 *
 * Phase 4 lays out: desk · graph (ingest + memory) · patterns · sessions.
 * They're all
 * sub-views of the same student-record. The home /dashboard page is the
 * desk; these are the drawers.
 *
 * Visually: hairline rule, monospace tabs, red accent on active. Same
 * marginalia / pencil aesthetic as the rest of the app — no
 * standard-shadcn "tabs" feel.
 */
import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/dashboard", end: true, label: "desk" },
  { to: "/dashboard/graph", end: false, label: "graph" },
  { to: "/dashboard/patterns", end: false, label: "patterns" },
  { to: "/dashboard/sessions", end: false, label: "sessions" },
] as const;

export function DashboardNav() {
  return (
    <nav
      aria-label="dashboard sections"
      className="border-b border-line mb-12 -mx-6 sm:-mx-10 px-6 sm:px-10"
    >
      <ul className="flex items-center gap-7 sm:gap-9 overflow-x-auto">
        {TABS.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                [
                  "inline-block py-4 font-sub text-[11px] tracking-[0.22em] uppercase",
                  "transition-colors border-b-2 -mb-px",
                  isActive
                    ? "text-red-pencil border-red-pencil"
                    : "text-paper-mute border-transparent hover:text-ink-deep",
                ].join(" ")
              }
            >
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
