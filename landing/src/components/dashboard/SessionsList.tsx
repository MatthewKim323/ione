/**
 * SessionsList — past tutor_sessions, newest first.
 *
 * Phase 4 / G4.
 *
 * Each row shows duration, problem text (truncated), hint count,
 * predicted-correct fraction, total cost, and the demo-mode badge if
 * applicable. Click a row to open the replay (G5).
 *
 * The list pages by default at 30; "show more" loads the next 30. We
 * never show in-flight sessions (ended_at IS NULL) here — they'd be
 * incomplete. They show up in the live tutor view instead.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";

interface SessionRow {
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
}

const PAGE_SIZE = 30;

export function SessionsList() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [includeActive, setIncludeActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        setRows([]);
        setLoading(false);
        return;
      }
      let q = supabase
        .from("tutor_sessions")
        .select(
          "id, problem_text, problem_topic, problem_id, demo_mode, started_at, ended_at, end_reason, total_cost_usd, total_cycles, total_hints, predicted_correct, predicted_total",
        )
        .eq("user_id", userData.user.id)
        .order("started_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (!includeActive) q = q.not("ended_at", "is", null);
      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        console.error("[SessionsList] fetch failed", error);
        setRows([]);
        setLoading(false);
        return;
      }
      const next = (data ?? []) as SessionRow[];
      setRows((prev) => (page === 0 ? next : [...prev, ...next]));
      setHasMore(next.length === PAGE_SIZE);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [page, includeActive]);

  return (
    <section>
      <div className="mb-8">
        <div className="section-label-light">© ione — sessions</div>
        <h1
          className="h-display-light text-[2rem] sm:text-[2.4rem] leading-tight mt-1"
          style={{ fontStyle: "italic" }}
        >
          everything we worked on together.
        </h1>
        <p className="text-paper-faint text-sm leading-relaxed max-w-[60ch] mt-3">
          a session is one screen-share start to stop. tap a row to scrub
          through the cycles and see what each agent saw.
        </p>
      </div>

      <div className="flex items-center gap-4 mb-5">
        <label className="font-sub text-[10px] tracking-[0.18em] uppercase text-paper-mute flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeActive}
            onChange={(e) => {
              setIncludeActive(e.target.checked);
              setPage(0);
              setRows([]);
            }}
            className="accent-red-pencil"
          />
          show in-progress
        </label>
      </div>

      {loading && rows.length === 0 ? (
        <div className="text-paper-mute font-sub text-xs animate-pulse">
          loading sessions…
        </div>
      ) : rows.length === 0 ? (
        <div className="notebook-card px-6 py-10 text-center">
          <p className="text-paper-mute font-sub text-[11px] tracking-[0.18em] uppercase">
            no sessions yet
          </p>
          <p className="text-paper-faint text-sm mt-3 max-w-[40ch] mx-auto">
            start a tutor session, finish it, and it'll appear here with
            full replay.
          </p>
          <Link
            to="/tutor"
            className="inline-block mt-6 font-sub text-[11px] tracking-[0.22em] uppercase pencil-link-light"
          >
            → start a session
          </Link>
        </div>
      ) : (
        <ul className="notebook-card ruled-paper-light divide-y divide-line-soft overflow-hidden">
          {rows.map((r) => (
            <SessionRowItem key={r.id} row={r} />
          ))}
        </ul>
      )}

      {hasMore && rows.length > 0 && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={loading}
            className="font-sub text-[11px] tracking-[0.22em] uppercase pencil-link-light"
          >
            {loading ? "loading…" : "load more"}
          </button>
        </div>
      )}
    </section>
  );
}

function SessionRowItem({ row }: { row: SessionRow }) {
  const startedAt = new Date(row.started_at);
  const endedAt = row.ended_at ? new Date(row.ended_at) : null;
  const active = endedAt == null;
  const durationMs = endedAt
    ? endedAt.getTime() - startedAt.getTime()
    : Date.now() - startedAt.getTime();
  const durationStr = formatDuration(durationMs);
  const dateStr = formatDate(startedAt);

  const predicted =
    row.predicted_total && row.predicted_total > 0
      ? `${row.predicted_correct ?? 0}/${row.predicted_total} predicted`
      : null;

  const problem =
    row.problem_text?.trim() ||
    row.problem_topic?.trim() ||
    row.problem_id?.trim() ||
    "(problem not captured)";

  return (
    <li>
      <Link
        to={`/dashboard/sessions/${row.id}`}
        className="block px-5 sm:px-7 py-5 hover:bg-paper-warm/50 transition-colors group"
      >
        <div className="flex items-baseline justify-between gap-3 mb-1.5 flex-wrap">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
              {dateStr}
            </span>
            <span className="font-sub text-[10px] tracking-wide text-paper-faint">
              {durationStr}
            </span>
            {row.demo_mode && (
              <span className="font-sub text-[9px] tracking-[0.18em] uppercase px-1.5 py-px border border-brass/60 text-brass">
                demo
              </span>
            )}
            {active && (
              <span className="font-sub text-[9px] tracking-[0.18em] uppercase px-1.5 py-px border border-moss/60 text-moss">
                active
              </span>
            )}
            {row.end_reason && row.end_reason !== "user_stopped" && (
              <span className="font-sub text-[9px] tracking-wide text-red-pencil">
                {row.end_reason}
              </span>
            )}
          </div>
          <span
            className="font-sub text-[10px] tracking-wide text-paper-faint group-hover:text-red-pencil transition-colors"
            aria-hidden
          >
            replay →
          </span>
        </div>
        <p
          className="text-ink-deep text-[16px] leading-snug mb-2 line-clamp-2"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {problem}
        </p>
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap font-sub text-[10px] tracking-wide text-paper-mute">
          <span>{row.total_cycles ?? 0} cycles</span>
          <span>·</span>
          <span>{row.total_hints ?? 0} hints</span>
          {predicted && (
            <>
              <span>·</span>
              <span>{predicted}</span>
            </>
          )}
          {row.total_cost_usd != null && (
            <>
              <span>·</span>
              <span>${Number(row.total_cost_usd).toFixed(3)}</span>
            </>
          )}
        </div>
      </Link>
    </li>
  );
}

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

function formatDate(d: Date): string {
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return `today ${time}`;
  const ms = now.getTime() - d.getTime();
  const days = Math.floor(ms / 86400_000);
  if (days < 7) {
    const dayName = d.toLocaleDateString([], { weekday: "short" });
    return `${dayName.toLowerCase()} ${time}`;
  }
  return d
    .toLocaleDateString([], {
      month: "short",
      day: "numeric",
    })
    .toLowerCase();
}
