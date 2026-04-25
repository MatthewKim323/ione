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
  // When prerendering, skip straight to booted state so headless captures
  // see the final status line, not a frozen mid-boot percentage.
  const [pct, setPct] = useState(SKIP_FX ? 96 : 0);
  const [statusIdx, setStatusIdx] = useState(0);

  // Tick a "loading" counter from 0 → 96 once on mount, like an old terminal
  // initializing. After it hits 96, swap into the rotating status display.
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

  // Rotate through status messages once boot is done
  useEffect(() => {
    const id = setInterval(() => {
      setStatusIdx((i) => (i + 1) % STATUS_CYCLE.length);
    }, 3200);
    return () => clearInterval(id);
  }, []);

  const booted = pct >= 96;
  const status = STATUS_CYCLE[statusIdx];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-6 sm:px-10 pt-6 sm:pt-8 flex items-start justify-between pointer-events-none">
      {/* Left: boot indicator → status cycle */}
      <div className="pointer-events-auto flex items-center gap-3">
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-mute leading-none">
          {!booted ? (
            <span className="tabular-nums text-paper">{pct}%</span>
          ) : (
            <span className="flex items-baseline gap-2">
              <span className="text-red-pencil">●</span>
              <span className="text-paper-mute">{status.label}</span>
              <span className="text-paper">{status.value}</span>
            </span>
          )}
        </div>
      </div>

      {/* Center: brand mark, italic ione. */}
      <div className="pointer-events-auto absolute left-1/2 -translate-x-1/2 hidden md:block">
        <Link
          to="/"
          className="text-paper text-2xl leading-none"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
        >
          ione<span className="text-red-pencil">.</span>
        </Link>
      </div>

      {/* Right: nav links */}
      <div className="pointer-events-auto flex items-center gap-5 sm:gap-7 font-mono text-[11px] tracking-[0.18em] uppercase">
        <a href="#pipeline" className="pencil-link hidden sm:inline-block">
          how
        </a>
        <a href="#signal" className="pencil-link hidden sm:inline-block">
          terminal
        </a>
        <a
          href="https://github.com/MatthewKim323/ione"
          className="pencil-link hidden sm:inline-block text-paper-dim"
        >
          github
        </a>
        {isAuthed ? (
          <Link
            to={profile?.onboarded_at ? "/dashboard" : "/onboarding"}
            className="pencil-link text-paper"
          >
            dashboard
            <span className="ml-2 text-red-pencil">↗</span>
          </Link>
        ) : (
          <Link to="/login" className="pencil-link text-paper">
            log in
            <span className="ml-2 text-red-pencil">↗</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
