// shared/demo-types.ts
// Types matching the demo JSON shapes. Adjust field names if your real schema differs.

export type StudentId = `student:${string}`;
export type ConceptId = `concept:${string}`;
export type ErrorPatternId = `error:${string}`;
export type SessionId = `session:${string}` | `sess_${string}`;

export type KGNode =
  | { id: StudentId; type: "student"; label: string; grade: number; course: string; first_seen: string; session_count: number }
  | { id: ConceptId; type: "concept"; label: string; domain: string; depth: number }
  | { id: ErrorPatternId; type: "error_pattern"; label: string; severity: "low" | "medium" | "high"; first_observed: string; occurrences: number }
  | { id: string; type: "intervention_kind"; label: string; count_total: number }
  | { id: SessionId; type: "session"; label: string; student: StudentId; duration_sec: number; frames_processed: number; interventions: number };

export type KGEdgeRel =
  | "prerequisite_of"
  | "co_required_with"
  | "easily_confused_with"
  | "struggles_with"
  | "manifests_in"
  | "root_cause_in"
  | "co_occurs_with"
  | "specializes_to"
  | "observed"
  | "produced"
  | "had_session";

export interface KGEdge {
  from: string;
  to: string;
  rel: KGEdgeRel;
  weight?: number;
  count?: number;
  evidence_sessions?: number;
}

export interface BackboardKG {
  _meta: {
    schema_version: string;
    kg_type: string;
    generated_at: string;
    description: string;
    node_count: number;
    edge_count: number;
  };
  nodes: KGNode[];
  edges: KGEdge[];
}

// ---------- Agent outputs ----------

export interface OCRPageState {
  _meta: {
    agent: "ocr";
    session_id: string;
    frame_id: string;
    captured_at: string;
    mathpix_request_id: string;
    processing_ms: number;
  };
  page_state: {
    problem: { stated: string; source: string; topic_tags: string[] };
    student_work: Array<{
      line: number;
      latex: string;
      kind: "given" | "student_step" | "student_answer";
      confidence: number;
      notes?: string;
    }>;
    scratch_marks: Array<{ near_line: number; kind: string; content: string }>;
    page_geometry: {
      writing_orientation: string;
      lines_detected: number;
      ink_density: number;
      pen_color: string;
    };
  };
  structured_output: {
    current_line: number;
    answer_present: boolean;
    answer_value: string | null;
    work_complete: boolean;
    ready_for_evaluation: boolean;
    missing_step_hint?: string;
  };
}

export interface ReasoningEval {
  _meta: {
    agent: "reasoning";
    session_id: string;
    frame_id: string;
    model: string;
    calls_made: number;
    cache_hit_canonical: boolean;
    evaluated_at: string;
  };
  canonical_solution: {
    problem: string;
    steps: Array<{ step: number; latex: string; rationale: string }>;
    final_answer: string;
  };
  evaluation: {
    verdict: "correct" | "incorrect" | "incomplete";
    first_divergence_line: number | null;
    line_results: Array<{
      line: number;
      status: "ok" | "error" | "partial" | "consistent_with_prior_error";
      matches_canonical: boolean;
      expected_latex?: string;
      observed_latex?: string;
      error_classification?: string;
      error_subtype?: string;
      explanation_for_intervention?: string;
      confidence?: number;
      observed_answer?: string;
      canonical_answer?: string;
      note?: string;
    }>;
  };
  kg_lookup: {
    student: StudentId;
    matched_pattern: ErrorPatternId;
    prior_occurrences: number;
    session_streak: number;
    is_recurring: boolean;
    specializes_pattern?: ErrorPatternId;
    last_intervention_kind_for_this_pattern: string;
    last_intervention_outcome: string;
  };
  intervention_recommendation: {
    should_intervene: boolean;
    kind: string;
    rationale: string;
    suggested_utterance_seed: string;
  };
}

export interface InterventionDecision {
  session_id: string;
  frame_id: string;
  ts: string;
  evaluation_verdict: string;
  decision: "speak" | "stay_silent";
  kind?: string;
  utterance?: string;
  tts_voice?: string;
  outcome?: string;
  reasoning?: string;
  kg_pattern?: string;
  kg_recurrence?: number;
}
