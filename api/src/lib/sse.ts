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
  | "redirect"
  /**
   * "explanation" is the only hint_type that breaks the Socratic rule.
   * It only ever fires when the student explicitly presses the
   * "I need help" button — i.e. they've already had hints and still
   * can't move. Like a real tutor, ione drops the questions and walks
   * the student through the actual method, including the answer where
   * appropriate. Never produced by the autonomous loop.
   */
  | "explanation";

/**
 * One claim referenced for THIS cycle, surfaced to AgentTrace so the
 * orchestration timeline can render real receipts ("weak_at_topic ·
 * 'chain rule' · failed-exam.md"). Mirrors lib/memory.ts → KgReference.
 */
export type KgReferencePayload = {
  predicate: string;
  object_label: string;
  source_filename: string | null;
  status: string;
  confidence: number;
};

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
      /**
       * Marks the hint as a *user-requested* explanation rather than an
       * autonomous nudge.
       *   • "explain" — pressed the "I need help" button (text trigger).
       *   • "voice"   — held push-to-talk and asked a verbal question
       *                 transcribed by ElevenLabs Scribe.
       *
       * Both bypass the policy gate + cooldown and run the intervention
       * agent in walkthrough mode. The voice path additionally carries
       * `student_question` so the AgentTrace + HintCard can show the
       * student what they asked above the answer.
       */
      assistance?: "explain" | "voice";
      /**
       * Verbatim transcribed question — only set when `assistance === "voice"`.
       * Rendered above the answer so the student (and demo audience) can
       * see exactly what was heard before the agent responds.
       */
      student_question?: string;
    }
  | {
      /**
       * Emitted at the start of a voice-triggered cycle, BEFORE the agents
       * run. Carries the transcribed text + raw audio metadata so the
       * AgentTrace can show "voice asked: '...'" as its own stage chip
       * before the rest of the pipeline lights up. Always present when the
       * cycle was initiated by push-to-talk; never present otherwise.
       */
      type: "voice_question";
      text: string;
      language_code: string | null;
      duration_sec: number | null;
    }
  | {
      type: "ocr";
      problem_text: string | null;
      current_step_latex: string | null;
      /**
       * Completed lines the student has already finished, in order. Lets
       * AgentTrace render the *whole* trail of work the OCR pipeline saw
       * — not just the line Sonnet picked as "current". Without this the
       * demo audience only sees a single row like "read x=3" even though
       * Mathpix and Sonnet both parsed the full chain of equations.
       */
      completed_steps_latex: string[];
      /**
       * Raw Mathpix transcription for the entire frame. This is the
       * unfiltered "what did the OCR engine actually see" output, useful
       * to surface in the trace as a receipt so users can verify ione
       * isn't just hallucinating a single step. Null if Mathpix wasn't
       * called or returned nothing parseable.
       */
      mathpix_latex: string | null;
      mathpix_confidence: number | null;
      confidence: number;
      page_state:
        | "fresh_problem"
        | "in_progress"
        | "near_complete"
        | "stalled_or_stuck";
    }
  | {
      /**
       * Emitted right after the orchestrator pulls the user's longitudinal
       * StruggleProfile + claim references — i.e. the "memory layer was
       * consulted before the agents ran" signal. The frontend renders a
       * dedicated "memory" stage in AgentTrace and lists each reference as
       * a tiny receipt with its source filename.
       *
       * `had_profile=false` is a meaningful state: the cycle ran cold (no
       * prior history), and the UI should say so explicitly so the demo
       * audience can see the difference between "watching with memory" and
       * "watching cold".
       */
      type: "kg_lookup";
      had_profile: boolean;
      claim_count: number;
      pattern_summary: string | null;
      dominant_error: string | null;
      frequency: string | null;
      references: KgReferencePayload[];
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
