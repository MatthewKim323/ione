/**
 * SSE event schema mirrored byte-for-byte in
 * landing/src/lib/tutor/cycleClient.ts. Keep these two files in lockstep —
 * the orchestrator emits `CycleEvent`s and the browser's
 * cycleClient typechecks against the exact same union.
 */

export type ConfidenceLevel = "moss" | "graphite" | "sienna_soft" | "sienna";

export type HintType =
  | "error_callout"
  | "scaffolding_question"
  | "encouragement"
  | "redirect";

export type CycleEvent =
  | {
      type: "confidence";
      level: ConfidenceLevel;
      reason: string;
    }
  | {
      type: "hint";
      id: string;
      text: string;
      hint_type: HintType;
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
  | {
      type: "done";
      cycle_id: string;
      cost_usd: number;
      ms: number;
    }
  | {
      type: "error";
      message: string;
      code?: string;
    };

/**
 * Hono's `streamSSE` writes raw text. We emit one `event:` + `data:` block
 * per CycleEvent. The browser's EventSource (or our fetch+ReadableStream
 * consumer) parses by `type` to discriminate the union.
 */
export function formatSseEvent(evt: CycleEvent): string {
  return `event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`;
}
