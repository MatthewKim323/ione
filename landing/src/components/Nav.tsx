import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

/** In-page sections (hash targets). `join` maps to DOM id `start`. */
type ScrollNavId = "intro" | "demo" | "pipeline" | "join";
type NavId = ScrollNavId | "account";

const INDICATOR_EASE = "cubic-bezier(0.34, 1.2, 0.64, 1)";

const SCROLL_ORDER: { navId: ScrollNavId; domId: string }[] = [
  { navId: "join", domId: "start" },
  { navId: "pipeline", domId: "pipeline" },
  { navId: "demo", domId: "demo" },
  { navId: "intro", domId: "intro" },
];

function IconHome({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  );
}

function IconPlay({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path
        fill="currentColor"
        stroke="none"
        d="M10.25 8.75 16.5 12l-6.25 3.25V8.75z"
      />
    </svg>
  );
}

function IconPipeline({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="6" cy="7" r="2" />
      <path d="M10 7h10M6 12h12M6 17h7" />
    </svg>
  );
}

function IconJoin({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" />
    </svg>
  );
}

function IconUser({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="3.5" />
    </svg>
  );
}

function pickScrollSection(): ScrollNavId {
  if (window.scrollY < 72) return "intro";

  const probe = window.innerHeight * 0.36;
  let best: ScrollNavId = "intro";
  let bestDist = Number.POSITIVE_INFINITY;

  const candidates: { navId: ScrollNavId; domId: string }[] = [
    { navId: "intro", domId: "intro" },
    ...SCROLL_ORDER,
  ];

  for (const { navId, domId } of candidates) {
    const el = document.getElementById(domId);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) continue;
    const mid = (r.top + r.bottom) / 2;
    const dist = Math.abs(mid - probe);
    if (dist < bestDist) {
      bestDist = dist;
      best = navId;
    }
  }
  return best;
}

