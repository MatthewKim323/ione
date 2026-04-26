import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Marginalia, HandUnderline } from "../design/Marginalia";
import { MathInText } from "../design/Math";
import type { CycleEvent } from "../../lib/tutor/cycleClient";
import { playHintAudio, type AudioController } from "../../lib/tutor/audioStream";

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
};

const PREFIX_BY_TYPE: Record<SurfacedHint["hint_type"], string> = {
  error_callout: "wait —",
  scaffolding_question: "try this —",
  encouragement: "good —",
  redirect: "back up —",
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [phase, setPhase] = useState<"in" | "out">("in");

  // 6s linger then fade.
  useEffect(() => {
    const t = setTimeout(() => setPhase("out"), 6000);
    return () => clearTimeout(t);
  }, [hint.id]);

  // Play TTS if available.
  useEffect(() => {
    if (audioMuted || !hint.audio_url) return;
    if (!audioRef.current) return;
    let controller: AudioController | null = null;
    (async () => {
      try {
        controller = await playHintAudio({
          hintId: hint.id,
          audioEl: audioRef.current!,
        });
      } catch (e) {
        console.warn("[hint] audio play failed", e);
      }
    })();
    return () => {
      controller?.stop();
    };
  }, [hint.id, hint.audio_url, audioMuted]);

  const tone = TONE_BY_TYPE[hint.hint_type];
  const prefix = hint.predicted ? "before — " : PREFIX_BY_TYPE[hint.hint_type];
  const rotation = -1.5 + (hint.id.charCodeAt(0) % 7) / 5; // slight per-hint variance

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
        <span className="block text-[20px] leading-[1.18] tracking-[0.005em]">
          <span className="opacity-65">{prefix}</span>{" "}
          <MathInText text={hint.text} />
        </span>
      </Marginalia>

      <div className="mt-1.5 ml-1 max-w-[180px]">
        <HandUnderline color={`var(--color-${tone === "graphite" ? "paper-faint" : tone})`} />
      </div>

      {/* hidden audio sink */}
      <audio
        ref={audioRef}
        className="hidden"
        preload="none"
        playsInline
      />
    </motion.div>
  );
}
