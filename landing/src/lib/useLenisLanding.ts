import { useEffect } from "react";
import Lenis from "lenis";
import { SKIP_FX } from "./prerender";

/**
 * Inertial smooth scroll for the marketing landing only.
 * Lower `lerp` / `wheelMultiplier` = heavier, slower catch-up (luxury feel).
 * Skipped for `?nofx` / SKIP_FX so scrub tooling and reduced surprises stay native.
 */
export function useLenisLanding() {
  useEffect(() => {
    if (SKIP_FX) return;
    if (document.documentElement.classList.contains("nofx")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      autoRaf: true,
      // default ~0.1 — pull down for more “weight” and glide
      lerp: 0.048,
      wheelMultiplier: 0.66,
      touchMultiplier: 0.82,
      smoothWheel: true,
      syncTouch: false,
      anchors: true,
      orientation: "vertical",
      gestureOrientation: "vertical",
    });

    return () => {
      lenis.destroy();
    };
  }, []);
}
