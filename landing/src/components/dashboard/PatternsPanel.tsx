/**
 * PatternsPanel — four sparklines, one per behavioral signal.
 *
 * Phase 4 / G3.
 *
 * Visual grammar: each chart is a small inline sparkline rendered on
 * paper-color (no gridlines, no axes — this is marginalia, not a
 * dashboard). Tooltip is a single line of monospace footnote.
 *
 * The four signals match what the orchestrator and policy agents
 * actually consume:
 *
 *   1. error count           Reasoning Agent's per-cycle step_status
 *   2. time-to-first-step    how long a session sat in fresh_problem
 *   3. stall frequency       Capture-side is_stalled rolled up
 *   4. hint acceptance       was_helpful confirmed by next reasoning pass
 *
 * Empty state: if there are no sessions yet, we show one paragraph of
 * marginalia explaining what will appear here.
 */
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  loadPatterns,
  type PatternPoint,
  type PatternsResult,
} from "../../lib/patterns";

export function PatternsPanel() {
  const [result, setResult] = useState<PatternsResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await loadPatterns(30);
      if (!cancelled) {
        setResult(r);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="text-paper-mute font-sub text-xs tracking-wide animate-pulse">
        loading patterns…
      </div>
    );
  }
  if (!result || result.points.length === 0) {
    return (
      <section>
        <Header summary={null} />
        <p className="text-paper-faint text-sm leading-relaxed max-w-[60ch]">
          ione hasn't watched you work yet. once you complete a few tutor
          sessions, four sparklines will appear here showing how often you
          slip, how long it takes you to start a problem, how often you
          stall mid-step, and how useful my hints actually were.
        </p>
      </section>
    );
  }

  const { points, summary } = result;

  return (
    <section className="space-y-12">
      <Header summary={summary} />

      <SparklineCard
        title="errors per session"
        marginalia={`${countNonNull(points, (p) => p.errorCount)} / ${points.length} sessions reporting`}
        points={points}
        valueKey="errorCount"
        formatValue={(v) => `${v} slips`}
      />
      <SparklineCard
        title="time-to-first-step"
        marginalia="seconds between session start and the first stroke that left a fresh-problem state"
        points={points}
        valueKey="timeToFirstStepSec"
        formatValue={(v) => `${v}s`}
      />
      <SparklineCard
        title="stall frequency"
        marginalia="cycles where capture flagged you as paused / total cycles"
        points={points}
        valueKey="stallFrequencyPct"
        formatValue={(v) => `${v.toFixed(1)}%`}
      />
      <SparklineCard
        title="hint acceptance"
        marginalia="hints whose helpfulness the next reasoning pass confirmed"
        points={points}
        valueKey="hintAcceptancePct"
        formatValue={(v) => `${v.toFixed(1)}%`}
      />
    </section>
  );
}

function Header({
  summary,
}: {
  summary: PatternsResult["summary"] | null;
}) {
  return (
    <div className="mb-8">
      <div className="section-label-light">© ione — patterns</div>
      <h1
        className="h-display-light text-[2rem] sm:text-[2.4rem] leading-tight mt-1"
        style={{ fontStyle: "italic" }}
      >
        the shape of how you struggle.
      </h1>
      {summary && (
        <p className="text-paper-mute font-sub text-[10px] tracking-[0.18em] uppercase mt-3">
          {summary.sessions} sessions · {summary.cycles} cycles ·{" "}
          {summary.hints} hints
          {summary.predictedTotal > 0 && (
            <>
              {" "}· prediction accuracy{" "}
              {(
                (summary.predictedCorrect / summary.predictedTotal) *
                100
              ).toFixed(0)}
              %
            </>
          )}
          {" "}· last {summary.windowDays} days
        </p>
      )}
    </div>
  );
}

interface SparklineCardProps {
  title: string;
  marginalia: string;
  points: PatternPoint[];
  valueKey: keyof PatternPoint;
  formatValue: (v: number) => string;
}

