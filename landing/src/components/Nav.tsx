import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SKIP_FX } from "../lib/prerender";
import { useAuth } from "../lib/auth";

const STATUS_CYCLE = [
  { label: "watching", value: "8.0s / cycle" },
  { label: "silence", value: "87%" },
  { label: "compute", value: "$0.02 / cycle" },
  { label: "memory", value: "backboard" },
];

export function Nav() {
  const { session, profile } = useAuth();
  const isAuthed = !!session;
  const [pct, setPct] = useState(SKIP_FX ? 96 : 0);
  const [statusIdx, setStatusIdx] = useState(0);

  useEffect(() => {
    if (SKIP_FX) return;
    let raf = 0;
    const start = performance.now();
    const dur = 1700;
    const tick = (t: number) => {
      const elapsed = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      setPct(Math.floor(eased * 96));
      if (elapsed < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setStatusIdx((i) => (i + 1) % STATUS_CYCLE.length);
    }, 3200);
    return () => clearInterval(id);
  }, []);

  const booted = pct >= 96;
  const status = STATUS_CYCLE[statusIdx];

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-4 sm:px-6 sm:pt-6 pointer-events-none"
      aria-label="Primary"
    >
      {/* Single consolidated bar — same pattern as useiris.tech: one
          rounded capsule with status, mark, links, and CTA living
          together instead of floating in three separate zones. */}
      <div
        className="pointer-events-auto flex w-full max-w-5xl items-center gap-2 sm:gap-4 rounded-full border border-white/20 bg-black/30 px-3 py-2 sm:px-5 sm:py-2.5 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.18)]"
        style={{ WebkitBackdropFilter: "blur(20px)" }}
      >
        {/* Left: boot → live status */}
        <div className="min-w-0 shrink font-mono text-[9px] sm:text-[10px] tracking-[0.18em] sm:tracking-[0.22em] uppercase text-paper-mute leading-none">
          {!booted ? (
            <span className="tabular-nums text-paper">{pct}%</span>
          ) : (
            <span className="flex items-baseline gap-1.5 sm:gap-2">
              <span className="text-red-pencil">●</span>
              <span className="hidden min-[420px]:inline text-paper-mute">
                {status.label}
              </span>
              <span className="tabular-nums text-paper truncate max-w-[5.5rem] sm:max-w-none">
                {status.value}
              </span>
            </span>
          )}
        </div>

        <span
          className="hidden sm:block h-4 w-px shrink-0 bg-white/15"
          aria-hidden
        />

        {/* Center: wordmark */}
        <div className="flex min-w-0 flex-1 justify-center">
          <Link
            to="/"
            className="shrink-0 text-paper text-lg sm:text-xl leading-none transition-opacity hover:opacity-90"
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
          >
            ione<span className="text-red-pencil">.</span>
          </Link>
        </div>

        <span
          className="hidden sm:block h-4 w-px shrink-0 bg-white/15"
          aria-hidden
        />

        {/* Right: anchors + primary CTA in one cluster */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex items-center gap-4 font-mono text-[10px] sm:text-[11px] tracking-[0.16em] sm:tracking-[0.18em] uppercase">
            <a href="#pipeline" className="pencil-link text-paper/90">
              how
            </a>
            <a href="#signal" className="pencil-link text-paper/90">
              terminal
            </a>
            <a
              href="https://github.com/MatthewKim323/ione"
              className="pencil-link text-paper-dim"
            >
              github
            </a>
          </div>

          {isAuthed ? (
            <Link
              to={profile?.onboarded_at ? "/dashboard" : "/onboarding"}
              className="inline-flex items-center justify-center rounded-full bg-white px-3.5 py-1.5 sm:px-4 sm:py-2 font-mono text-[9px] sm:text-[10px] font-medium uppercase tracking-[0.14em] sm:tracking-[0.16em] text-ink-deep shadow-sm transition hover:bg-paper active:scale-[0.98]"
            >
              dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-full bg-white px-3.5 py-1.5 sm:px-4 sm:py-2 font-mono text-[9px] sm:text-[10px] font-medium uppercase tracking-[0.14em] sm:tracking-[0.16em] text-ink-deep shadow-sm transition hover:bg-paper active:scale-[0.98]"
            >
              log in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
