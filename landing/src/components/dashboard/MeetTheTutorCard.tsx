import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { WispOrb } from "../tutor/WispOrb";
import {
  getSharedAudioElement,
  primeAudioGraph,
} from "../../lib/audio/audioBus";
import { createVoicePreviewWavUrl } from "../../lib/audio/voicePreviewSample";
import { authedFetch } from "../../lib/api";

/**
 * Full-bleed desk hero: the wisp is the product moment — always drifting in
 * the shader (see public/wisp/main.js), faster when audio plays. CTAs sit in
 * the margin; session detail stays below on the dashboard.
 *
 * "hear the voice" button:
 *   1. POST /api/audio/preview → real ElevenLabs MP3 (the tutor voice).
 *   2. If that fails (TTS not configured, network), fall back to a local
 *      synthesised hum so the orb still moves and the demo never goes silent.
 */
export function MeetTheTutorCard() {
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "loading" | "live" | "fallback" | "error"
  >("idle");
  const previewUrlRef = useRef<string | null>(null);
  const liveUrlRef = useRef<string | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      if (liveUrlRef.current) {
        URL.revokeObjectURL(liveUrlRef.current);
        liveUrlRef.current = null;
      }
      inFlightRef.current?.abort();
    };
  }, []);

  const playSynthFallback = useCallback(async () => {
    const el = getSharedAudioElement();
    if (!previewUrlRef.current) {
      previewUrlRef.current = createVoicePreviewWavUrl();
    }
    el.pause();
    el.src = previewUrlRef.current;
    el.currentTime = 0;
    await el.play();
  }, []);

  const playPreview = useCallback(async () => {
    inFlightRef.current?.abort();
    const ac = new AbortController();
    inFlightRef.current = ac;

    try {
      await primeAudioGraph();
    } catch (e) {
      console.warn("[MeetTheTutorCard] audio graph prime failed", e);
    }

    setPlaying(true);
    setStatus("loading");

    // Try real ElevenLabs first. We pass an empty body so the API picks the
    // canned line — keeps the surface honest about what ione will actually
    // sound like during a session.
    try {
      const res = await authedFetch("/api/audio/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: ac.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`preview ${res.status}: ${detail.slice(0, 200)}`);
      }
      const blob = await res.blob();
      if (ac.signal.aborted) return;
      if (liveUrlRef.current) URL.revokeObjectURL(liveUrlRef.current);
      liveUrlRef.current = URL.createObjectURL(blob);

      const el = getSharedAudioElement();
      el.pause();
      el.src = liveUrlRef.current;
      el.currentTime = 0;
      await el.play();
      setStatus("live");
      return;
    } catch (e) {
      if (ac.signal.aborted) return;
      console.warn(
        "[MeetTheTutorCard] elevenlabs preview failed, falling back to synth",
        e,
      );
    }

    // Fallback — keeps the orb alive even when TTS is offline.
    try {
      await playSynthFallback();
      setStatus("fallback");
    } catch (e) {
      console.warn("[MeetTheTutorCard] fallback play failed", e);
      setPlaying(false);
      setStatus("error");
    }
  }, [playSynthFallback]);

  useEffect(() => {
    const el = getSharedAudioElement();
    const onEnd = () => setPlaying(false);
    el.addEventListener("ended", onEnd);
    el.addEventListener("pause", onEnd);
    return () => {
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("pause", onEnd);
    };
  }, []);

  return (
    <section
      className="relative w-screen max-w-[100vw] left-1/2 -translate-x-1/2 border-y border-line bg-paper"
      aria-labelledby="meet-tutor-heading"
    >
      <div className="relative max-w-[1400px] mx-auto px-5 sm:px-10 lg:px-14 py-12 sm:py-16 lg:py-20">
        <div className="section-label-light mb-6 sm:mb-8 text-center lg:text-left">
          © ione — the tutor
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          {/* Orb — dominant column */}
          <div className="lg:col-span-7 order-2 lg:order-1">
            <div
              className="wisp-port-shell relative mx-auto w-full max-w-[min(92vw,720px)] lg:max-w-none aspect-[4/3] lg:aspect-[5/4] lg:min-h-[min(58vh,640px)]"
              style={{ contain: "layout paint" }}
            >
              <div className="wisp-port-inner">
                <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-4">
                  <div className="w-[min(94%,560px)] aspect-square max-h-full bg-black">
                    <WispOrb
                      fill
                      minFill={220}
                      ariaLabel="ione voice orb — always in motion; speeds up when it speaks"
                    />
                  </div>
                </div>
                <p className="absolute bottom-3 left-0 right-0 text-center font-sub text-[9px] tracking-[0.2em] uppercase text-paper-dim/80 pointer-events-none">
                  idle drift · accelerates on voice
                </p>
              </div>
            </div>
          </div>

          {/* Copy + actions */}
          <div className="lg:col-span-5 order-1 lg:order-2 text-center lg:text-left">
            <h2
              id="meet-tutor-heading"
              className="h-display-light text-[clamp(2.1rem,5vw,3.4rem)] leading-[0.98] mb-4 sm:mb-5"
              style={{ fontStyle: "italic" }}
            >
              this is the <em className="h-forest">main show.</em>
            </h2>
            <p className="text-paper-faint text-base sm:text-lg leading-relaxed max-w-[46ch] mx-auto lg:mx-0 mb-8">
              the orb never fully rests — it keeps a slow, living drift. when
              ione speaks (preview or a real session), the same field spins up.
              then step into the room and share your iPad.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-center lg:justify-start gap-3">
              <button
                type="button"
                onClick={() => void playPreview()}
                disabled={playing}
                className="cta-light px-6 py-3 font-sub text-[11px] tracking-[0.18em] uppercase justify-center disabled:opacity-50"
              >
                {status === "loading"
                  ? "loading voice…"
                  : playing
                    ? "playing…"
                    : "hear the voice"}
              </button>
              <Link
                to="/tutor"
                className="inline-flex items-center justify-center gap-2 cta-light px-6 py-3 font-sub text-[11px] tracking-[0.18em] uppercase border-red-pencil text-red-pencil hover:bg-red-pencil hover:text-paper hover:border-red-pencil"
              >
                open tutor · agents room →
              </Link>
            </div>
            <p
              className="font-sub text-[10px] tracking-wide text-paper-mute mt-4 h-4 max-w-[42ch] mx-auto lg:mx-0 leading-relaxed"
              aria-live="polite"
            >
              {status === "live"
                ? "live · streamed from elevenlabs (voice id jqcCZkN6…)"
                : status === "fallback"
                  ? "tts unreachable — playing local synth so the orb still moves"
                  : status === "error"
                    ? "audio failed to start — check console / try again"
                    : ""}
            </p>
            <p className="font-sub text-[10px] tracking-wide text-paper-mute mt-4 max-w-[42ch] mx-auto lg:mx-0 leading-relaxed">
              screen capture and "start session" live on the next page — this
              strip is the first thing you feel.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
