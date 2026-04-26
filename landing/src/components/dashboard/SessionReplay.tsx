/**
 * SessionReplay — scrub through one tutor_session, cycle by cycle.
 *
 * Phase 4 / G5.
 *
 * Each cycle has four agent JSON snapshots (ocr_json, reasoning_json,
 * predictive_json, intervention_json) and a `spoke + suppression_reason`
 * pair. The replay reconstructs:
 *
 *   - what the OCR agent transcribed (latex)
 *   - what the Reasoning agent thought of the step
 *   - what the Predictive agent expected
 *   - whether the policy spoke or stayed silent (and why)
 *   - if it spoke, which hint surfaced (linked to tutor_hints row)
 *
 * "why I didn't speak" annotation is the centerpiece — when spoke=false
 * we expose suppression_reason in red marginalia next to the cycle. This
 * is the ONLY surface where suppression decisions become legible to the
 * user, which is the whole point of building this view.
 *
 * If frame_storage_path is set (Phase 5 / R7), we render the WebP frame
 * via Supabase Storage signed URL. Otherwise we show a paper-colored
 * placeholder with the diff_pct readout.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";

interface SessionMeta {
  id: string;
  problem_text: string | null;
  problem_topic: string | null;
  problem_id: string | null;
  demo_mode: boolean;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
  total_cost_usd: number | null;
  total_cycles: number | null;
  total_hints: number | null;
  predicted_correct: number | null;
  predicted_total: number | null;
  canonical_solution_json: unknown;
}

interface CycleRow {
  id: string;
  cycle_index: number;
  client_ts: string;
  server_started_at: string;
  server_finished_at: string | null;
  diff_pct: number | null;
  is_stalled: boolean;
  seconds_since_last_change: number | null;
  ocr_problem_text: string | null;
  ocr_current_step_latex: string | null;
  ocr_completed_steps_latex: unknown;
  ocr_page_state: string | null;
  ocr_confidence: number | null;
  mathpix_latex: string | null;
  mathpix_confidence: number | null;
  step_status: string | null;
  error_type: string | null;
  error_location: string | null;
  severity: number | null;
  what_they_should_do_next: string | null;
  scaffolding_question: string | null;
  matches_known_error_pattern: boolean | null;
  predicted_error_type: string | null;
  predicted_error_basis: string | null;
  predicted_confidence: number | null;
  predicted_recommend_intervene: boolean | null;
  spoke: boolean;
  suppression_reason: string | null;
  cost_usd: number | null;
  latency_ms: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  frame_storage_path: string | null;
  ocr_json: unknown;
  reasoning_json: unknown;
  predictive_json: unknown;
  intervention_json: unknown;
}

interface HintRow {
  id: string;
  cycle_id: string | null;
  hint_type: string;
  text: string;
  predicted: boolean;
  severity: number | null;
  was_helpful: boolean | null;
  reasoning_for_decision: string | null;
  created_at: string;
}

export function SessionReplay() {
  const { id } = useParams<{ id: string }>();
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [cycles, setCycles] = useState<CycleRow[]>([]);
  const [hints, setHints] = useState<HintRow[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const [{ data: m, error: mErr }, { data: cs, error: cErr }, { data: hs, error: hErr }] =
        await Promise.all([
          supabase
            .from("tutor_sessions")
            .select("*")
            .eq("id", id)
            .single(),
          supabase
            .from("tutor_cycles")
            .select("*")
            .eq("session_id", id)
            .order("cycle_index", { ascending: true }),
          supabase
            .from("tutor_hints")
            .select("*")
            .eq("session_id", id)
            .order("created_at", { ascending: true }),
        ]);
      if (cancelled) return;
      if (mErr || !m) {
        setError(mErr?.message ?? "session not found");
        setLoading(false);
        return;
      }
      if (cErr) console.error("[Replay] cycles error", cErr);
      if (hErr) console.error("[Replay] hints error", hErr);
      setMeta(m as SessionMeta);
      setCycles((cs ?? []) as CycleRow[]);
      setHints((hs ?? []) as HintRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const activeCycle = cycles[activeIdx] ?? null;
  const activeHint = useMemo(() => {
    if (!activeCycle) return null;
    return hints.find((h) => h.cycle_id === activeCycle.id) ?? null;
  }, [activeCycle, hints]);

  // Resolve frame URL when the active cycle changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeCycle?.frame_storage_path) {
        setFrameUrl(null);
        return;
      }
      const { data, error } = await supabase.storage
        .from("tutor_frames")
        .createSignedUrl(activeCycle.frame_storage_path, 60);
      if (cancelled) return;
      if (error) {
        console.warn("[Replay] frame signed-url failed", error);
        setFrameUrl(null);
        return;
      }
      setFrameUrl(data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCycle?.frame_storage_path]);

  // Keyboard scrubbing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (cycles.length === 0) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(cycles.length - 1, i + 1));
      } else if (e.key === "Home") {
        setActiveIdx(0);
      } else if (e.key === "End") {
        setActiveIdx(cycles.length - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycles.length]);

  if (loading) {
    return (
      <div className="text-paper-mute font-sub text-xs animate-pulse">
        loading session…
      </div>
    );
  }
  if (error || !meta) {
    return (
      <div className="notebook-card px-6 py-10 text-center">
        <p className="text-red-pencil font-sub text-sm">{error ?? "not found"}</p>
        <Link
          to="/dashboard/sessions"
          className="inline-block mt-4 font-sub text-[11px] tracking-[0.18em] uppercase pencil-link-light"
        >
          ← back to sessions
        </Link>
      </div>
    );
  }

  const problem =
    meta.problem_text?.trim() ||
    meta.problem_topic?.trim() ||
    meta.problem_id?.trim() ||
    "(problem not captured)";
  const startedAt = new Date(meta.started_at);
  const endedAt = meta.ended_at ? new Date(meta.ended_at) : null;
  const durationMs = endedAt
    ? endedAt.getTime() - startedAt.getTime()
    : null;

  return (
    <section>
      <Link
        to="/dashboard/sessions"
        className="inline-block mb-5 font-sub text-[11px] tracking-[0.18em] uppercase pencil-link-light"
      >
        ← all sessions
      </Link>

      <header className="mb-7">
        <div className="section-label-light">© ione — session replay</div>
        <h1
          className="h-display-light text-[1.7rem] sm:text-[2rem] leading-tight mt-1"
          style={{ fontStyle: "italic" }}
        >
          {problem}
        </h1>
        <div className="mt-3 flex items-center gap-x-4 gap-y-1 flex-wrap font-sub text-[10px] tracking-[0.18em] uppercase text-paper-mute">
          <span>{startedAt.toLocaleString()}</span>
          {durationMs != null && <span>· {Math.round(durationMs / 1000)}s</span>}
          <span>· {cycles.length} cycles</span>
          <span>· {hints.length} hints</span>
          {meta.predicted_total ? (
            <span>
              · {meta.predicted_correct}/{meta.predicted_total} predicted
            </span>
          ) : null}
          {meta.total_cost_usd != null && (
            <span>· ${Number(meta.total_cost_usd).toFixed(3)}</span>
          )}
          {meta.demo_mode && (
            <span className="text-brass">· demo mode</span>
          )}
        </div>
      </header>

      {cycles.length === 0 ? (
        <div className="notebook-card px-6 py-10 text-center">
          <p className="text-paper-mute font-sub text-[11px] tracking-wide">
            this session has no recorded cycles.
          </p>
        </div>
      ) : (
        <>
          <Scrubber
            cycles={cycles}
            hints={hints}
            activeIdx={activeIdx}
            onSelect={setActiveIdx}
          />
          {activeCycle && (
            <CycleDetail
              cycle={activeCycle}
              hint={activeHint}
              frameUrl={frameUrl}
            />
          )}
        </>
      )}
    </section>
  );
}

function Scrubber({
  cycles,
  hints,
  activeIdx,
  onSelect,
}: {
  cycles: CycleRow[];
  hints: HintRow[];
  activeIdx: number;
  onSelect: (i: number) => void;
}) {
  const hintCycleIds = useMemo(() => {
    const s = new Set<string>();
    hints.forEach((h) => h.cycle_id && s.add(h.cycle_id));
    return s;
  }, [hints]);

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 font-sub text-[10px] tracking-[0.18em] uppercase text-paper-faint mb-2">
        <span>← →</span>
        <span>cycle {activeIdx + 1} of {cycles.length}</span>
      </div>
      <div className="flex items-stretch gap-px overflow-x-auto pb-2 -mx-1 px-1 border-b border-line-soft">
        {cycles.map((c, i) => {
          const active = i === activeIdx;
          const spoke = c.spoke;
          const suppressed = !c.spoke && c.suppression_reason != null;
          const errored =
            c.step_status === "minor_error" || c.step_status === "major_error";
          const stalled = c.is_stalled;
          const hasHint = hintCycleIds.has(c.id);
          let bar: string;
          if (active) bar = "bg-red-pencil";
          else if (spoke || hasHint) bar = "bg-red-pencil/55";
          else if (errored) bar = "bg-brass/70";
          else if (stalled) bar = "bg-paper-mute/45";
          else if (suppressed) bar = "bg-line";
          else bar = "bg-line-soft";
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(i)}
              title={`cycle ${c.cycle_index + 1} · ${c.step_status ?? "—"}${
                spoke ? " · spoke" : ""
              }${suppressed ? ` · suppressed (${c.suppression_reason})` : ""}`}
              aria-label={`jump to cycle ${c.cycle_index + 1}`}
              className={[
                "flex-shrink-0 w-2.5 transition-all",
                active ? "h-12" : "h-9 hover:h-11",
                bar,
              ].join(" ")}
            />
          );
        })}
      </div>
    </div>
  );
}

function CycleDetail({
  cycle,
  hint,
  frameUrl,
}: {
  cycle: CycleRow;
  hint: HintRow | null;
  frameUrl: string | null;
}) {
  const t = new Date(cycle.server_started_at);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-10 gap-y-6">
      <div className="lg:col-span-7 space-y-6">
        <FrameCard cycle={cycle} frameUrl={frameUrl} />
        <AgentCard
          label="OCR agent"
          summary={
            cycle.ocr_problem_text ??
            cycle.ocr_current_step_latex ??
            "(no transcription)"
          }
          json={cycle.ocr_json}
          extras={[
            cycle.ocr_page_state ? `state: ${cycle.ocr_page_state}` : null,
            cycle.ocr_confidence != null
              ? `conf: ${(cycle.ocr_confidence * 100).toFixed(0)}%`
              : null,
            cycle.mathpix_confidence != null
              ? `mathpix: ${(cycle.mathpix_confidence * 100).toFixed(0)}%`
              : null,
          ]}
        />
        <AgentCard
          label="Reasoning agent"
          summary={
            cycle.what_they_should_do_next ??
            cycle.scaffolding_question ??
            cycle.error_type ??
            "(no analysis)"
          }
          json={cycle.reasoning_json}
          extras={[
            cycle.step_status ? `status: ${cycle.step_status}` : null,
            cycle.severity != null ? `severity: ${cycle.severity}` : null,
            cycle.error_type ? `error: ${cycle.error_type}` : null,
            cycle.error_location ? `at: ${cycle.error_location}` : null,
            cycle.matches_known_error_pattern ? "known pattern" : null,
          ]}
        />
        <AgentCard
          label="Predictive agent"
          summary={
            cycle.predicted_error_type
              ? `expects: ${cycle.predicted_error_type}`
              : "(no prediction)"
          }
          json={cycle.predictive_json}
          extras={[
            cycle.predicted_confidence != null
              ? `conf: ${(cycle.predicted_confidence * 100).toFixed(0)}%`
              : null,
            cycle.predicted_recommend_intervene ? "→ intervene" : null,
            cycle.predicted_error_basis
              ? `basis: ${cycle.predicted_error_basis}`
              : null,
          ]}
        />
      </div>

      <aside className="lg:col-span-5 space-y-6">
        <PolicyCard cycle={cycle} hint={hint} />
        <SidebarStat
          rows={[
            ["cycle", `#${cycle.cycle_index + 1}`],
            ["client time", t.toLocaleTimeString()],
            ["diff", cycle.diff_pct != null ? `${(cycle.diff_pct * 100).toFixed(1)}%` : "—"],
            ["stalled", cycle.is_stalled ? `yes (${cycle.seconds_since_last_change ?? "—"}s)` : "no"],
            ["latency", cycle.latency_ms != null ? `${cycle.latency_ms}ms` : "—"],
            ["cost", cycle.cost_usd != null ? `$${Number(cycle.cost_usd).toFixed(4)}` : "—"],
            ["tokens", cycle.tokens_input != null ? `${cycle.tokens_input}↓ ${cycle.tokens_output ?? 0}↑` : "—"],
          ]}
        />
      </aside>
    </div>
  );
}

function FrameCard({
  cycle,
  frameUrl,
}: {
  cycle: CycleRow;
  frameUrl: string | null;
}) {
  return (
    <div className="border border-line bg-paper-tint rounded-[2px] overflow-hidden">
      <div className="aspect-video bg-paper-tint flex items-center justify-center overflow-hidden">
        {frameUrl ? (
          <img
            src={frameUrl}
            alt={`frame for cycle ${cycle.cycle_index + 1}`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="text-center px-8 py-12">
            <p className="font-sub text-[10px] tracking-[0.22em] uppercase text-paper-faint mb-2">
              no stored frame
            </p>
            <p className="text-paper-mute text-xs max-w-[36ch] mx-auto leading-relaxed">
              frames are only persisted when{" "}
              <span className="font-mono">STORE_FRAMES=1</span> was set on
              the api server during this session.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentCard({
  label,
  summary,
  json,
  extras,
}: {
  label: string;
  summary: string;
  json: unknown;
  extras: (string | null)[];
}) {
  const [open, setOpen] = useState(false);
  const visible = extras.filter((x): x is string => Boolean(x));
  const hasJson =
    json != null &&
    !(typeof json === "object" && json !== null && Object.keys(json).length === 0);
  return (
    <article className="notebook-card">
      <header className="px-5 py-3 flex items-baseline justify-between gap-3 border-b border-line-soft">
        <span className="font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
          {label}
        </span>
        {hasJson && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="font-sub text-[10px] tracking-wide pencil-link-light"
          >
            {open ? "hide json" : "show json"}
          </button>
        )}
      </header>
      <div className="px-5 py-4">
        <p
          className="text-ink-deep text-[15px] leading-snug mb-3"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {summary}
        </p>
        {visible.length > 0 && (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 font-sub text-[10px] tracking-wide text-paper-mute">
            {visible.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        )}
      </div>
      {open && hasJson && (
        <pre className="bg-desk/90 text-paper-faint font-mono text-[10px] leading-snug p-4 overflow-x-auto border-t border-line-soft max-h-72 overflow-y-auto">
          {JSON.stringify(json, null, 2)}
        </pre>
      )}
    </article>
  );
}

function PolicyCard({
  cycle,
  hint,
}: {
  cycle: CycleRow;
  hint: HintRow | null;
}) {
  const spoke = cycle.spoke;
  return (
    <article
      className={[
        "notebook-card",
        spoke ? "border-red-pencil/70" : "",
      ].join(" ")}
    >
      <header className="px-5 py-3 flex items-baseline justify-between gap-3 border-b border-line-soft">
        <span className="font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
          policy decision
        </span>
        <span
          className={[
            "font-sub text-[10px] tracking-[0.18em] uppercase",
            spoke ? "text-red-pencil" : "text-paper-mute",
          ].join(" ")}
        >
          {spoke ? "spoke" : "stayed silent"}
        </span>
      </header>
      <div className="px-5 py-4">
        {spoke && hint ? (
          <>
            <p
              className="text-ink-deep text-[15px] leading-snug mb-3"
              style={{ fontFamily: "var(--font-display)" }}
            >
              "{hint.text}"
            </p>
            <ul className="flex flex-wrap gap-x-3 gap-y-1 font-sub text-[10px] tracking-wide text-paper-mute">
              <li>{hint.hint_type}</li>
              {hint.predicted && <li className="text-brass">predicted</li>}
              {hint.severity != null && <li>severity {hint.severity}</li>}
              {hint.was_helpful != null && (
                <li className={hint.was_helpful ? "text-moss" : "text-paper-mute"}>
                  {hint.was_helpful ? "helpful" : "didn't land"}
                </li>
              )}
            </ul>
          </>
        ) : (
          <>
            <p
              className="text-paper-faint text-[14px] leading-snug mb-3"
              style={{ fontStyle: "italic" }}
            >
              {whyDidntSpeak(cycle)}
            </p>
            {cycle.suppression_reason && (
              <p className="font-sub text-[10px] tracking-wide text-red-pencil/80">
                reason: {cycle.suppression_reason}
              </p>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function whyDidntSpeak(cycle: CycleRow): string {
  const r = cycle.suppression_reason;
  if (!r) {
    if (cycle.step_status === "correct" || cycle.step_status === "complete") {
      return "they were on the right track. nothing to add.";
    }
    return "the policy decided silence was right here.";
  }
  switch (r) {
    case "cooldown":
      return "i had spoken too recently. interrupting again would be noise.";
    case "duplicate":
      return "i would have repeated myself. better to wait for new evidence.";
    case "low_severity":
      return "the slip was minor. they'd catch it on the next line themselves.";
    case "low_confidence":
      return "i wasn't sure enough. better to stay quiet than guess wrong.";
    case "fresh_problem":
      return "they had just started reading. let them think.";
    case "stalled_thinking":
      return "they were paused but not stuck — looked like real thought.";
    default:
      return `policy chose silence: ${r}`;
  }
}

function SidebarStat({ rows }: { rows: [string, string][] }) {
  return (
    <div className="notebook-card">
      <header className="px-5 py-3 border-b border-line-soft">
        <span className="font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
          telemetry
        </span>
      </header>
      <dl className="px-5 py-4 grid grid-cols-2 gap-x-4 gap-y-2 font-sub text-[10px] tracking-wide">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-paper-mute">{k}</dt>
            <dd className="text-ink-deep text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
