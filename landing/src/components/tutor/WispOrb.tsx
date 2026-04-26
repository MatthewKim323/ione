import { useEffect, useRef, useState } from "react";
import { subscribeAudioLevel } from "../../lib/audio/audioBus";

/**
 * WispOrb — the lavender flower orb that pulses on TTS playback.
 *
 * Rendered as an iframe pointing at /wisp/index.html (a static Three.js
 * shader project served from landing/public/wisp/). We intentionally avoid
 * bundling Three.js into the main React graph — the Wisp project ships its
 * own bundled vendor copy and the iframe boundary keeps WebGL contexts /
 * shader compilation off the critical render path of the rest of the app.
 *
 * Communication is one-way:
 *   parent → iframe :: window.postMessage
 *     { type: "AUDIO_LEVEL", value: 0..1 }   on every animation frame while
 *                                             ElevenLabs hint audio is playing
 *     { type: "AUDIO_STOP" }                 once on idle (orb breathes back)
 *
 * The iframe's main.js (see landing/public/wisp/main.js) listens for these
 * and modulates particle scale, animation speed, and Z-axis roll.
 *
 * Idle state is *not* "no message at all" — the iframe expects periodic
 * AUDIO_LEVEL frames and decays toward zero on its own if it misses 250ms.
 * We let that happen naturally; cleaner than synthesizing fake low-amplitude
 * messages from the React side.
 */

export function WispOrb({
  className,
  size = 280,
  fill = false,
  minFill = 280,
  ariaLabel = "ione voice orb",
}: {
  className?: string;
  /** Fixed square size in px (default). Ignored when `fill` is true. */
  size?: number;
  /** Stretch to parent width/height; parent should set height or aspect. */
  fill?: boolean;
  /** Minimum box edge when `fill` (px). */
  minFill?: number;
  ariaLabel?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // Once the iframe document is loaded we can safely postMessage to it.
  // Attempting to post before "load" is silently dropped (no error, but the
  // listener inside main.js hasn't registered yet) — this guards startup
  // races where a hint arrives almost simultaneously with mount.
  const [ready, setReady] = useState(false);

  // Bridge: every audio-bus tick, forward to the iframe (wisp handles visuals).
  useEffect(() => {
    const unsub = subscribeAudioLevel((value, isPlaying) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      if (!ready) return;
      if (isPlaying || value > 0.01) {
        win.postMessage({ type: "AUDIO_LEVEL", value }, "*");
      } else {
        // Single STOP message rather than spamming zero-valued levels —
        // matches the iframe's own decay path.
        win.postMessage({ type: "AUDIO_STOP" }, "*");
      }
    });
    return unsub;
  }, [ready]);

  const boxStyle = fill
    ? {
        position: "relative" as const,
        width: "100%",
        height: "100%",
        minHeight: minFill,
        contain: "layout paint" as const,
      }
    : {
        position: "relative" as const,
        width: size,
        height: size,
        contain: "layout paint" as const,
      };

  return (
    <div
      className={className}
      style={boxStyle}
      aria-label={ariaLabel}
      role="img"
    >
      <iframe
        ref={iframeRef}
        title="wisp"
        src="/wisp/index.html"
        onLoad={() => setReady(true)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          border: 0,
          background: "transparent",
          pointerEvents: "none",
        }}
        // First-party /wisp bundle: needs scripts + same origin so module
        // graph and WebGL behave like a normal app tab (opaque sandbox origins
        // can break GPU paths on some browsers). Content is static assets only.
        sandbox="allow-scripts allow-same-origin"
        loading="eager"
      />
    </div>
  );
}
