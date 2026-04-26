/**
 * AudioBus — a singleton that owns the tutor surface's shared `<audio>`
 * element, a Web Audio AnalyserNode tapped off it, and a frame loop that
 * publishes a normalized 0..1 amplitude to every subscriber.
 *
 * Why this exists:
 *   • The wisp orb (`WispOrb`) needs to react to whatever TTS is playing.
 *     It can't reach into individual `HintCard` <audio> refs.
 *   • Each `HintCard` previously created its own <audio>, which meant overlap-
 *     ping hints would step on each other and there was no single audio-graph
 *     anchor the orb could attach to.
 *
 * Design:
 *   1. Lazy-create one shared `<audio>` element appended to <body>. HintCards
 *      ask for it via `getSharedAudioElement()` and pipe ElevenLabs TTS in.
 *   2. On first user gesture (HintCard.play()), we create an AudioContext,
 *      a MediaElementSource off the <audio>, and an AnalyserNode. Browsers
 *      block AudioContext creation outside a gesture — we deliberately defer.
 *   3. A single `requestAnimationFrame` loop reads the analyser's time-domain
 *      bytes, computes RMS, smooths it, and broadcasts to subscribers.
 *   4. `subscribe(fn) -> unsubscribe` is the only public listener API. The
 *      orb subscribes; nothing else needs to.
 *
 * The bus survives across HintCard mount/unmount — that's the whole point. We
 * never destroy the audio element so the WebAudio graph stays warm and the
 * iframe doesn't lose visualization between hints.
 */

type LevelListener = (level: number, isPlaying: boolean) => void;

type BusState = {
  audioEl: HTMLAudioElement;
  context: AudioContext | null;
  analyser: AnalyserNode | null;
  source: MediaElementAudioSourceNode | null;
  // Backed by a concrete ArrayBuffer (not the default ArrayBufferLike) so
  // AnalyserNode.getByteTimeDomainData accepts it under TS 5.x's stricter
  // typed-array generics.
  buffer: Uint8Array<ArrayBuffer> | null;
  rafId: number | null;
  listeners: Set<LevelListener>;
  smoothed: number;
  /** True only while audio is actively rendering frames. */
  playing: boolean;
};

let state: BusState | null = null;

function ensureElement(): HTMLAudioElement {
  if (typeof document === "undefined") {
    // SSR-safe: return a stub. Server renders never call subscribe().
    throw new Error("audioBus accessed outside browser context");
  }
  if (state?.audioEl) return state.audioEl;

  const el = document.createElement("audio");
  el.id = "tutor-shared-audio";
  // Hidden but in-document so play()/pause() reflect at the OS level
  // (Picture-in-Picture, media keys, MSE attachment all need a real element).
  el.preload = "none";
  // `playsInline` is HTMLVideoElement-only in lib.dom.d.ts but Safari
  // exposes it on <audio> too — safe to set via attribute.
  el.setAttribute("playsinline", "");
  el.controls = false;
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.width = "1px";
  el.style.height = "1px";
  el.style.opacity = "0";
  el.setAttribute("aria-hidden", "true");
  document.body.appendChild(el);

  if (!state) {
    state = {
      audioEl: el,
      context: null,
      analyser: null,
      source: null,
      buffer: null,
      rafId: null,
      listeners: new Set(),
      smoothed: 0,
      playing: false,
    };
  } else {
    state.audioEl = el;
  }

  // Attach lifecycle handlers once, on the canonical element. We use
  // playing/pause/ended to flip the `playing` flag — that gates whether the
  // rAF loop publishes idle-zero or real amplitude. Using "playing" rather
  // than "play" matters because "play" fires before the decoder produces
  // samples, which would briefly show a frozen orb.
  el.addEventListener("playing", () => {
    if (!state) return;
    state.playing = true;
    startLoop();
  });
  el.addEventListener("pause", () => {
    if (!state) return;
    state.playing = false;
  });
  el.addEventListener("ended", () => {
    if (!state) return;
    state.playing = false;
  });

  return el;
}

/**
 * Lazily build the WebAudio graph. Browsers throw `NotAllowedError` if you
 * `new AudioContext()` outside a user gesture, so we defer this until the
 * first `play()` call after a click. Idempotent — subsequent calls reuse the
 * existing context.
 */
