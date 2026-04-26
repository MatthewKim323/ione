import { useCallback, useEffect, useRef, useState } from "react";
import { useScreenCapture, type RoiRect } from "../../lib/capture";
import {
  type CycleEvent,
  type TrajectoryFrame,
  endSession,
  sendCycle,
  startSession,
} from "../../lib/tutor/cycleClient";
import { isApiError } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { SurfacedHint } from "./HintCard";
import { StallDetector } from "../../lib/tutor/stallDetector";
import { Notebook, NotebookLayout } from "../design/Notebook";
import { HairlineRule } from "../design/HairlineRule";
import { PencilButton } from "../design/PencilButton";
import { ConfidenceRibbon, type ConfidenceLevel } from "./ConfidenceRibbon";
import { HintStack } from "./HintStack";
import { CostMeter, type CostMeterCycle } from "./CostMeter";
import { OcrDebugBanner } from "./OcrDebugBanner";
import { RoiPicker } from "./RoiPicker";
import { BrowserCompatBanner } from "./BrowserCompatBanner";
import { WispOrb } from "./WispOrb";
import { primeAudioGraph } from "../../lib/audio/audioBus";
import { useMicCapture } from "../../lib/audio/useMicCapture";
import { transcribeAudio } from "../../lib/audio/transcribe";
import {
  AgentTrace,
  applyCycleEvent,
  newCycleLog,
  type CycleLog,
} from "./AgentTrace";
import { KGReceipts } from "./KGReceipts";

/**
 * The main /tutor surface. Coordinates:
 *   • Capture loop (lib/capture.ts) → posts encoded frames as cycles.
 *   • cycleClient.ts → SSE stream of CycleEvents.
 *   • StallDetector → stall flags on every cycle.
 *   • HintStack → renders marginalia hints + plays TTS.
 *   • ConfidenceRibbon → ribbon color updates from `confidence` events.
 *
 * Anything that should survive across cycles (trajectory buffer, latest
 * confidence, recent OCR) lives in refs to avoid re-render loops.
 */

type SurfacedHintExtra = SurfacedHint & { received_at: number };

const SurfacedHintEqual = (a: SurfacedHintExtra | null, b: SurfacedHintExtra | null) => {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id;
};

