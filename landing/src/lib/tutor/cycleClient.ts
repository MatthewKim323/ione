import { ApiError, API_BASE_URL, authedJson, readApiError } from "../api";
import { supabase } from "../supabase";

/**
 * Tutor cycle client.
 *
 * `startSession()` / `endSession()` create and close a tutor_sessions row.
 * `sendCycle()` POSTs a multipart cycle (WebP frame + payload JSON) and
 * returns an async iterator over the SSE events streamed back from
 * `/api/cycle`. EventSource doesn't support POST, so we hand-roll the
 * stream using fetch + ReadableStream.
 */

export type CycleEvent =
  | {
      type: "confidence";
      level: "moss" | "graphite" | "sienna_soft" | "sienna";
      reason: string;
    }
  | {
      type: "hint";
      id: string;
      text: string;
      hint_type:
        | "error_callout"
        | "scaffolding_question"
        | "encouragement"
        | "redirect";
      audio_url: string | null;
      predicted: boolean;
      severity?: 1 | 2 | 3 | 4 | 5;
    }
  | {
      type: "ocr";
      problem_text: string | null;
      current_step_latex: string | null;
      confidence: number;
      page_state:
        | "fresh_problem"
        | "in_progress"
        | "near_complete"
        | "stalled_or_stuck";
    }
  | { type: "done"; cycle_id: string; cost_usd: number; ms: number }
  | { type: "error"; message: string; code?: string };

export type TrajectoryFrame = {
  cycle_index: number;
  client_ts: string;
  page_state:
    | "fresh_problem"
    | "in_progress"
    | "near_complete"
    | "stalled_or_stuck";
  current_step_latex: string | null;
  completed_steps_count: number;
  step_status:
    | "correct"
    | "minor_error"
    | "major_error"
    | "stalled"
    | "off_track"
    | "complete"
    | null;
  is_stalled: boolean;
  seconds_since_last_change: number;
  spoke: boolean;
  hint_text: string | null;
};

export type StartSessionInput = {
  problem_text?: string | null;
  problem_id?: string | null;
  demo_mode?: boolean;
};

export type StartSessionResult = {
  session_id: string;
  started_at: string;
  demo_mode: boolean;
};

export async function startSession(
  input: StartSessionInput = {},
): Promise<StartSessionResult> {
  return authedJson<StartSessionResult>("/api/sessions/start", {
    problem_text: input.problem_text ?? null,
    problem_id: input.problem_id ?? null,
    demo_mode: Boolean(input.demo_mode ?? false),
    client_user_agent: navigator.userAgent,
  });
}

export async function endSession(
  sessionId: string,
  reason:
    | "user_stopped"
    | "browser_closed"
    | "cost_exceeded"
    | "error"
    | "idle_timeout" = "user_stopped",
): Promise<void> {
  await authedJson(`/api/sessions/${sessionId}/end`, { reason });
}

export type SendCycleInput = {
  sessionId: string;
  frame: Blob;
  isStalled: boolean;
  secondsSinceLastChange: number;
  trajectory: TrajectoryFrame[];
  prevCycleId?: string;
  clientTs?: string;
  signal?: AbortSignal;
};

export type SendCycleHandle = {
  /** Async iterator over CycleEvents — `for await (const evt of handle.events)`. */
  events: AsyncIterable<CycleEvent>;
  /** Resolves once the stream finishes. Useful as a `done` await point. */
  done: Promise<void>;
};

/**
 * Streams the SSE response back as parsed CycleEvents. Uses fetch's body
 * ReadableStream + TextDecoder. Spec: each event ends in \n\n; we parse
 * `event:` and `data:` lines and JSON-parse the data payload.
 */
export async function sendCycle(input: SendCycleInput): Promise<SendCycleHandle> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("not authenticated");

  const form = new FormData();
  form.append("frame", input.frame, "frame.webp");
  form.append(
    "payload",
    JSON.stringify({
      session_id: input.sessionId,
      prev_cycle_id: input.prevCycleId,
      is_stalled: input.isStalled,
      seconds_since_last_change: input.secondsSinceLastChange,
      client_ts: input.clientTs ?? new Date().toISOString(),
      trajectory: input.trajectory.slice(-5),
    }),
  );

  const url = `${API_BASE_URL}/api/cycle`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: input.signal,
    });
  } catch (e) {
    if (e instanceof TypeError) {
      throw new ApiError(
        "unknown",
        `couldn't reach the api at ${url}. is the api server running and reachable from this device? (original: ${e.message})`,
        0,
        { url, cause: "network" },
      );
    }
    throw e;
  }
  if (!res.ok || !res.body) {
    throw await readApiError(res);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let resolveDone!: () => void;
  let rejectDone!: (e: unknown) => void;
  const done = new Promise<void>((res, rej) => {
    resolveDone = res;
    rejectDone = rej;
  });

  async function* iterator(): AsyncIterable<CycleEvent> {
    try {
      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        let sepIndex: number;
        while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + 2);
          const evt = parseSseBlock(block);
          if (evt) yield evt;
        }
      }
      // flush any remainder
      buffer += decoder.decode();
      if (buffer.trim()) {
        const evt = parseSseBlock(buffer);
        if (evt) yield evt;
      }
      resolveDone();
    } catch (e) {
      rejectDone(e);
      throw e;
    }
  }

  return { events: iterator(), done };
}

function parseSseBlock(block: string): CycleEvent | null {
  // Each SSE block has lines like:
  //   event: hint
  //   data: {"type":"hint",...}
  // We only need the data line (we already store `type` inside).
  let dataLine = "";
  for (const raw of block.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("data:")) {
      dataLine += line.slice(5).trim();
    }
  }
  if (!dataLine) return null;
  try {
    return JSON.parse(dataLine) as CycleEvent;
  } catch {
    return null;
  }
}