async function ensureGraph(): Promise<void> {
  if (!state) ensureElement();
  const s = state!;
  if (s.context && s.analyser) return;

  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return; // very old browser — orb just won't react.
    s.context = new Ctx();

    // FFT size 1024 → 512 bins of time-domain bytes. We only need RMS, so
    // resolution isn't critical; this is a balance between CPU and how
    // jittery a single frame's amplitude reads.
    s.analyser = s.context.createAnalyser();
    s.analyser.fftSize = 1024;
    s.analyser.smoothingTimeConstant = 0.6;
    // Backed by a concrete ArrayBuffer (not the default ArrayBufferLike)
    // so getByteTimeDomainData accepts the typed-array under TS 5.x.
    s.buffer = new Uint8Array(new ArrayBuffer(s.analyser.frequencyBinCount));

    s.source = s.context.createMediaElementSource(s.audioEl);
    s.source.connect(s.analyser);
    s.analyser.connect(s.context.destination);
  } catch (e) {
    // MediaElementSource throws if the element was already routed into a
    // different context — should be impossible since we own the element,
    // but log loudly if it happens so we can debug.
    console.warn("[audioBus] failed to build graph", e);
  }

  if (s.context && s.context.state === "suspended") {
    await s.context.resume().catch(() => {});
  }
}

function startLoop(): void {
  const s = state;
  if (!s || s.rafId !== null) return;

  const tick = () => {
    if (!state) return;
    const cur = state;

    let raw = 0;
    if (cur.playing && cur.analyser && cur.buffer) {
      cur.analyser.getByteTimeDomainData(cur.buffer);
      // RMS of the centered waveform. Time-domain bytes are 0..255 with 128
      // as silence. We map (b - 128) / 128 ∈ [-1, 1] and square-mean-root.
      let sumSq = 0;
      const buf = cur.buffer;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i]! - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / buf.length);
      // Speech RMS rarely exceeds ~0.35; scale so typical voice peaks hit
      // ~0.8 (leaving headroom for emphasis without saturating the orb).
      raw = Math.min(1, rms * 2.6);
    }

    // Asymmetric ease: snap up on syllable onsets, fade slowly so the orb
    // doesn't strobe. These constants were chosen empirically against the
    // ElevenLabs flash_v2_5 voice and feel natural with `audioLevel ↦ scale`
    // wired in main.js.
    const k = raw > cur.smoothed ? 0.45 : 0.10;
    cur.smoothed += (raw - cur.smoothed) * k;

    // If we've fully decayed and audio isn't playing, suspend the rAF loop
    // to save CPU. Subscribers still get a final 0 push so the orb settles.
    const shouldStop =
      !cur.playing && cur.smoothed < 0.005 && raw < 0.005;

    if (shouldStop) {
      cur.smoothed = 0;
    }

    for (const fn of cur.listeners) {
      try {
        fn(cur.smoothed, cur.playing);
      } catch (e) {
        console.warn("[audioBus] listener threw", e);
      }
    }

    if (shouldStop) {
      cur.rafId = null;
      return;
    }
    cur.rafId = requestAnimationFrame(tick);
  };

  s.rafId = requestAnimationFrame(tick);
}

/**
 * Returns the singleton tutor `<audio>` element. Call this from HintCard /
 * any other audio source instead of constructing your own — that's the
 * contract the orb relies on.
 */
export function getSharedAudioElement(): HTMLAudioElement {
  return ensureElement();
}

/**
 * Subscribe to amplitude updates. Call inside a useEffect; the cleanup must
 * call the returned unsubscribe so we don't leak listeners on unmount.
 */
export function subscribeAudioLevel(fn: LevelListener): () => void {
  if (!state) ensureElement();
  state!.listeners.add(fn);
  return () => {
    state?.listeners.delete(fn);
  };
}

/**
 * Eagerly attach the WebAudio graph. HintCard calls this after a successful
 * play() so the analyser starts capturing immediately. Idempotent.
 */
export async function primeAudioGraph(): Promise<void> {
  await ensureGraph();
  startLoop();
}

/**
 * Diagnostic — exposed for tests / dev panels. Don't use in feature code;
 * subscribers should always go through `subscribeAudioLevel`.
 */
export function audioBusDebug(): {
  hasContext: boolean;
  hasAnalyser: boolean;
  listeners: number;
  playing: boolean;
  level: number;
} {
  if (!state) return {
    hasContext: false, hasAnalyser: false, listeners: 0, playing: false, level: 0,
  };
  return {
    hasContext: state.context !== null,
    hasAnalyser: state.analyser !== null,
    listeners: state.listeners.size,
    playing: state.playing,
    level: state.smoothed,
  };
}
