import { useCallback, useState, type CSSProperties, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /**
   * Gradient uses full viewport width and a softer, wider falloff so it matches
   * full-bleed sections (no “card” edge). Pointer % is still relative to the
   * interactive region, but the color wash spans edge-to-edge.
   */
  fullBleed?: boolean;
};

/**
 * Soft purple/violet wash that follows the pointer on hover (multiply blend on #f2f2f2).
 */
export function InteractiveGradient({ children, className = "", style, fullBleed }: Props) {
  const [on, setOn] = useState(false);
  const [g, setG] = useState({ x: 50, y: 45 });

  const move = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setG({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    });
  }, []);

  const gradient = fullBleed
    ? `radial-gradient(ellipse 135% 110% at ${g.x}% ${g.y}%, rgba(124, 58, 237, 0.22) 0%, rgba(99, 102, 241, 0.11) 42%, rgba(196, 181, 253, 0.05) 62%, rgba(250, 245, 255, 0) 88%)`
    : `radial-gradient(ellipse 85% 70% at ${g.x}% ${g.y}%, rgba(124, 58, 237, 0.26) 0%, rgba(99, 102, 241, 0.12) 38%, rgba(196, 181, 253, 0.04) 55%, transparent 72%)`;

  /** Feather top/bottom so the wash blends into the page color (#f2f2f2) from sections above & below. */
  const fullBleedEdgeMask = {
    WebkitMaskImage:
      "linear-gradient(180deg, transparent 0%, #fff 12%, #fff 88%, transparent 100%)",
    WebkitMaskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskImage: "linear-gradient(180deg, transparent 0%, #fff 12%, #fff 88%, transparent 100%)",
    maskSize: "100% 100%",
    maskRepeat: "no-repeat" as const,
  };

  return (
    <div
      className={`relative ${className}`}
      style={style}
      onMouseMove={move}
      onMouseEnter={() => setOn(true)}
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
