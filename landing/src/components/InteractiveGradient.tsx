import { useEffect, useRef } from "react";

interface InteractiveGradientProps {
  /** Tailwind className for sizing / positioning. */
  className?: string;
  /** Inline overrides — useful for absolute positioning in an asymmetric layout. */
  style?: React.CSSProperties;
  /** Drift speed (lower = slower). Default: 0.00018 */
  drift?: number;
  /** Lerp factor toward the mouse target (lower = more inertia). Default: 0.04 */
  lerp?: number;
}

/**
 * A self-contained interactive animated gradient — three soft radial-gradient
 * orbs over a paper-tinted base.  The orb anchors slowly drift on a sine
 * loop, and each orb leans toward the cursor by a different weight so the
 * field reshapes as the user moves through it.
 *
 * No external runtime — drops into any React tree.  Inspired by the Framer
 * "Interactive animated gradient" module the user linked, but written
 * locally because Framer's hosted ESM modules require Framer's runtime.
 */
export function InteractiveGradient({
  className = "",
  style,
  drift = 0.00018,
  lerp = 0.04,
}: InteractiveGradientProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Per-orb mouse-following weight: orb 0 follows tightly, orb 2 lags.
    const weights = [0.55, 0.35, 0.2];

    // Base anchors (in 0..1 coords) for the three orbs. Drift loops add a
    // gentle sine-wave offset to each.
    const bases = [
      { x: 0.28, y: 0.32 },
      { x: 0.78, y: 0.42 },
      { x: 0.5, y: 0.78 },
    ];

    let mx = 0.5;
    let my = 0.5;
    let tx = 0.5;
    let ty = 0.5;

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      tx = (e.clientX - rect.left) / rect.width;
      ty = (e.clientY - rect.top) / rect.height;
    };
    const onLeave = () => {
      // Glide back to center when the cursor leaves.
      tx = 0.5;
      ty = 0.5;
    };

    let raf = 0;
    let running = true;
    const start = performance.now();

    function tick(now: number) {
      if (!running) return;
      mx += (tx - mx) * lerp;
      my += (ty - my) * lerp;
      const t = (now - start) * drift;

      bases.forEach((base, i) => {
        const w = weights[i];
        // Sine-wave drift on each orb, phase-offset so they don't move in lockstep.
        const dx = Math.sin(t + i * 1.7) * 0.09;
        const dy = Math.cos(t * 0.8 + i * 2.3) * 0.07;
        const x = base.x + dx + (mx - 0.5) * w;
        const y = base.y + dy + (my - 0.5) * w;
        el!.style.setProperty(`--g${i}x`, `${(x * 100).toFixed(2)}%`);
        el!.style.setProperty(`--g${i}y`, `${(y * 100).toFixed(2)}%`);
      });

      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [drift, lerp]);

  return (
    <div
      ref={ref}
      aria-hidden
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        // Three colored orbs over a warm paper base. Colors picked from
        // the page's red-pencil / brass / moss palette so the gradient
        // doesn't fight the rest of the design.
        background: [
          "radial-gradient(50% 55% at var(--g0x, 28%) var(--g0y, 32%)," +
            " rgba(196, 64, 64, 0.55)," +
            " rgba(196, 64, 64, 0.0) 70%)",
          "radial-gradient(55% 50% at var(--g1x, 78%) var(--g1y, 42%)," +
            " rgba(196, 168, 94, 0.55)," +
            " rgba(196, 168, 94, 0.0) 70%)",
          "radial-gradient(50% 55% at var(--g2x, 50%) var(--g2y, 78%)," +
            " rgba(120, 138, 90, 0.50)," +
            " rgba(120, 138, 90, 0.0) 70%)",
          "linear-gradient(135deg, #f2f2f2 0%, #ece7df 100%)",
        ].join(", "),
        // Slight overall blur softens the edges of the orbs.
        filter: "saturate(1.05)",
        ...style,
      }}
    />
  );
}
