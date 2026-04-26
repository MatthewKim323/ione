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

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

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
      className="fixed top-0 left-0 right-0 z-50 flex justify-center px-3 pt-3 sm:pt-4 pointer-events-none"
      aria-label="Primary"
    >
      {/* Glossy chrome capsule — metallic rim + inner glass, compact. */}
      <div
        className="pointer-events-auto w-fit max-w-[calc(100vw-1.5rem)] rounded-full p-px shadow-[0_4px_24px_rgba(0,0,0,0.25),0_0_0_1px_rgba(255,255,255,0.06)_inset]"
        style={{
          background:
            "linear-gradient(165deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.22) 35%, rgba(180,190,210,0.15) 55%, rgba(40,45,55,0.5) 100%)",
        }}
      >
        <div
          className="flex items-center gap-1.5 rounded-full px-2 py-0.5 sm:px-2.5 sm:py-1 backdrop-blur-xl"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 45%, rgba(8,10,14,0.55) 100%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.55)," +
              "inset 0 -1px 0 rgba(0,0,0,0.35)," +
              "inset 0 0 20px rgba(255,255,255,0.04)",
            WebkitBackdropFilter: "blur(18px)",
          }}
        >
          {/* Left: status */}
          <div className="min-w-0 shrink pl-0.5 font-sub text-[7px] sm:text-[8px] tracking-[0.14em] uppercase text-paper/85 leading-none">
            {!booted ? (
              <span className="tabular-nums text-paper">{pct}%</span>
            ) : (
              <span className="flex items-baseline gap-1">
                <span className="text-red-pencil text-[6px] sm:text-[7px]">
                  ●
                </span>
                <span className="hidden min-[380px]:inline text-paper-mute">
                  {status.label}
                </span>
                <span className="tabular-nums text-paper truncate max-w-[4.2rem] sm:max-w-[5.5rem]">
                  {status.value}
                </span>
              </span>
            )}
          </div>

          <span
            className="h-2.5 w-px shrink-0 bg-gradient-to-b from-transparent via-white/35 to-transparent"
            aria-hidden
          />

          {/* Center: nav (no wordmark) */}
          <div className="flex flex-1 items-center justify-center gap-2.5 sm:gap-3 px-0.5 font-sub text-[7px] sm:text-[8px] tracking-[0.14em] sm:tracking-[0.16em] uppercase">
            <a
              href="#pipeline"
              className="text-paper/90 transition hover:text-paper"
            >
              how
            </a>
            <a
              href="https://github.com/MatthewKim323/ione"
              target="_blank"
              rel="noopener noreferrer"
              className="flex text-paper/75 transition hover:text-paper"
              aria-label="ione on GitHub"
            >
              <GitHubIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 opacity-90" />
            </a>
          </div>

          <span
            className="h-2.5 w-px shrink-0 bg-gradient-to-b from-transparent via-white/35 to-transparent"
            aria-hidden
          />

          {/* Right: CTA */}
          {isAuthed ? (
            <Link
              to={profile?.onboarded_at ? "/dashboard" : "/onboarding"}
              className="shrink-0 rounded-full bg-gradient-to-b from-white to-paper/95 px-2 py-0.5 sm:px-2.5 sm:py-1 font-sub text-[7px] sm:text-[8px] font-semibold uppercase tracking-[0.12em] text-ink-deep shadow-[0_1px_2px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.9)] transition hover:brightness-105 active:scale-[0.97]"
            >
              home
            </Link>
          ) : (
            <Link
              to="/login"
              className="shrink-0 rounded-full bg-gradient-to-b from-white to-paper/95 px-2 py-0.5 sm:px-2.5 sm:py-1 font-sub text-[7px] sm:text-[8px] font-semibold uppercase tracking-[0.12em] text-ink-deep shadow-[0_1px_2px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.9)] transition hover:brightness-105 active:scale-[0.97]"
            >
              login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
