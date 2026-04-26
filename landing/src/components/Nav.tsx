import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

type DockSlot = "home" | "search" | "user";

const INDICATOR_EASE = "cubic-bezier(0.34, 1.2, 0.64, 1)";

function IconHome({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
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

function IconSearch({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  );
}

function IconUser({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
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

export function Nav() {
  const { session, profile } = useAuth();
  const barRef = useRef<HTMLDivElement>(null);
  const homeSlotRef = useRef<HTMLDivElement>(null);
  const searchSlotRef = useRef<HTMLDivElement>(null);
  const userSlotRef = useRef<HTMLDivElement>(null);

  const [demoInView, setDemoInView] = useState(false);
  const [hoverSlot, setHoverSlot] = useState<DockSlot | null>(null);
  const [indicator, setIndicator] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    ready: false,
  });

  const ioActive: DockSlot = demoInView ? "search" : "home";
  const active: DockSlot = hoverSlot ?? ioActive;

  const userHref =
    session && profile?.onboarded_at
      ? "/dashboard"
      : session
        ? "/onboarding"
        : "/login";

  const measure = useCallback(() => {
    const bar = barRef.current;
    const slotEl =
      active === "home"
        ? homeSlotRef.current
        : active === "search"
          ? searchSlotRef.current
          : userSlotRef.current;
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
  }, [active]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure]);

  useEffect(() => {
    const demo = document.getElementById("demo");
    if (!demo) return;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e) return;
        setDemoInView(e.isIntersecting && e.intersectionRatio >= 0.35);
      },
      { threshold: [0, 0.15, 0.35, 0.5, 0.75, 1] },
    );
    io.observe(demo);
    return () => io.disconnect();
  }, []);

  const scrollHome = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollSearch = () => {
    document.getElementById("demo")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  return (
    <nav
      className="floating-nav fixed top-6 left-1/2 z-50 -translate-x-1/2 px-3 sm:top-8"
      aria-label="Primary"
    >
      <div
        ref={barRef}
        className="floating-nav__shell relative"
        style={
          {
            backgroundColor: "rgba(10, 6, 18, 0.78)",
            "--floating-nav-plate": "rgba(10, 6, 18, 0.9)",
          } as CSSProperties
        }
      >
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

        <div className="floating-nav__row">
          <div
            ref={homeSlotRef}
            className="floating-nav__slot"
            onMouseEnter={() => setHoverSlot("home")}
            onMouseLeave={() => setHoverSlot(null)}
          >
            <button
              type="button"
              className={`floating-nav__btn ${active === "home" ? "floating-nav__btn--on" : ""}`}
              aria-label="Home"
              aria-current={active === "home" ? "true" : undefined}
              onClick={scrollHome}
            >
              <IconHome />
            </button>
          </div>

          <span className="floating-nav__div" aria-hidden />

          <div
            ref={searchSlotRef}
            className="floating-nav__slot"
            onMouseEnter={() => setHoverSlot("search")}
            onMouseLeave={() => setHoverSlot(null)}
          >
            <button
              type="button"
              className={`floating-nav__btn ${active === "search" ? "floating-nav__btn--on" : ""}`}
              aria-label="Search demo"
              aria-current={active === "search" ? "true" : undefined}
              onClick={scrollSearch}
            >
              <IconSearch />
            </button>
          </div>

          <span className="floating-nav__div" aria-hidden />

          <div
            ref={userSlotRef}
            className="floating-nav__slot"
            onMouseEnter={() => setHoverSlot("user")}
            onMouseLeave={() => setHoverSlot(null)}
          >
            <Link
              to={userHref}
              className={`floating-nav__btn ${active === "user" ? "floating-nav__btn--on" : ""}`}
              aria-label="Account"
              aria-current={active === "user" ? "page" : undefined}
            >
              <IconUser />
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
