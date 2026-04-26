/**
 * Browser capability detection for /tutor.
 *
 * Phase 5 / R3: ione's capture loop relies on three modern web APIs that
 * still vary by browser/version:
 *   - navigator.mediaDevices.getDisplayMedia  (screen capture)
 *   - MediaSource                             (audio streaming for TTS)
 *   - HTMLCanvasElement.toBlob with image/webp (frame encoding)
 *
 * If any are missing we want to *softly* tell the student to switch to
 * Chrome 120+ instead of crashing the page. The detection runs on /tutor
 * mount and surfaces a banner; we do NOT block the rest of the app.
 *
 * Detection is best-effort — we never call getDisplayMedia here (that
 * triggers a permissions prompt). Just feature-test for shape.
 */

export type BrowserCapability =
  | "getDisplayMedia"
  | "mediaSource"
  | "webp"
  | "audioContext";

export interface BrowserSupportReport {
  ok: boolean;
  missing: BrowserCapability[];
  /** Friendly UA hint for the banner copy. */
  uaHint: string;
}

/**
 * One-shot capability probe. Pure, no side effects, safe to call inside
 * useEffect/useState initializers.
 */
export function probeBrowserSupport(): BrowserSupportReport {
  const missing: BrowserCapability[] = [];

  // SSR / non-browser guard.
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return { ok: false, missing: ["getDisplayMedia"], uaHint: "non-browser" };
  }

  if (
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getDisplayMedia !== "function"
  ) {
    missing.push("getDisplayMedia");
  }

  if (typeof window.MediaSource === "undefined") {
    missing.push("mediaSource");
  }

  // WebP encoding via canvas — required for cycle frame uploads.
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const dataUrl = canvas.toDataURL("image/webp");
    if (!dataUrl.startsWith("data:image/webp")) {
      missing.push("webp");
    }
  } catch {
    missing.push("webp");
  }

  if (
    typeof window.AudioContext === "undefined" &&
    typeof (window as unknown as { webkitAudioContext?: unknown })
      .webkitAudioContext === "undefined"
  ) {
    missing.push("audioContext");
  }

  return {
    ok: missing.length === 0,
    missing,
    uaHint: shortUA(navigator.userAgent ?? ""),
  };
}

function shortUA(ua: string): string {
  if (!ua) return "unknown browser";
  if (/Edg\//.test(ua)) {
    const m = /Edg\/(\d+)/.exec(ua);
    return m ? `Edge ${m[1]}` : "Edge";
  }
  if (/Chrome\//.test(ua)) {
    const m = /Chrome\/(\d+)/.exec(ua);
    return m ? `Chrome ${m[1]}` : "Chrome";
  }
  if (/Firefox\//.test(ua)) {
    const m = /Firefox\/(\d+)/.exec(ua);
    return m ? `Firefox ${m[1]}` : "Firefox";
  }
  if (/Safari\//.test(ua) && /Version\//.test(ua)) {
    const m = /Version\/(\d+)/.exec(ua);
    return m ? `Safari ${m[1]}` : "Safari";
  }
  return "your browser";
}

/**
 * Human copy for a missing capability. Used by the banner.
 */
export function describeMissing(missing: BrowserCapability[]): string {
  if (missing.includes("getDisplayMedia")) {
    return "your browser can't share a screen window with ione.";
  }
  if (missing.includes("webp")) {
    return "your browser can't encode the WebP frames ione expects.";
  }
  if (missing.includes("mediaSource")) {
    return "your browser can't stream the tutor's voice.";
  }
  if (missing.includes("audioContext")) {
    return "your browser is missing audio playback support.";
  }
  return "your browser is missing a feature ione needs.";
}
