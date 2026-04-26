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
    latex: string | null;
  } | null>(null);
  const [roi, setRoi] = useState<RoiRect | null>(null);
  const [pickingRoi, setPickingRoi] = useState(false);

  const trajectoryRef = useRef<TrajectoryFrame[]>([]);
  const stallRef = useRef<StallDetector>(new StallDetector());
  const cycleIndexRef = useRef(0);
  const inFlightRef = useRef(false);

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
    async (blob: Blob) => {
      if (inFlightRef.current) return; // serialize for now; Phase 2 / E4 swaps for queue
      const sid = await ensureSession();
      if (!sid) return;
      inFlightRef.current = true;
      try {
        const stall = stallRef.current.snapshot();
        const idx = cycleIndexRef.current++;
        const handle = await sendCycle({
          sessionId: sid,
          frame: blob,
          isStalled: stall.isStalled,
          secondsSinceLastChange: stall.secondsSinceLastChange,
          trajectory: trajectoryRef.current.slice(-5),
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
    <Notebook className="min-h-[80vh]">
      <BrowserCompatBanner />
      <NotebookLayout
        main={
          <div className="flex gap-6">
            <ConfidenceRibbon level={confidence.level} reason={confidence.reason} />
            <div className="flex-1 min-w-0 flex flex-col gap-6">
              <header className="flex items-baseline justify-between">
                <div>
                  <div className="section-label">live · tutor session</div>
                  <h1
                    className="h-display text-3xl mt-1"
                    style={{ fontStyle: "italic" }}
                  >
                    a quiet pair of eyes.
                  </h1>
                </div>
                <div className="flex items-center gap-2">
                  <PencilButton
                    tone="ghost"
                    size="sm"
                    onClick={() => setAudioMuted((m) => !m)}
                  >
                    {audioMuted ? "audio off" : "audio on"}
                  </PencilButton>
                  {capture.isRunning ? (
                    <PencilButton tone="red" size="sm" onClick={handleStop} disabled={endingSession}>
                      {endingSession ? "ending…" : "stop session"}
                    </PencilButton>
                  ) : (
                    <PencilButton size="sm" onClick={capture.start} disabled={!capture.isSupported}>
                      start session
                    </PencilButton>
                  )}
                </div>
              </header>

              <HairlineRule ticks />

              {/* live preview — re-uses the capture surface video element */}
              <div className="relative aspect-[4/3] w-full border border-ink-line bg-ink overflow-hidden">
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
                      className="text-paper-dim text-sm leading-relaxed max-w-[28ch]"
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
                        className="font-sub text-[10px] tracking-[0.16em] uppercase px-2 py-1 bg-ink/70 text-paper-dim hover:text-paper border border-ink-line"
                      >
                        clear region
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPickingRoi((v) => !v)}
                      className="font-sub text-[10px] tracking-[0.16em] uppercase px-2 py-1 bg-ink/70 text-paper-dim hover:text-paper border border-ink-line"
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
                  <div className="text-paper-dim text-[13px]">{capture.error.body}</div>
                </div>
              )}

              <OcrDebugBanner
                confidence={latestOcr?.confidence ?? null}
                latex={latestOcr?.latex ?? null}
              />

              <footer className="mt-auto pt-6 border-t border-ink-line flex items-baseline justify-between font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
                <span>cycles · {capture.stats.cyclesRun}</span>
                <span>encoded · {(capture.stats.totalEncodedBytes / 1024).toFixed(1)} kb</span>
                <span className="text-paper-dim">
                  cost · ${totalCost.toFixed(4)}
                </span>
              </footer>
            </div>
          </div>
        }
        margin={
          <div className="flex flex-col gap-8 min-h-full">
            <div>
              <div className="section-label mb-3">marginalia</div>
              <HintStack incoming={latestHint} audioMuted={audioMuted} />
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