function SparklineCard({
  title,
  marginalia,
  points,
  valueKey,
  formatValue,
}: SparklineCardProps) {
  const data = points.map((p) => {
    const raw = p[valueKey];
    return {
      index: p.index,
      sessionId: p.sessionId,
      startedAt: p.startedAt,
      value: typeof raw === "number" ? raw : null,
    };
  });

  const numeric = data.filter((d) => d.value != null).map((d) => d.value as number);
  if (numeric.length === 0) {
    return (
      <article>
        <CardHeading title={title} marginalia={marginalia} />
        <p className="text-paper-faint font-sub text-[10px] tracking-wide">
          no data yet
        </p>
      </article>
    );
  }
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const last = numeric[numeric.length - 1];
  const first = numeric[0];
  const trend = last - first;
  const gradId = `pat-${String(valueKey)}`;

  return (
    <article>
      <CardHeading
        title={title}
        marginalia={marginalia}
        latest={formatValue(last)}
        trend={trend}
      />
      <div className="h-24 mt-2 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(196 48 43)" stopOpacity={0.38} />
                <stop offset="100%" stopColor="rgb(196 48 43)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip
              cursor={{ stroke: "rgb(212 200 173)", strokeWidth: 1, strokeDasharray: "2 2" }}
              content={(props) => (
                <SparklineTooltip
                  {...(props as unknown as SparklineTooltipProps)}
                  formatValue={formatValue}
                />
              )}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="rgb(196 48 43)"
              strokeWidth={1.6}
              fill={`url(#${gradId})`}
              dot={{ r: 2.5, fill: "rgb(196 48 43)", strokeWidth: 0 }}
              activeDot={{ r: 4, fill: "rgb(196 48 43)", strokeWidth: 0 }}
              isAnimationActive
              animationDuration={420}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between font-sub text-[9px] tracking-wide text-paper-mute mt-1 px-2">
        <span>min {formatValue(min)}</span>
        <span>max {formatValue(max)}</span>
      </div>
    </article>
  );
}

function CardHeading({
  title,
  marginalia,
  latest,
  trend,
}: {
  title: string;
  marginalia: string;
  latest?: string;
  trend?: number;
}) {
  return (
    <header className="flex items-baseline justify-between flex-wrap gap-x-3 gap-y-1">
      <div>
        <h3
          className="h-display-light text-[1.25rem] leading-tight"
          style={{ fontStyle: "italic" }}
        >
          {title}
        </h3>
        <p className="text-paper-faint text-xs leading-snug max-w-[56ch]">
          {marginalia}
        </p>
      </div>
      {latest && (
        <span className="font-sub text-[11px] tracking-wide text-paper-mute">
          latest {latest}
          {typeof trend === "number" && trend !== 0 && (
            <span
              className={[
                "ml-1.5",
                trend > 0 ? "text-red-pencil" : "text-moss",
              ].join(" ")}
            >
              {trend > 0 ? "↑" : "↓"}
              {Math.abs(trend).toFixed(1)}
            </span>
          )}
        </span>
      )}
    </header>
  );
}

type SparklineTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload?: unknown; value?: unknown; name?: unknown }>;
  formatValue: (v: number) => string;
};

function SparklineTooltip({
  active,
  payload,
  formatValue,
}: SparklineTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload as {
    index: number;
    startedAt: string;
    value: number | null;
  };
  if (p.value == null) return null;
  const d = new Date(p.startedAt);
  const date = `${d.getMonth() + 1}/${d.getDate()}`;
  return (
    <div
      className="bg-paper border border-line px-2 py-1 font-sub text-[10px] tracking-wide text-paper-mute shadow-md rounded-[2px]"
      style={{ pointerEvents: "none" }}
    >
      session {p.index} · {date} ·{" "}
      <span className="text-ink-deep">{formatValue(p.value)}</span>
    </div>
  );
}

function countNonNull<T>(arr: T[], pick: (t: T) => unknown): number {
  return arr.filter((t) => pick(t) != null).length;
}
