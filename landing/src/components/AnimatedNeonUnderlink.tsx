import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

const BASE_W = 310;
const BASE_H = 40;

/**
 * Wavy paths (Y ~ 12–32 in 310×40 space), from Framer-style animated underlinks.
 * SVG scales to match text width without distorting the stroke.
 */
const UNDERLINE_PATHS: readonly string[] = [
  "M5 20.9999C26.7762 16.2245 49.5532 11.5572 71.7979 14.6666C84.9553 16.5057 97.0392 21.8432 109.987 24.3888C116.413 25.6523 123.012 25.5143 129.042 22.6388C135.981 19.3303 142.586 15.1422 150.092 13.3333C156.799 11.7168 161.702 14.6225 167.887 16.8333C181.562 21.7212 194.975 22.6234 209.252 21.3888C224.678 20.0548 239.912 17.991 255.42 18.3055C272.027 18.6422 288.409 18.867 305 17.9999",
  "M4.99805 20.9998C65.6267 17.4649 126.268 13.845 187.208 12.8887C226.483 12.2723 265.751 13.2796 304.998 13.9998",
  "M5 24.2592C26.233 20.2879 47.7083 16.9968 69.135 13.8421C98.0469 9.5853 128.407 4.02322 158.059 5.14674C172.583 5.69708 187.686 8.66104 201.598 11.9696C207.232 13.3093 215.437 14.9471 220.137 18.3619C224.401 21.4596 220.737 25.6575 217.184 27.6168C208.309 32.5097 197.199 34.281 186.698 34.8486C183.159 35.0399 147.197 36.2657 155.105 26.5837C158.11 22.9053 162.993 20.6229 167.764 18.7924C178.386 14.7164 190.115 12.1115 201.624 10.3984C218.367 7.90626 235.528 7.06127 252.521 7.49276C258.455 7.64343 264.389 7.92791 270.295 8.41825C280.321 9.25056 296 10.8932 305 13.0242",
];

const PENCIL = [0.16, 1, 0.3, 1] as const;

type Props = {
  children: React.ReactNode;
  className?: string;
  viewDelay?: number;
  strokeWidth?: number;
  gap?: number;
};

/**
 * Hand-drawn neon stroke under text; animates in when scrolled into view; new wave on hover.
 */
export function AnimatedNeonUnderlink({
  children,
  className = "",
  viewDelay = 0,
  strokeWidth = 3.25,
  gap = 3,
}: Props) {
  const textRef = useRef<HTMLSpanElement>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState(0);
  const [inView, setInView] = useState(false);
  const [pathId, setPathId] = useState(0);
  const reduce = useReducedMotion();
  const id = useId();
  const d = UNDERLINE_PATHS[pathId % UNDERLINE_PATHS.length]!;

  const update = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    const rw = el.getBoundingClientRect().width;
    setW((x) => (Math.abs(x - rw) < 0.5 ? x : rw));
  }, []);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            return;
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -5% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const h = w > 0 ? (w * BASE_H) / BASE_W : 0;

  return (
    <span ref={rootRef} className="inline-flex max-w-full flex-col items-stretch [overflow:visible]">
      <span ref={textRef} className={className}>
        {children}
      </span>
      {inView && w > 0 && h > 0 && (
        <span
          className="relative block w-full text-[var(--color-neon)]"
          style={{ marginTop: gap, height: h, minHeight: 8 }}
        >
          <svg
            className="absolute left-0 top-0 block h-full w-full [overflow:visible]"
            viewBox={`0 0 ${BASE_W} ${BASE_H}`}
            width={w}
            height={h}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden
            shapeRendering="geometricPrecision"
            onPointerEnter={() => {
              if (reduce) return;
              setPathId((i) => (i + 1) % UNDERLINE_PATHS.length);
            }}
          >
            <defs>
              <filter id={`${id}-glow`} x="-10%" y="-20%" width="120%" height="160%">
                <feGaussianBlur stdDeviation="0.4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <motion.path
              key={pathId}
              d={d}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{
                filter: reduce ? undefined : `url(#${id}-glow)`,
                strokeWidth,
              }}
              initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{
                pathLength: {
                  delay: viewDelay,
                  duration: reduce ? 0 : 0.65,
                  ease: PENCIL,
                },
              }}
            />
          </svg>
        </span>
      )}
    </span>
  );
}
