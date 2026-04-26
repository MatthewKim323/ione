import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Marginalia, HandUnderline } from "../design/Marginalia";
import { MathInText } from "../design/Math";
import type { CycleEvent } from "../../lib/tutor/cycleClient";
import { playHintAudio, type AudioController } from "../../lib/tutor/audioStream";
import {
  getSharedAudioElement,
  primeAudioGraph,
} from "../../lib/audio/audioBus";

/**
 * One hint card — slides in from the right margin, sits for 6s, then fades
 * out unless replaced by a fresher hint. Caveat font, slight rotation, soft
 * red-pencil ink — feels hand-written.
 *
 * Audio: when `hint.audio_url` is set, we open a streaming MP3 fetch via
 * audioStream.ts and play through a hidden <audio>. The audio_url shape is
 * `/api/audio/:hintId` — the actual blob is auth-fetched.
 */

export type SurfacedHint = Extract<CycleEvent, { type: "hint" }>;

const TONE_BY_TYPE: Record<
  SurfacedHint["hint_type"],
  "red-pencil" | "graphite" | "brass" | "moss"
> = {
  error_callout: "red-pencil",
  scaffolding_question: "brass",
  encouragement: "moss",
  redirect: "red-pencil",
  // Brass for explanations — warm/instructional, contrasted against the
  // alarm-red of error callouts. Reads as "let me teach you" instead of
  // "you've made a mistake".
  explanation: "brass",
};

const PREFIX_BY_TYPE: Record<SurfacedHint["hint_type"], string> = {
  error_callout: "wait —",
  scaffolding_question: "try this —",
  encouragement: "good —",
  redirect: "back up —",
  // Different framing for the user-asked-for-help case. "here's how —"
  // signals a walkthrough, not a Socratic question. The "(you asked)"
  // tag below is what makes the audience trust this wasn't ione barging
  // in — the student requested it.
  explanation: "here's how —",
};

/**
 * Hints linger on screen for 6s by default, but explanations are 2-6
 * sentences of math walkthrough — the student needs longer to read +
 * apply. 12s gives them time to digest before the card fades.
 */
const LINGER_MS_BY_TYPE: Record<SurfacedHint["hint_type"], number> = {
  error_callout: 6000,
  scaffolding_question: 6000,
  encouragement: 5000,
  redirect: 6000,
  explanation: 12000,
};

export function HintCard({
  hint,
  onDismiss,
  audioMuted,
}: {
  hint: SurfacedHint;
  onDismiss: (id: string) => void;
  audioMuted: boolean;
}) {
  const [phase, setPhase] = useState<"in" | "out">("in");

  // Linger then fade. Explanation cards stick around 2x longer because
  // they're 2-6 sentences of teaching, not a one-line nudge.
  useEffect(() => {
    const lingerMs = LINGER_MS_BY_TYPE[hint.hint_type] ?? 6000;
    const t = setTimeout(() => setPhase("out"), lingerMs);
    return () => clearTimeout(t);
  }, [hint.id, hint.hint_type]);

  // Play TTS through the shared AudioBus element so the wisp orb's
  // AnalyserNode tap sees the same waveform. We don't keep our own <audio>
  // ref anymore — that would route audio through a second element the
  // analyser can't see, leaving the orb idle while ElevenLabs is talking.
  useEffect(() => {
    if (audioMuted || !hint.audio_url) return;
    let controller: AudioController | null = null;
    let cancelled = false;
    (async () => {
      try {
        // Prime the WebAudio graph BEFORE play() so the analyser is wired
        // before the first sample lands. We're still inside a user-gesture
        // chain here (HintCard mounts in response to the SSE event that
        // followed a click-to-start-session), so AudioContext won't throw.
        await primeAudioGraph();
        if (cancelled) return;
        const audioEl = getSharedAudioElement();
        controller = await playHintAudio({
          hintId: hint.id,
          audioEl,
        });
      } catch (e) {
        console.warn("[hint] audio play failed", e);
      }
    })();
    return () => {
      cancelled = true;
      controller?.stop();
    };
  }, [hint.id, hint.audio_url, audioMuted]);

  const tone = TONE_BY_TYPE[hint.hint_type];
  const prefix = hint.predicted ? "before — " : PREFIX_BY_TYPE[hint.hint_type];
  const isExplanation = hint.hint_type === "explanation" || hint.assistance === "explain";
  // Explanations sit straighter (less rotation) — they're meant to read
  // like a tutor's clean walkthrough, not a quick scribble. Autonomous
  // hints keep their slight per-hint variance for that "real handwriting"
  // feel.
  const rotation = isExplanation
    ? -0.5
    : -1.5 + (hint.id.charCodeAt(0) % 7) / 5;
  // Explanation cards are wider and contain multi-line content (the
  // walkthrough often has \n-separated steps). The default underline
  // width caps at 180px which looks weak under a 4-line card; widen it.
  const underlineMaxWidth = isExplanation ? "max-w-[260px]" : "max-w-[180px]";

  return (
    <motion.div
      key={hint.id}
      initial={{ opacity: 0, x: 24, y: -4 }}
      animate={{
        opacity: phase === "in" ? 1 : 0,
        x: phase === "in" ? 0 : 16,
        y: phase === "in" ? 0 : -2,
      }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      onAnimationComplete={() => {
        if (phase === "out") onDismiss(hint.id);
      }}
      className="relative pl-4 pr-2 py-3"
    >
      {hint.predicted && (
        <span className="absolute -left-2 top-3 block w-1 h-1 rounded-full bg-brass" />
      )}
      <Marginalia rotation={rotation} tone={tone}>
        <span
          className="block leading-[1.18] tracking-[0.005em]"
          style={{
            // Explanations get a slightly smaller font (18px vs 20px) so
            // 2-6 sentences fit in the marginalia without spilling. They
            // also use whitespace-pre-wrap so newline-separated steps
            // render as an actual mini-list instead of one wall.
            fontSize: isExplanation ? "18px" : "20px",
            whiteSpace: isExplanation ? "pre-wrap" : "normal",
          }}
        >
          <span className="opacity-65">{prefix}</span>{" "}
          <MathInText text={hint.text} />
        </span>
      </Marginalia>

      {/* Footer tag for user-requested explanations — proves to the demo
          audience that this hint wasn't ione barging in; the student
          asked. Tiny, italic, brass — sits below the underline like a
          tutor's signature on a worked example. */}
      {isExplanation && (
        <div
          className="mt-1 ml-1 italic opacity-70"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--color-brass)",
            letterSpacing: "0.02em",
          }}
        >
          you asked — full walkthrough
        </div>
      )}

      <div className={`mt-1.5 ml-1 ${underlineMaxWidth}`}>
        <HandUnderline color={`var(--color-${tone === "graphite" ? "paper-faint" : tone})`} />
      </div>
      {/* No local <audio> — see ../../lib/audio/audioBus for the singleton sink. */}
    </motion.div>
  );
}
