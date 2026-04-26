import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

type Props = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /**
   * Full viewport width for the layer (no “card” edge); pointer % is still
   * relative to the interactive region, wash spans edge-to-edge.
   */
  fullBleed?: boolean;
};

/**
 * Large soft purple/violet wash that follows the pointer with a little inertia
 * (multiply on #f2f2f2).
 */
export function InteractiveGradient({ children, className = "", style, fullBleed }: Props) {
  const [on, setOn] = useState(false);
  const [g, setG] = useState({ x: 50, y: 45 });
  const targetG = useRef({ x: 50, y: 45 });

  const setTargetFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    targetG.current = {
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    };
  };

  const move = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setTargetFromEvent(e);
  }, []);

  useEffect(() => {
    if (!on) return;
    let raf = 0;
    let alive = true;
    const follow = 0.085;
    const tick = () => {
      if (!alive) return;
      setG((prev) => ({
        x: lerp(prev.x, targetG.current.x, follow),
        y: lerp(prev.y, targetG.current.y, follow),
      }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [on]);

  const gradient = fullBleed
    ? `radial-gradient(circle min(50vw, 36rem) at ${g.x}% ${g.y}%, rgba(124, 58, 237, 0.26) 0%, rgba(99, 102, 241, 0.12) 38%, rgba(196, 181, 253, 0.04) 58%, rgba(196, 181, 253, 0) 80%)`
    : `radial-gradient(circle min(55vw, 32rem) at ${g.x}% ${g.y}%, rgba(124, 58, 237, 0.22) 0%, rgba(99, 102, 241, 0.1) 42%, rgba(196, 181, 253, 0.035) 62%, rgba(196, 181, 253, 0) 85%)`;

  /** Feather top/bottom into #f2f2f2; inner #fff band is wide so the wash reaches higher/lower (larger span). */
  const fullBleedEdgeMask = {
    WebkitMaskImage:
      "linear-gradient(180deg, transparent 0%, #fff 5%, #fff 95%, transparent 100%)",
    WebkitMaskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskImage: "linear-gradient(180deg, transparent 0%, #fff 5%, #fff 95%, transparent 100%)",
    maskSize: "100% 100%",
    maskRepeat: "no-repeat" as const,
  };

  return (
    <div
      className={`relative ${className}`}
      style={style}
      onMouseMove={move}
      onMouseEnter={(e) => {
        setTargetFromEvent(e);
        setOn(true);
      }}
      onMouseLeave={() => setOn(false)}
    >
      <div
        aria-hidden
        className={
          fullBleed
            ? "pointer-events-none absolute top-0 bottom-0 left-1/2 z-0 w-screen -translate-x-1/2 transition-opacity duration-500 ease-out"
            : "pointer-events-none absolute inset-0 z-0 transition-opacity duration-500 ease-out"
        }
        style={{
          opacity: on ? 1 : 0,
          background: gradient,
          mixBlendMode: "multiply",
          ...(fullBleed ? fullBleedEdgeMask : null),
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
