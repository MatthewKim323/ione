/**
 * patterns.ts — read-only aggregations for /dashboard/patterns.
 *
 * Phase 4 / G3.
 *
 * We compute four series, one row per past tutor_session (most-recent
 * sessions on the right of the sparkline):
 *
 *   1. errorCount      number of cycles in the session whose step_status
 *                      was minor_error or major_error
 *   2. timeToFirstStep seconds between the session's first cycle and the
 *                      first cycle whose ocr_page_state moved off
 *                      "fresh_problem" (i.e., the student actually wrote
 *                      something)
 *   3. stallFrequency  cycles where is_stalled=true / total cycles, ×100
 *   4. hintAcceptance  hints in the session where was_helpful=true /
 *                      total hints whose was_helpful is non-null, ×100
 *
 * Anything we can't compute (e.g., student never started writing) is
 * returned as null and the chart skips it. We also return summary
 * stats so the page can show "47 sessions · 312 cycles · 84 hints".
 */
import { supabase } from "./supabase";

export interface PatternPoint {
  sessionId: string;
  index: number; // 1-based, oldest = 1
  startedAt: string;
  errorCount: number | null;
  timeToFirstStepSec: number | null;
  stallFrequencyPct: number | null;
  hintAcceptancePct: number | null;
  cycleCount: number;
  hintCount: number;
}

export interface PatternsSummary {
  sessions: number;
  cycles: number;
  hints: number;
  predictedCorrect: number;
  predictedTotal: number;
  windowDays: number;
}

export interface PatternsResult {
  points: PatternPoint[];
  summary: PatternsSummary;
}

const DEFAULT_WINDOW_DAYS = 30;
const MAX_SESSIONS = 30;

export async function loadPatterns(
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<PatternsResult> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return {
      points: [],
      summary: {
        sessions: 0,
        cycles: 0,
        hints: 0,
        predictedCorrect: 0,
        predictedTotal: 0,
        windowDays,
      },
    };
  }
  const userId = userData.user.id;
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();

  const { data: sessions, error: sErr } = await supabase
    .from("tutor_sessions")
    .select(
      "id, started_at, total_cycles, total_hints, predicted_correct, predicted_total",
    )
    .eq("user_id", userId)
    .gte("started_at", since)
    .order("started_at", { ascending: true })
    .limit(MAX_SESSIONS);
  if (sErr) {
    console.error("[patterns] sessions fetch failed", sErr);
    return {
      points: [],
      summary: {
        sessions: 0,
        cycles: 0,
        hints: 0,
        predictedCorrect: 0,
        predictedTotal: 0,
        windowDays,
      },
    };
  }
  if (!sessions || sessions.length === 0) {
    return {
      points: [],
      summary: {
        sessions: 0,
        cycles: 0,
        hints: 0,
        predictedCorrect: 0,
        predictedTotal: 0,
        windowDays,
      },
    };
  }

  const sessionIds = sessions.map((s) => s.id);

  const { data: cycles, error: cErr } = await supabase
    .from("tutor_cycles")
    .select(
      "session_id, cycle_index, server_started_at, step_status, is_stalled, ocr_page_state",
    )
    .in("session_id", sessionIds)
    .order("session_id", { ascending: true })
    .order("cycle_index", { ascending: true });
  if (cErr) console.error("[patterns] cycles fetch failed", cErr);

  const { data: hints, error: hErr } = await supabase
    .from("tutor_hints")
    .select("session_id, was_helpful")
    .in("session_id", sessionIds);
  if (hErr) console.error("[patterns] hints fetch failed", hErr);

  const cyclesBySession = groupBy(cycles ?? [], (c) => c.session_id as string);
  const hintsBySession = groupBy(hints ?? [], (h) => h.session_id as string);

  const points: PatternPoint[] = sessions.map((s, i) => {
    const cs = cyclesBySession.get(s.id) ?? [];
    const hs = hintsBySession.get(s.id) ?? [];

    const errorCount = cs.filter(
      (c) => c.step_status === "minor_error" || c.step_status === "major_error",
    ).length;

    const stallCount = cs.filter((c) => c.is_stalled === true).length;
    const stallFrequencyPct =
      cs.length > 0 ? (stallCount / cs.length) * 100 : null;

    let timeToFirstStepSec: number | null = null;
    if (cs.length > 0) {
      const first = cs[0];
      const moved = cs.find(
        (c) =>
          c.ocr_page_state &&
          c.ocr_page_state !== "fresh_problem" &&
          c.ocr_page_state !== null,
      );
      if (moved) {
        const a = new Date(first.server_started_at as string).getTime();
        const b = new Date(moved.server_started_at as string).getTime();
        if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
          timeToFirstStepSec = Math.round((b - a) / 1000);
        }
      }
    }

    const resolvedHints = hs.filter(
      (h) => typeof h.was_helpful === "boolean",
    );
    const helpful = resolvedHints.filter((h) => h.was_helpful === true).length;
    const hintAcceptancePct =
      resolvedHints.length > 0
        ? (helpful / resolvedHints.length) * 100
        : null;

    return {
      sessionId: s.id,
      index: i + 1,
      startedAt: s.started_at,
      errorCount: cs.length > 0 ? errorCount : null,
      timeToFirstStepSec,
      stallFrequencyPct,
      hintAcceptancePct,
      cycleCount: cs.length,
      hintCount: hs.length,
    };
  });

  const summary: PatternsSummary = {
    sessions: sessions.length,
    cycles: sessions.reduce((acc, s) => acc + (s.total_cycles ?? 0), 0),
    hints: sessions.reduce((acc, s) => acc + (s.total_hints ?? 0), 0),
    predictedCorrect: sessions.reduce(
      (acc, s) => acc + (s.predicted_correct ?? 0),
      0,
    ),
    predictedTotal: sessions.reduce(
      (acc, s) => acc + (s.predicted_total ?? 0),
      0,
    ),
    windowDays,
  };

  return { points, summary };
}

function groupBy<T, K>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const item of arr) {
    const k = key(item);
    let bucket = m.get(k);
    if (!bucket) {
      bucket = [];
      m.set(k, bucket);
    }
    bucket.push(item);
  }
  return m;
}
