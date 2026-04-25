import { motion } from "motion/react";
import type { CycleEntry, UseScreenCaptureResult } from "../lib/capture";

const STATUS_COPY: Record<
  "normal" | "idle" | "writing" | "stalled",
  { glyph: string; line: (intervalMs: number) => string }
> = {
  normal: {
    glyph: "·",
    line: (ms) => `resting cadence — ${Math.round(ms / 1000)}s between cycles`,
  },
  idle: {
    glyph: "○",
    line: () => "idle — cycling slow at 15s",
  },
  writing: {
    glyph: "✎",
    line: () => "writing — cycling fast at 6s",
  },
  stalled: {
    glyph: "!",
    line: () => "stalled — looking closer at 4s",
  },
};

const STATUS_TONE: Record<
  "normal" | "idle" | "writing" | "stalled",
  string
> = {
  normal: "text-paper-dim",
  idle: "text-moss",
  writing: "text-brass",
  stalled: "text-red-pencil",
};

/**
 * Right-column capture card: lives where the disabled placeholder used to be.
 * Holds the start/stop button, the live preview, and the adaptive-cadence
 * status line. The cycle log lives separately in <CaptureLog/>.
 */
export function CapturePanel({ capture }: { capture: UseScreenCaptureResult }) {
  const {
    videoRef,
    isRunning,
    isStarting,
    stats,
    error,
    videoSize,
    start,
    stop,
    isSupported,
    baseIntervalSec,
    setBaseIntervalSec,
    dismissError,
    costSaved,
  } = capture;

  const statusKey = stats.status;
  const status = STATUS_COPY[statusKey];
  const tone = STATUS_TONE[statusKey];

  return (
    <div className="border border-ink-line bg-ink-raise p-8 sm:p-10">
      {/* ── header pill ─────────────────────────────────────────────── */}
      <div className="flex items-baseline gap-3 mb-6">
        <span
          aria-hidden
          className={[
            "text-2xl leading-none transition-colors duration-500",
            isRunning ? "text-red-pencil animate-pulse" : "text-paper-faint",
          ].join(" ")}
        >
          ●
        </span>
        <span className="font-mono text-[11px] tracking-[0.22em] uppercase text-paper-dim">
          {isRunning ? "capturing · live" : "not yet capturing"}
        </span>
      </div>

      {/* ── live preview ────────────────────────────────────────────── */}
      <div
        className={[
          "relative aspect-[4/3] w-full mb-6 border border-ink-line bg-ink overflow-hidden",
          isRunning ? "" : "bg-[radial-gradient(circle_at_center,rgba(244,235,214,0.04),transparent_60%)]",
        ].join(" ")}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={[
            "absolute inset-0 w-full h-full object-contain",
            isRunning ? "opacity-100" : "opacity-0",
          ].join(" ")}
        />
        {!isRunning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-mute">
              awaiting share
            </span>
            <span
              className="text-paper-dim text-sm leading-relaxed max-w-[28ch]"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
            >
              your iPad will preview here once you start.
            </span>
          </div>
        )}
        {/* subtle frame line overlay */}
        <div
          aria-hidden
          className="absolute inset-0 ring-1 ring-inset ring-paper/[0.04] pointer-events-none"
        />
      </div>

      {/* preview meta */}
      {isRunning && (
        <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.18em] uppercase text-paper-mute mb-6 -mt-3">
          <span>live · what the agent sees</span>
          <span className="tabular-nums tracking-[0.12em]">
            {videoSize ? `${videoSize.width} × ${videoSize.height}` : "— × —"}
          </span>
        </div>
      )}

      {/* ── error banner ────────────────────────────────────────────── */}
      {error && (
        <div className="mb-6 border-l-2 border-red-pencil pl-4 py-3 pr-3 bg-red-pencil/[0.06] flex items-start gap-3">
          <div className="flex-1">
            <div
              className="text-red-pencil text-sm mb-1"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
            >
              {error.headline}
            </div>
            <div className="text-paper-dim text-[13px] leading-relaxed">
              {error.body}
            </div>
          </div>
          <button
            type="button"
            onClick={dismissError}
            className="text-paper-mute hover:text-paper transition-colors text-lg leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* ── unsupported notice ──────────────────────────────────────── */}
      {!isSupported && (
        <div className="mb-6 font-mono text-[11px] tracking-[0.14em] uppercase text-paper-mute">
          getDisplayMedia not available in this context.
        </div>
      )}

      {/* ── primary control ─────────────────────────────────────────── */}
      <button
        type="button"
        onClick={isRunning ? stop : start}
        disabled={!isSupported || isStarting}
        className={[
          "cta w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed",
          isRunning
            ? "border-red-pencil text-red-pencil hover:bg-red-pencil hover:text-paper hover:border-red-pencil"
            : "",
        ].join(" ")}
      >
        {isStarting ? (
          <>opening picker…</>
        ) : isRunning ? (
          <>
            stop session <span aria-hidden>×</span>
          </>
        ) : (
          <>
            start session <span aria-hidden>→</span>
          </>
        )}
      </button>

      {/* ── how-to hint ─────────────────────────────────────────────── */}
      {!isRunning && !error && (
        <p className="text-paper-mute text-[12px] leading-relaxed mt-5">
          when chrome opens the picker, choose{" "}
          <span className="text-paper-dim">window</span> and select{" "}
          <span className="text-paper-dim">QuickTime Player</span> mirroring
          your iPad. nothing leaves the browser yet.
        </p>
      )}

      {/* ── cadence + adaptive status ───────────────────────────────── */}
      <div className="mt-8 pt-6 border-t border-ink-line">
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-mute">
            base cadence
          </span>
          <span
            className="text-paper text-lg leading-none tabular-nums"
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
          >
            {baseIntervalSec}s
          </span>
        </div>
        <input
          type="range"
          min={4}
          max={15}
          step={1}
          value={baseIntervalSec}
          onChange={(e) => setBaseIntervalSec(parseInt(e.target.value, 10))}
          className="cadence-slider w-full"
          aria-label="Cycle interval seconds"
        />

        <div
          className={[
            "mt-5 flex items-center gap-3 text-[13px] transition-colors duration-500",
            tone,
          ].join(" ")}
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            lineHeight: 1.4,
          }}
        >
          <span className="font-mono text-sm not-italic w-4 text-center">
            {status.glyph}
          </span>
          <span>{status.line(stats.effectiveInterval)}</span>
        </div>
      </div>

      {/* ── live stats grid ─────────────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5">
        <Stat label="cycles run" value={String(stats.cyclesRun)} />
        <Stat label="skipped (idle)" value={String(stats.cyclesSkipped)} />
        <Stat
          label="encoded"
          value={
            <>
              {(stats.totalEncodedBytes / 1024).toFixed(1)}
              <span className="ml-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-paper-mute not-italic">
                KB
              </span>
            </>
          }
        />
        <Stat
          label="cost saved"
          value={`$${costSaved.toFixed(3)}`}
          tone="moss"
        />
      </div>

      {/* slider styles — Tailwind v4 doesn't ship a thumb util, so inline. */}
      <style>{`
        .cadence-slider {
          appearance: none;
          background: transparent;
          height: 24px;
          padding: 0;
          margin: 0;
          cursor: pointer;
        }
        .cadence-slider::-webkit-slider-runnable-track {
          height: 1px;
          background: var(--color-ink-line);
        }
        .cadence-slider::-moz-range-track {
          height: 1px;
          background: var(--color-ink-line);
        }
        .cadence-slider::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--color-paper);
          border: 0;
          margin-top: -5.5px;
          transition: transform 0.18s var(--ease-graphite),
            background-color 0.2s var(--ease-graphite);
        }
        .cadence-slider::-webkit-slider-thumb:hover {
          transform: scale(1.25);
          background: var(--color-red-pencil);
        }
        .cadence-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--color-paper);
          border: 0;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

/** Stat tile used inside the capture panel. */
function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "moss";
}) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-paper-mute mb-1.5">
        {label}
      </div>
      <div
        className={[
          "h-display text-2xl leading-none tabular-nums",
          tone === "moss" ? "text-moss" : "text-paper",
        ].join(" ")}
        style={{ fontStyle: "italic" }}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Cycle log — full-width section, animated entry per row, newest-first.
 * Renders nothing when there's no activity yet.
 */
export function CaptureLog({ log }: { log: CycleEntry[] }) {
  if (log.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="mt-16"
    >
      <div className="flex items-baseline justify-between mb-5">
        <div className="section-label">cycle log</div>
        <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-paper-faint">
          newest first · last {log.length}
        </div>
      </div>

      <ol className="border-t border-ink-line">
        {log.map((entry) => (
          <LogRow key={entry.id} entry={entry} />
        ))}
      </ol>
    </motion.section>
  );
}

function LogRow({ entry }: { entry: CycleEntry }) {
  const t = new Date(entry.ts);
  const time =
    pad(t.getHours()) +
    ":" +
    pad(t.getMinutes()) +
    ":" +
    pad(t.getSeconds());

  let action: React.ReactNode;
  let actionTone = "";
  if (entry.type === "baseline") {
    action = (
      <span
        className="text-paper-mute"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
      >
        baseline — first frame anchored
      </span>
    );
  } else if (entry.type === "encoded") {
    actionTone = "text-moss";
    action = (
      <>
        <span className="text-moss">
          encoded {entry.kb?.toFixed(1)} KB
        </span>
        <span className="text-moss/40 mx-2">→</span>
        <span className="text-paper-dim font-mono text-[12px] tracking-tight">
          POST /api/cycle
        </span>
      </>
    );
  } else {
    action = (
      <span className="text-paper-faint italic">skipped (idle gate)</span>
    );
  }

  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={[
        "grid grid-cols-[80px_84px_1fr] gap-4 items-baseline py-2 border-b border-ink-line/60 font-mono text-[13px] tabular-nums",
        actionTone,
      ].join(" ")}
    >
      <time className="text-paper-mute text-[12px]">{time}</time>
      <span
        className={[
          "text-[12px]",
          entry.type === "skipped" ? "text-paper-faint" : "text-paper-dim",
        ].join(" ")}
      >
        Δ {entry.diffPct.toFixed(1)}%
      </span>
      <span>{action}</span>
    </motion.li>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
