import { useEffect, useRef } from "react";

interface InteractiveGradientProps {
  /** Tailwind className for sizing / positioning. */
  className?: string;
  /** Inline overrides — useful for absolute positioning. */
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
 * Cursor tracking is done on `window` rather than the element itself, so it
 * keeps responding even when other content is layered on top with a higher
 * z-index (which is the common case when this is used as a section bg).
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

    // Listen on the window so the gradient stays interactive even when
    // content is stacked on top of it (z-index, pointer-events: none, etc).
    function onMove(e: MouseEvent) {
      const rect = el!.getBoundingClientRect();
      // Clamp so leaving the element to one side doesn't yank orbs to a
      // wild value far outside [0, 1].
      const x = (e.clientX - rect.left) / Math.max(1, rect.width);
      const y = (e.clientY - rect.top) / Math.max(1, rect.height);
      tx = x < -0.5 ? -0.5 : x > 1.5 ? 1.5 : x;
      ty = y < -0.5 ? -0.5 : y > 1.5 ? 1.5 : y;
    }

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

    window.addEventListener("mousemove", onMove, { passive: true });

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
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
        // Cool purple palette: deep violet, periwinkle, electric lavender,
        // over a soft cream-to-lavender base.
        background: [
          "radial-gradient(55% 55% at var(--g0x, 28%) var(--g0y, 32%)," +
            " rgba(124, 58, 237, 0.65)," +  // violet-600
            " rgba(124, 58, 237, 0.0) 70%)",
          "radial-gradient(55% 55% at var(--g1x, 78%) var(--g1y, 42%)," +
            " rgba(99, 102, 241, 0.60)," + // indigo-500
            " rgba(99, 102, 241, 0.0) 70%)",
          "radial-gradient(60% 60% at var(--g2x, 50%) var(--g2y, 78%)," +
            " rgba(167, 139, 250, 0.55)," + // violet-400 / lavender
            " rgba(167, 139, 250, 0.0) 70%)",
          "linear-gradient(135deg, #ece7f5 0%, #e2dcf0 100%)",
        ].join(", "),
        filter: "saturate(1.05)",
        ...style,
      }}
    />
  );
}