export function TutorWorkspace() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [endingSession, setEndingSession] = useState(false);
  const [confidence, setConfidence] = useState<{
    level: ConfidenceLevel;
    reason: string;
  }>({ level: "graphite", reason: "ready" });
  const [latestHint, setLatestHint] = useState<SurfacedHintExtra | null>(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [demoMode] = useState<boolean>(() => {
    try {
      return new URLSearchParams(window.location.search).get("mode") === "demo";
    } catch {
      return false;
    }
  });
  const [costCycles, setCostCycles] = useState<CostMeterCycle[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [latestOcr, setLatestOcr] = useState<{
    confidence: number;
    /** Single line Sonnet flagged as the student's current step. */
    latex: string | null;
    /** Every prior line OCR saw, in order. Lets the debug banner show the
     *  full chain, not just the line Sonnet picked. */
    completedSteps: string[];
    /** Raw Mathpix transcription for the entire frame. Surfaced when
     *  Sonnet's output is sparse so the user can verify ione actually
     *  read the page. */
    mathpixLatex: string | null;
    mathpixConfidence: number | null;
  } | null>(null);
  const [roi, setRoi] = useState<RoiRect | null>(null);
  const [pickingRoi, setPickingRoi] = useState(false);

  // Live agent-trace log: one CycleLog per /api/cycle request, mutated in
  // place as SSE events stream in. AgentTrace is a thin renderer over this.
  const [cycleLog, setCycleLog] = useState<CycleLog[]>([]);
  // Bumped when a session ends (or starts) so KGReceipts re-fetches the
  // struggle profile after fresh claims have been written.
  const [kgRefreshKey, setKgRefreshKey] = useState(0);

  const trajectoryRef = useRef<TrajectoryFrame[]>([]);
  const stallRef = useRef<StallDetector>(new StallDetector());
  const cycleIndexRef = useRef(0);
  const inFlightRef = useRef(false);
  /**
   * Tracks whether the user-triggered "I need help" path is currently
   * running. Distinct from `inFlightRef` so the help button disables
   * itself (instead of silently dropping). The button itself respects
   * BOTH this and inFlightRef — if an autonomous cycle is mid-flight,
   * it defers with a toast rather than colliding on AgentTrace state.
   */
  const [helpInFlight, setHelpInFlight] = useState(false);

  // Push-to-talk state machine for the voice "ask out loud" path.
  //   recording   → mic is open, audio is being captured
  //   transcribing→ recorder stopped, blob is being sent to /api/transcribe
  //   answering   → transcript landed, cycle is running through agents
  //   idle        → nothing in flight
  // Kept as state (not a ref) so we can render distinct UI affordances
  // and disable the button while busy.
  const [voiceState, setVoiceState] = useState<
    "idle" | "recording" | "transcribing" | "answering"
  >("idle");
  const mic = useMicCapture();

  // Drive a session. We lazy-create on first encoded frame so the user
  // can decline screen share without orphaning a tutor_sessions row.
  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (sessionId) return sessionId;
    try {
      const r = await startSession({
        problem_text: null,
        problem_id: demoMode ? "demo_neg3_distrib" : null,
        demo_mode: demoMode,
      });
      setSessionId(r.session_id);
      stallRef.current.start();
      return r.session_id;
    } catch (e) {
      console.error("[tutor] startSession failed", e);
      // R2: surface "session already active" as a toast so the student
      // sees a friendly message instead of a raw error blob.
      if (isApiError(e) && e.code === "conflict") {
        toast.warn("a tutor session is already running for this account.", {
          id: "session_conflict",
          description: "open it in the other tab, or end it from the dashboard.",
        });
      } else {
        toast.error("couldn't start the session.", {
          id: "session_start_failed",
          description: e instanceof Error ? e.message : String(e),
        });
      }
      return null;
    }
  }, [demoMode, sessionId]);

  // Capture loop wiring. onFrameEncoded fires after the diff gate accepts
  // an image — we feed it directly to /api/cycle.
  const capture = useScreenCapture({
    baseIntervalSec: 8,
    roi,
    onFrameEncoded: (blob, meta) => {
      stallRef.current.noteChange(meta.ts);
      void postCycle(blob);
    },
  });

  const postCycle = useCallback(
    async (
      blob: Blob,
      opts?: {
        assistanceMode?: "explain" | "voice";
        studentQuestion?: string;
      },
    ) => {
      if (inFlightRef.current) return; // serialize for now; Phase 2 / E4 swaps for queue
      const sid = await ensureSession();
      if (!sid) return;
      inFlightRef.current = true;
      try {
        const stall = stallRef.current.snapshot();
        const idx = cycleIndexRef.current++;

        // Seed a new CycleLog *before* the SSE stream opens — that way the
        // AgentTrace shows a fresh row with `OCR · running` the instant the
        // user shares the screen, instead of the rail staying empty until
        // the first event lands ~1s later. We cap to 64 to keep the array
        // bounded; AgentTrace already trims to last 12 for display.
        setCycleLog((prev) => {
          const next = [...prev, newCycleLog(idx)];
          if (next.length > 64) next.splice(0, next.length - 64);
          return next;
        });

        const handle = await sendCycle({
          sessionId: sid,
          frame: blob,
          isStalled: stall.isStalled,
          secondsSinceLastChange: stall.secondsSinceLastChange,
          trajectory: trajectoryRef.current.slice(-5),
          assistanceMode: opts?.assistanceMode,
          studentQuestion: opts?.studentQuestion,
        });

        let surfacedHint = false;
        let snapshot: TrajectoryFrame = {
          cycle_index: idx,
          client_ts: new Date().toISOString(),
          page_state: "in_progress",
          current_step_latex: null,
          completed_steps_count: 0,
          step_status: null,
          is_stalled: stall.isStalled,
          seconds_since_last_change: stall.secondsSinceLastChange,
          spoke: false,
          hint_text: null,
        };

        for await (const evt of handle.events) {
          // Mutate the *most-recent* CycleLog with this event. We index by
          // cycle position, not id — the synthetic `pending-<idx>` becomes
          // the real cycle id only when `done` arrives.
          setCycleLog((prev) => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1]!;
            const updated = applyCycleEvent(last, evt);
            if (updated === last) return prev;
            return [...prev.slice(0, -1), updated];
          });
          handleEvent(evt, {
            onSurfacedHint: () => (surfacedHint = true),
            onSnapshot: (s) => (snapshot = { ...snapshot, ...s }),
          });
        }
        await handle.done;

        snapshot.spoke = surfacedHint;
        trajectoryRef.current.push(snapshot);
        // keep buffer small — server only needs last 5
        if (trajectoryRef.current.length > 8) {
          trajectoryRef.current.splice(0, trajectoryRef.current.length - 8);
        }
      } catch (e) {
        console.error("[tutor] sendCycle failed", e);
        // R1: cost cap reached — explain in plain copy and stop the capture
        // loop so we don't keep retrying. The api already wrote ended_at if
        // it was the daily cap, but per-session caps require us to end it.
        if (isApiError(e) && e.code === "cost_exceeded") {
          const scope = (e.details?.scope as string | undefined) ?? "session";
          const cap = e.details?.cap_usd as number | undefined;
          toast.error(
            scope === "user_day"
              ? "daily cost cap reached — try again tomorrow."
              : "session cost cap reached — start a fresh session.",
            {
              id: "cost_exceeded",
              description: cap
                ? `cap was $${cap.toFixed(2)}. ione will pause until you reset.`
                : undefined,
              ttlMs: 12_000,
            },
          );
          // Stop capture so we don't burn more requests against the cap.
          capture.stop();
        } else if (isApiError(e) && e.code === "unauthorized") {
          toast.error("your session expired. sign in again to keep going.", {
            id: "auth_expired",
          });
          capture.stop();
        } else {
          toast.warn("ione missed a cycle.", {
            id: "sse_drop",
            description: e instanceof Error ? e.message : String(e),
            ttlMs: 5000,
          });
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [capture, ensureSession],
  );

  /**
   * Handler for the "I need help" button. The student already had a hint
   * (or is just stuck) and is explicitly asking ione to teach. We:
   *   1. Bail if capture isn't running (no session to send the frame to).
   *   2. Defer with a toast if an autonomous cycle is mid-flight — both
   *      paths share AgentTrace state and we can't safely interleave.
   *   3. captureNow() to grab a fresh frame *outside* the diff-gate, so
   *      the explain request always has the most current page state.
   *   4. postCycle with assistanceMode='explain' — orchestrator bypasses
   *      the policy gate and the intervention agent runs in EXPLAIN mode.
   */
  const requestHelp = useCallback(async () => {
    if (!capture.isRunning) {
      toast.warn("share your screen first.", {
        id: "help_no_capture",
        description: "ione needs to see what you're working on to help.",
        ttlMs: 4000,
      });
      return;
    }
    if (helpInFlight) return; // button is disabled, but guard anyway
    if (inFlightRef.current) {
      toast.info("ione is mid-thought — try again in a sec.", {
        id: "help_busy",
        ttlMs: 3500,
      });
      return;
    }
    setHelpInFlight(true);
    try {
      const blob = await capture.captureNow();
      if (!blob) {
        toast.warn("couldn't grab a frame — is the share still active?", {
          id: "help_no_frame",
          ttlMs: 4000,
        });
        return;
      }
      await postCycle(blob, { assistanceMode: "explain" });
    } catch (e) {
      console.error("[tutor] requestHelp failed", e);
      toast.warn("ione couldn't help that time.", {
        id: "help_error",
        description: e instanceof Error ? e.message : String(e),
        ttlMs: 4500,
      });
    } finally {
      setHelpInFlight(false);
    }
  }, [capture, helpInFlight, postCycle]);

  /**
   * Push-to-talk: begin capturing audio. Called on button mousedown
   * AND on spacebar keydown (when capture is running and we're idle).
   * Bails early if the screen share isn't running, an autonomous cycle
   * is mid-flight, or another PTT press is already in flight.
   *
   * The mic stream is kept warm across presses (see useMicCapture) so
   * subsequent presses don't re-prompt for permission.
   */
  const startVoice = useCallback(async () => {
    if (!capture.isRunning) {
      toast.warn("share your screen first.", {
        id: "voice_no_capture",
        description: "ione needs to see what you're working on to answer.",
        ttlMs: 4000,
      });
      return;
    }
    if (voiceState !== "idle") return;
    if (helpInFlight || inFlightRef.current) {
      toast.info("ione is mid-thought — try again in a sec.", {
        id: "voice_busy",
        ttlMs: 3500,
      });
      return;
    }
    setVoiceState("recording");
    try {
      await mic.start();
    } catch (e) {
      console.error("[tutor] mic.start failed", e);
      const msg = e instanceof Error ? e.message : String(e);
      const denied = /denied|notallowed|permission/i.test(msg);
      toast.warn(denied ? "microphone access blocked." : "couldn't start the mic.", {
        id: "voice_mic_failed",
        description: denied
          ? "allow microphone access in your browser to ask ione out loud."
          : msg,
        ttlMs: 5500,
      });
      setVoiceState("idle");
    }
  }, [capture.isRunning, helpInFlight, mic, voiceState]);

  /**
   * Push-to-talk: stop capturing, transcribe, and feed the transcript +
   * a fresh frame into /api/cycle as assistanceMode='voice'. Mirrors the
   * "I need help" path but adds the STT roundtrip in the middle.
   */
  const stopVoiceAndSend = useCallback(async () => {
    if (voiceState !== "recording") return;
    setVoiceState("transcribing");
    let recording: Awaited<ReturnType<typeof mic.stop>> = null;
    try {
      recording = await mic.stop();
    } catch (e) {
      console.error("[tutor] mic.stop failed", e);
    }
    if (!recording) {
      // too short or cancelled — quietly reset
      setVoiceState("idle");
      return;
    }
    try {
      const transcript = await transcribeAudio({
        audio: recording.blob,
        durationSec: recording.durationSec,
      });
      const text = transcript.text.trim();
      if (!text) {
        toast.info("didn't catch that — try again.", {
          id: "voice_empty_transcript",
          ttlMs: 3500,
        });
        setVoiceState("idle");
        return;
      }
      setVoiceState("answering");
      const blob = await capture.captureNow();
      if (!blob) {
        toast.warn("couldn't grab a frame — is the share still active?", {
          id: "voice_no_frame",
          ttlMs: 4000,
        });
        return;
      }
      await postCycle(blob, { assistanceMode: "voice", studentQuestion: text });
    } catch (e) {
      console.error("[tutor] voice flow failed", e);
      toast.warn("ione couldn't answer that one.", {
        id: "voice_error",
        description: e instanceof Error ? e.message : String(e),
        ttlMs: 4500,
      });
    } finally {
      setVoiceState("idle");
    }
  }, [capture, mic, postCycle, voiceState]);

  /**
   * Cancel an in-flight recording (e.g. user released spacebar before
   * the minimum duration, or hit Escape mid-record). Throws away the
   * audio without making any network calls.
   */
  const cancelVoice = useCallback(() => {
    if (voiceState !== "recording") return;
    mic.cancel();
    setVoiceState("idle");
  }, [mic, voiceState]);

  // Spacebar push-to-talk. Holding space starts recording, releasing
  // it sends. Repeat-rate keydowns are filtered (so holding the key
  // doesn't keep re-arming). We bail when focus is in a text input
  // so spacebars while typing in a future textarea don't trigger.
  useEffect(() => {
    const isTextTarget = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return (
        t.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT"
      );
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      if (isTextTarget(e.target)) return;
      if (!capture.isRunning) return;
      if (voiceState !== "idle") return;
      e.preventDefault();
      void startVoice();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Escape" && voiceState === "recording") {
        e.preventDefault();
        cancelVoice();
        return;
      }
      if (e.code !== "Space") return;
      if (isTextTarget(e.target)) return;
      if (voiceState !== "recording") return;
      e.preventDefault();
      void stopVoiceAndSend();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [capture.isRunning, cancelVoice, startVoice, stopVoiceAndSend, voiceState]);

  // Drain an SSE event into local state; call hooks supplied by the caller.
  const handleEvent = useCallback(
    (
      evt: CycleEvent,
      cb: {
        onSurfacedHint: () => void;
        onSnapshot: (snap: Partial<TrajectoryFrame>) => void;
      },
    ) => {
      switch (evt.type) {
        case "ocr": {
          setLatestOcr({
            confidence: evt.confidence,
            latex: evt.current_step_latex,
            completedSteps: evt.completed_steps_latex ?? [],
            mathpixLatex: evt.mathpix_latex,
            mathpixConfidence: evt.mathpix_confidence,
          });
          cb.onSnapshot({
            page_state: evt.page_state,
            current_step_latex: evt.current_step_latex,
          });
          break;
        }
        case "confidence":
          setConfidence({ level: evt.level, reason: evt.reason });
          break;
        case "hint": {
          const incoming: SurfacedHintExtra = {
            ...evt,
            received_at: Date.now(),
          };
          setLatestHint((prev) => (SurfacedHintEqual(prev, incoming) ? prev : incoming));
          cb.onSurfacedHint();
          cb.onSnapshot({ spoke: true, hint_text: evt.text });
          break;
        }
        case "done": {
          const surfaced = Boolean(latestHint && Date.now() - latestHint.received_at < 250);
          setCostCycles((prev: CostMeterCycle[]) => {
            const next = [
              ...prev,
              {
                cycle_id: evt.cycle_id,
                cost_usd: evt.cost_usd,
                ms: evt.ms,
                surfaced_hint: surfaced,
              },
            ];
            if (next.length > 64) next.splice(0, next.length - 64);
            return next;
          });
          setTotalCost((u) => u + evt.cost_usd);
          break;
        }
        case "error":
          if (evt.code === "cost_exceeded") {
            toast.error("session cost cap reached — pausing.", {
              id: "cost_exceeded",
              ttlMs: 12_000,
            });
            capture.stop();
          } else {
            toast.warn("ione had trouble with that cycle.", {
              id: `cycle_err_${evt.code ?? "unknown"}`,
              description: evt.message,
              ttlMs: 5000,
            });
          }
          break;
      }
    },
    [capture, latestHint],
  );

  const handleStop = useCallback(async () => {
    capture.stop();
    if (sessionId) {
      setEndingSession(true);
      try {
        await endSession(sessionId, "user_stopped");
      } catch (e) {
        console.warn("[tutor] endSession failed", e);
      } finally {
        setEndingSession(false);
        setSessionId(null);
        stallRef.current.reset();
        stallRef.current.stop();
        // Session is over and the orchestrator has just flushed its claims
        // to the KG. Bump the refresh key so KGReceipts re-fetches the
        // struggle profile and shows the new receipts.
        setKgRefreshKey((k) => k + 1);
      }
    }
  }, [capture, sessionId]);

  useEffect(() => () => stallRef.current.stop(), []);

  // Surface capture errors as toasts too — the inline banner is easy to miss
  // when attention is on the ipad mirror. (R5)
  useEffect(() => {
    if (!capture.error) return;
    toast.warn(capture.error.headline, {
      id: "capture_error",
      description: capture.error.body,
      ttlMs: 9000,
    });
  }, [capture.error]);

  return (
    <Notebook className="min-h-[80vh]" variant="desk">
      <BrowserCompatBanner />
      <NotebookLayout
        variant="desk"
        resizableThreeColumn={{ storageKey: "ione:tutor:notebook-cols-v1" }}
        left={
          // Left rail — agent orchestration trace. Lives outside the
          // <main> column so the eye lands on `iPad mirror → marginalia`
          // first; the rail then *expands* the user's understanding of
          // what's happening behind the scenes.
          <AgentTrace cycles={cycleLog} />
        }
        main={
          <div className="flex gap-6">
            <ConfidenceRibbon level={confidence.level} reason={confidence.reason} />
            <div className="flex-1 min-w-0 flex flex-col gap-6">
              <header className="flex items-baseline justify-between gap-4 flex-wrap">
                <div>
                  <div className="section-label-light">live · tutor session</div>
                  <h1
                    className="h-display-light text-3xl mt-1"
                    style={{ fontStyle: "italic" }}
                  >
                    a quiet pair of eyes.
                  </h1>
                </div>
                <div className="flex items-center gap-2">
                  {/* "Hold to ask" — push-to-talk. Hold the button (or
                      hold the spacebar) to record a question; release
                      to transcribe + send. Lives leftmost in the header
                      because spoken questions are the highest-bandwidth
                      thing a student can do. */}
                  {capture.isRunning && (
                    <PencilButton
                      surface="desk"
                      size="sm"
                      // Use pointer events so it works for both mouse and
                      // touch. We also wire onPointerLeave/onPointerCancel
                      // so dragging off the button still finalizes the
                      // recording (otherwise the user gets stuck in
                      // "recording" with no way out).
                      onPointerDown={(e) => {
                        e.preventDefault();
                        void startVoice();
                      }}
                      onPointerUp={(e) => {
                        e.preventDefault();
                        void stopVoiceAndSend();
                      }}
                      onPointerLeave={() => {
                        if (voiceState === "recording") {
                          void stopVoiceAndSend();
                        }
                      }}
                      onPointerCancel={() => cancelVoice()}
                      // Suppress the default "click" since we drive
                      // everything off pointerdown/up. Clicking without
                      // holding is treated as a too-short tap and is
                      // discarded by useMicCapture.
                      onClick={(e) => e.preventDefault()}
                      disabled={
                        endingSession ||
                        helpInFlight ||
                        voiceState === "transcribing" ||
                        voiceState === "answering"
                      }
                      title="hold to ask ione a question (or hold spacebar)"
                    >
                      {voiceState === "recording"
                        ? "listening…"
                        : voiceState === "transcribing"
                          ? "transcribing…"
                          : voiceState === "answering"
                            ? "ione is thinking…"
                            : "hold to ask · ⎵"}
                    </PencilButton>
                  )}
                  {/* "I need help" — only shown while a session is live.
                      Sits to the LEFT of audio/stop because it's the
                      primary student-facing action: the autonomous loop
                      already runs on its own, but this is the button
                      they reach for when nudges aren't enough. Disabled
                      while a help cycle is mid-flight (so we don't
                      double-fire) and while ending the session. */}
                  {capture.isRunning && (
                    <PencilButton
                      surface="desk"
                      size="sm"
                      onClick={() => {
                        void requestHelp();
                      }}
                      disabled={helpInFlight || endingSession || voiceState !== "idle"}
                      title="ask ione to walk you through the next step"
                    >
                      {helpInFlight ? "ione is thinking…" : "i need help"}
                    </PencilButton>
                  )}
                  <PencilButton
                    tone="ghost"
                    surface="desk"
                    size="sm"
                    onClick={() => {
                      setAudioMuted((m) => {
                        const next = !m;
                        if (next === false) {
                          void primeAudioGraph().catch((e) =>
                            console.warn("[tutor] primeAudioGraph", e),
                          );
                        }
                        return next;
                      });
                    }}
                  >
                    {audioMuted ? "audio off" : "audio on"}
                  </PencilButton>
                  {capture.isRunning ? (
                    <PencilButton
                      tone="red"
                      surface="desk"
                      size="sm"
                      onClick={handleStop}
                      disabled={endingSession}
                    >
                      {endingSession ? "ending…" : "stop session"}
                    </PencilButton>
                  ) : (
                    <PencilButton
                      surface="desk"
                      size="sm"
                      onClick={() => {
                        void (async () => {
                          try {
                            await primeAudioGraph();
                          } catch (e) {
                            console.warn("[tutor] primeAudioGraph", e);
                          }
                          await capture.start();
                        })();
                      }}
                      disabled={!capture.isSupported}
                    >
                      start session
                    </PencilButton>
                  )}
                </div>
              </header>

              <HairlineRule ticks tone="line" />

              {/* live preview — re-uses the capture surface video element */}
              <div className="relative aspect-[4/3] w-full border border-line bg-paper-tint overflow-hidden">
                <video
                  ref={capture.videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={[
                    "absolute inset-0 w-full h-full object-contain",
                    capture.isRunning ? "opacity-100" : "opacity-0",
                  ].join(" ")}
                />
                {!capture.isRunning && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                    <span className="font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
                      awaiting share
                    </span>
                    <span
                      className="text-paper-faint text-sm leading-relaxed max-w-[28ch]"
                      style={{
                        fontFamily: "var(--font-display)",
                        fontStyle: "italic",
                      }}
                    >
                      pick the QuickTime window mirroring your iPad and ione
                      will start watching.
                    </span>
                  </div>
                )}
                <RoiPicker
                  roi={roi}
                  active={pickingRoi}
                  onChange={(r) => {
                    setRoi(r);
                    setPickingRoi(false);
                  }}
                  onCancel={() => setPickingRoi(false)}
                />
                {capture.isRunning && (
                  <div className="absolute right-3 bottom-3 flex gap-2">
                    {roi && !pickingRoi && (
                      <button
                        type="button"
                        onClick={() => setRoi(null)}
                        className="font-sub text-[10px] tracking-[0.16em] uppercase px-2 py-1 bg-paper/90 text-paper-faint hover:text-ink-deep border border-line"
                      >
                        clear region
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPickingRoi((v) => !v)}
                      className="font-sub text-[10px] tracking-[0.16em] uppercase px-2 py-1 bg-paper/90 text-paper-faint hover:text-ink-deep border border-line"
                    >
                      {pickingRoi ? "cancel" : roi ? "re-select region" : "select region"}
                    </button>
                  </div>
                )}
              </div>

              {capture.error && (
                <div className="border-l-2 border-red-pencil pl-4 py-3 bg-red-pencil/[0.06]">
                  <div className="text-red-pencil text-sm" style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}>
                    {capture.error.headline}
                  </div>
                  <div className="text-paper-faint text-[13px]">{capture.error.body}</div>
                </div>
              )}

              <OcrDebugBanner
                confidence={latestOcr?.confidence ?? null}
                latex={latestOcr?.latex ?? null}
                completedSteps={latestOcr?.completedSteps ?? []}
                mathpixLatex={latestOcr?.mathpixLatex ?? null}
                mathpixConfidence={latestOcr?.mathpixConfidence ?? null}
              />

              <footer className="mt-auto pt-6 border-t border-line flex items-baseline justify-between font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
                <span>cycles · {capture.stats.cyclesRun}</span>
                <span>encoded · {(capture.stats.totalEncodedBytes / 1024).toFixed(1)} kb</span>
                <span className="text-paper-faint">
                  cost · ${totalCost.toFixed(4)}
                </span>
              </footer>
            </div>
          </div>
        }
        margin={
          <div className="flex flex-col gap-8 min-h-full">
            {/* Voice orb — pulses on hint TTS via the shared AudioBus.
                Always rendered (even when muted) so the user sees idle
                breathing while waiting for the next hint, and the WebGL
                context stays warm so the first hint's reaction isn't a
                cold start. */}
            <div className="flex flex-col items-center">
              <div className="section-label-light mb-3 self-start">voice</div>
              <div className="wisp-port-shell inline-flex max-w-full">
                <div className="wisp-port-inner flex items-center justify-center p-2">
                  <WispOrb size={220} />
                </div>
              </div>
              <div
                className={[
                  "mt-2 font-mono text-[10px] tracking-[0.18em] uppercase",
                  audioMuted ? "text-paper-mute" : "text-paper-faint",
                ].join(" ")}
              >
                {audioMuted ? "audio muted" : "speaks on hint"}
              </div>
            </div>

            <div>
              <div className="section-label-light mb-3">marginalia</div>
              <HintStack incoming={latestHint} audioMuted={audioMuted} />
            </div>

            {/* Knowledge-graph receipts — surfaces the StruggleProfile and
                the actual cited claims that the reasoning agent is using
                to predict where this student tends to slip. This is the
                "knowledge from KG" pane (live agent thought is on the left
                in AgentTrace). */}
            <div>
              <div className="section-label-light mb-3">knowledge graph</div>
              <KGReceipts refreshKey={kgRefreshKey} />
            </div>

            {import.meta.env.DEV && (
              <div className="mt-auto">
                <CostMeter cycles={costCycles} totalUsd={totalCost} />
              </div>
            )}
          </div>
        }
      />
    </Notebook>
  );
}
