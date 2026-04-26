import { useCallback, useState, type CSSProperties, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Base wrapper styles (e.g. overflow). */
  style?: CSSProperties;
};

/**
 * Soft purple/violet wash that follows the pointer on hover (multiply blend on #f2f2f2).
 */
export function InteractiveGradient({ children, className = "", style }: Props) {
  const [on, setOn] = useState(false);
  const [g, setG] = useState({ x: 50, y: 45 });

  const move = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setG({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    });
  }, []);

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
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-500 ease-out"
        style={{
          opacity: on ? 1 : 0,
          background: `radial-gradient(ellipse 85% 70% at ${g.x}% ${g.y}%, rgba(124, 58, 237, 0.26) 0%, rgba(99, 102, 241, 0.12) 38%, rgba(196, 181, 253, 0.04) 55%, transparent 72%)`,
          mixBlendMode: "multiply",
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