export function Nav({ revealed = true }: { revealed?: boolean }) {
  const { session, profile } = useAuth();
  const barRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const demoRef = useRef<HTMLDivElement>(null);
  const pipelineRef = useRef<HTMLDivElement>(null);
  const joinRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  const [scrollSection, setScrollSection] = useState<ScrollNavId>("intro");
  const [hoverSlot, setHoverSlot] = useState<NavId | null>(null);
  const [indicator, setIndicator] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    ready: false,
  });

  const scrollActive = scrollSection;
  const active: NavId = hoverSlot ?? scrollActive;

  const userHref =
    session && profile?.onboarded_at
      ? "/dashboard"
      : session
        ? "/onboarding"
        : "/login";

  const accountTitle = session
    ? profile?.onboarded_at
      ? "Open your dashboard and memory."
      : "Finish onboarding."
    : "Log in or create an account.";

  const accountLine1 = session ? (profile?.onboarded_at ? "Desk" : "Onboard") : "Sign in";
  const accountLine2 = session
    ? profile?.onboarded_at
      ? "dashboard"
      : "continue setup"
    : "log in / sign up";

  const refFor = useCallback(
    (id: NavId): RefObject<HTMLDivElement | null> => {
      switch (id) {
        case "intro":
          return introRef;
        case "demo":
          return demoRef;
        case "pipeline":
          return pipelineRef;
        case "join":
          return joinRef;
        case "account":
          return accountRef;
      }
    },
    [],
  );

  const measure = useCallback(() => {
    const bar = barRef.current;
    const slotEl = refFor(active).current;
    if (!bar || !slotEl) return;
    const br = bar.getBoundingClientRect();
    const sr = slotEl.getBoundingClientRect();
    setIndicator({
      left: sr.left - br.left,
      top: sr.top - br.top,
      width: sr.width,
      height: sr.height,
      ready: true,
    });
  }, [active, refFor]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure]);

  useEffect(() => {
    const tick = () => setScrollSection(pickScrollSection());
    tick();
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick);
    return () => {
      window.removeEventListener("scroll", tick);
      window.removeEventListener("resize", tick);
    };
  }, []);

  const cellClass = (id: NavId) =>
    [
      "floating-nav__cell",
      active === id ? "floating-nav__btn--on" : "",
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <motion.nav
      className="floating-nav floating-nav--light fixed top-6 left-1/2 z-50 max-w-[calc(100vw-1rem)] -translate-x-1/2 px-2 sm:top-8"
      aria-label="On this page"
      initial={false}
      animate={
        revealed
          ? { opacity: 1, y: 0, pointerEvents: "auto" }
          : { opacity: 0, y: -26, pointerEvents: "none" }
      }
      transition={{ duration: 0.82, ease: [0.16, 1, 0.3, 1] }}
    >
      <div ref={barRef} className="floating-nav__shell relative">
        {indicator.ready && (
          <div
            className="floating-nav__indicator"
            style={{
              left: indicator.left,
              top: indicator.top,
              width: indicator.width,
              height: indicator.height,
              transitionProperty: "left, top, width, height, opacity",
              transitionDuration: "0.48s",
              transitionTimingFunction: INDICATOR_EASE,
            }}
            aria-hidden
          >
            <div className="floating-nav__ind-glow" />
            <div className="floating-nav__ind-clip">
              <div className="floating-nav__ind-spin" />
            </div>
            <div className="floating-nav__ind-plate" />
          </div>
        )}

        <div className="floating-nav__row flex flex-nowrap items-stretch justify-center overflow-x-auto">
          <div
            ref={introRef}
            className="floating-nav__slot shrink-0"
            onMouseEnter={() => setHoverSlot("intro")}
            onMouseLeave={() => setHoverSlot(null)}
          >
            <a
              href="#intro"
              className={cellClass("intro")}
              aria-current={active === "intro" ? "location" : undefined}
              title="Jump to the title and hero at the top of the page."
            >
              <IconHome className="shrink-0 opacity-90" />
              <span className="floating-nav__cell-text">
                <span className="floating-nav__cell-title">Start</span>
                <span className="floating-nav__cell-hint">title & hero</span>
              </span>
            </a>
          </div>

          <span className="floating-nav__div shrink-0" aria-hidden />

          <div
            ref={demoRef}
            className="floating-nav__slot shrink-0"
            onMouseEnter={() => setHoverSlot("demo")}
            onMouseLeave={() => setHoverSlot(null)}
          >
            <a
              href="#demo"
              className={cellClass("demo")}
              aria-current={active === "demo" ? "location" : undefined}
              title="Jump to the full-width demo you scrub with scroll."
            >
              <IconPlay className="shrink-0 opacity-90" />
              <span className="floating-nav__cell-text">
                <span className="floating-nav__cell-title">Demo</span>
                <span className="floating-nav__cell-hint">scroll video</span>
              </span>
            </a>
          </div>

          <span className="floating-nav__div shrink-0" aria-hidden />

          <div
            ref={pipelineRef}
            className="floating-nav__slot shrink-0"
            onMouseEnter={() => setHoverSlot("pipeline")}
            onMouseLeave={() => setHoverSlot(null)}
          >
            <a
              href="#pipeline"
              className={cellClass("pipeline")}
              aria-current={active === "pipeline" ? "location" : undefined}
              title="Jump to how ione watches, decides, and speaks."
            >
              <IconPipeline className="shrink-0 opacity-90" />
              <span className="floating-nav__cell-text">
                <span className="floating-nav__cell-title">How</span>
                <span className="floating-nav__cell-hint">pipeline</span>
              </span>
            </a>
          </div>

          <span className="floating-nav__div shrink-0" aria-hidden />

          <div
            ref={joinRef}
            className="floating-nav__slot shrink-0"
            onMouseEnter={() => setHoverSlot("join")}
            onMouseLeave={() => setHoverSlot(null)}
          >
            <a
              href="#start"
              className={cellClass("join")}
              aria-current={active === "join" ? "location" : undefined}
              title="Jump to the closing section with sign-up and session card."
            >
              <IconJoin className="shrink-0 opacity-90" />
              <span className="floating-nav__cell-text">
                <span className="floating-nav__cell-title">Join</span>
                <span className="floating-nav__cell-hint">get started</span>
              </span>
            </a>
          </div>

          <span className="floating-nav__div shrink-0" aria-hidden />

          <div
            ref={accountRef}
            className="floating-nav__slot shrink-0"
            onMouseEnter={() => setHoverSlot("account")}
            onMouseLeave={() => setHoverSlot(null)}
          >
            <Link
              to={userHref}
              className={cellClass("account")}
              title={accountTitle}
              aria-current={active === "account" ? "page" : undefined}
            >
              <IconUser className="shrink-0 opacity-90" />
              <span className="floating-nav__cell-text">
                <span className="floating-nav__cell-title">{accountLine1}</span>
                <span className="floating-nav__cell-hint">{accountLine2}</span>
              </span>
            </Link>
          </div>
        </div>
      </div>
    </motion.nav>
  );
}
