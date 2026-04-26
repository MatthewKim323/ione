// Hand-authored types that mirror the supabase/migrations SQL. Replace with
// generated types (`npx supabase gen types typescript`) once the schema
// stabilizes. Keep it minimal for now — the columns we read/write from the
// app, not every column on the table.

export type Grade =
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "11"
  | "12"
  | "college"
  | "adult";

export type MathClass =
  | "pre_algebra"
  | "algebra_1"
  | "geometry"
  | "algebra_2"
  | "trigonometry"
  | "pre_calculus"
  | "calculus_1"
  | "ap_calc_ab"
  | "ap_calc_bc"
  | "calculus_2"
  | "linear_algebra"
  | "statistics"
  | "other";

export type TrickyTopic =
  | "sign_errors"
  | "fractions"
  | "word_problems"
  | "algebra_manipulation"
  | "factoring"
  | "exponents_logs"
  | "trig_identities"
  | "limits"
  | "derivatives"
  | "integrals"
  | "showing_work"
  | "memorizing_rules"
  | "reading_problem"
  | "time_pressure";

export type HintFrequency = "rare" | "balanced" | "active";

// NOTE: declared as a `type` alias, not an `interface`. supabase-js constrains
// `Row`/`Insert`/`Update` to `Record<string, unknown>`, and TS does not consider
// interfaces assignable to `Record<string, unknown>` (since interfaces are open
// for declaration merging). Type aliases are closed and satisfy the constraint.
export type Profile = {
  id: string; // matches auth.users.id
  first_name: string;
  grade: Grade | null;
  current_class: MathClass | null;
  tricky_topics: TrickyTopic[];
  hint_voice: boolean;
  hint_frequency: HintFrequency;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileInsert = {
  id: string;
  first_name?: string;
  grade?: Grade | null;
  current_class?: MathClass | null;
  tricky_topics?: TrickyTopic[];
  hint_voice?: boolean;
  hint_frequency?: HintFrequency;
  onboarded_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ProfileUpdate = Partial<Omit<Profile, "id" | "created_at">>;

// ── knowledge graph (mirrors 0002_knowledge_graph.sql) ────────────────────

export type SourceKind =
  | "transcript"
  | "failed_exam"
  | "practice_work"
  | "essay"
  | "syllabus"
  | "note"
  | "voice"
  | "other";

export type ClaimStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "superseded";

export type Sensitivity = "low" | "medium" | "high";

export type SourceFile = {
  id: string;
  owner: string;
  kind: SourceKind;
  filename: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  title: string | null;
  status: "pending" | "parsed" | "extracted" | "failed";
  uploaded_at: string;
};

export type SourceFileInsert = {
  id?: string;
  owner: string;
  kind: SourceKind;
  filename: string;
  storage_path: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  title?: string | null;
  status?: SourceFile["status"];
  uploaded_at?: string;
};

export type Artifact = {
  id: string;
  source_file_id: string;
  kind: string;
  content: Record<string, unknown>;
  position: number | null;
  created_at: string;
};

export type Chunk = {
  id: string;
  source_file_id: string;
  artifact_id: string | null;
  source_kind: SourceKind;
  text: string;
  position: number | null;
  offset_start: number | null;
  offset_end: number | null;
  tokens: unknown[];
  created_at: string;
};

export type ChunkInsert = {
  id?: string;
  source_file_id: string;
  artifact_id?: string | null;
  source_kind: SourceKind;
  text: string;
  offset_start?: number | null;
  offset_end?: number | null;
  tokens?: unknown[];
};

export type Entity = {
  id: string;
  kind: string;
  canonical_name: string;
  aliases: string[];
  meta: Record<string, unknown>;
  created_at: string;
};

export type Claim = {
  id: string;
  owner: string;
  subject_entity: string;
  predicate: string;
  object: unknown;
  confidence: number;
  status: ClaimStatus;
  sensitivity: Sensitivity;
  source_artifact_id: string | null;
  source_chunk_id: string | null;
  source_file_id: string | null;
  extracted_by: string;
  reasoning: string | null;
  created_at: string;
  confirmed_at: string | null;
};

export type Relationship = {
  id: string;
  owner: string;
  from_entity_id: string;
  to_entity_id: string;
  predicate: string;
  weight: number;
  source_claim_id: string | null;
  created_at: string;
};

export type GraphEvent = {
  id: string;
  owner: string | null;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type GraphEventInsert = {
  id?: string;
  owner?: string | null;
  kind: string;
  payload?: Record<string, unknown>;
};

// ── tutor sessions / cycles / hints (mirrors 0003_tutor_sessions.sql) ─────

export type PageState =
  | "fresh_problem"
  | "in_progress"
  | "near_complete"
  | "stalled_or_stuck";

export type StepStatus =
  | "correct"
  | "minor_error"
  | "major_error"
  | "stalled"
  | "off_track"
  | "complete"
  | "unknown";

export type HintType =
  | "error_callout"
  | "scaffolding_question"
  | "encouragement"
  | "redirect";

export type SessionEndReason =
  | "user_stopped"
  | "browser_closed"
  | "cost_exceeded"
  | "error"
  | "idle_timeout";

export type TutorSession = {
  id: string;
  user_id: string;
  problem_text: string | null;
  problem_topic: string | null;
  problem_id: string | null;
  canonical_solution_json: Record<string, unknown> | null;
  demo_mode: boolean;
  client_user_agent: string | null;
  started_at: string;
  ended_at: string | null;
  end_reason: SessionEndReason | null;
  total_cost_usd: number;
  total_cycles: number;
  total_hints: number;
  predicted_correct: number;
  predicted_total: number;
};

export type TutorSessionInsert = Partial<
  Omit<TutorSession, "id" | "user_id" | "started_at">
> & {
  id?: string;
  user_id: string;
  started_at?: string;
};

export type TutorSessionUpdate = Partial<
  Omit<TutorSession, "id" | "user_id" | "started_at">
>;

export type TutorCycle = {
  id: string;
  session_id: string;
  user_id: string;
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
  ocr_page_state: PageState | null;
  ocr_confidence: number | null;
  ocr_is_blank: boolean;
  mathpix_latex: string | null;
  mathpix_confidence: number | null;

  step_status: StepStatus | null;
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

  cost_usd: number;
  latency_ms: number | null;
  tokens_input: number | null;
  tokens_output: number | null;

  frame_storage_path: string | null;

  ocr_json: Record<string, unknown>;
  reasoning_json: Record<string, unknown>;
  predictive_json: Record<string, unknown>;
  intervention_json: Record<string, unknown>;
};

export type TutorCycleInsert = Partial<
  Omit<TutorCycle, "id" | "server_started_at">
> & {
  id?: string;
  session_id: string;
  user_id: string;
  cycle_index: number;
  client_ts: string;
  server_started_at?: string;
};

export type TutorCycleUpdate = Partial<
  Omit<TutorCycle, "id" | "session_id" | "user_id">
>;

export type TutorHint = {
  id: string;
  session_id: string;
  cycle_id: string | null;
  user_id: string;
  hint_type: HintType;
  text: string;
  predicted: boolean;
  severity: number | null;
  audio_storage_path: string | null;
  audio_duration_ms: number | null;
  was_helpful: boolean | null;
  reasoning_for_decision: string | null;
  created_at: string;
};

export type TutorHintInsert = Partial<
  Omit<TutorHint, "id" | "created_at">
> & {
  id?: string;
  session_id: string;
  user_id: string;
  hint_type: HintType;
  text: string;
};

export type TutorHintUpdate = Partial<
  Omit<TutorHint, "id" | "session_id" | "user_id" | "created_at">
>;

// ── Database root, shaped for @supabase/supabase-js v2 ────────────────────
// Mirrors the shape `supabase gen types typescript` emits in 2.x. The
// `__InternalSupabase` field is required: supabase-js types reach inside
// `Database` and `Omit<Database, '__InternalSupabase'>`-style logic chokes
// when it isn't present.
export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      source_files: {
        Row: SourceFile;
        Insert: SourceFileInsert;
        Update: Partial<Omit<SourceFile, "id" | "owner" | "uploaded_at">>;
        Relationships: [];
      };
      artifacts: {
        Row: Artifact;
        Insert: Omit<Artifact, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Artifact, "id" | "created_at">>;
        Relationships: [];
      };
      chunks: {
        Row: Chunk;
        Insert: ChunkInsert;
        Update: Partial<Omit<Chunk, "id" | "created_at">>;
        Relationships: [];
      };
      entities: {
        Row: Entity;
        Insert: Omit<Entity, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Entity, "id" | "created_at">>;
        Relationships: [];
      };
      claims: {
        Row: Claim;
        Insert: Omit<Claim, "id" | "created_at" | "confirmed_at"> & {
          id?: string;
          created_at?: string;
          confirmed_at?: string | null;
        };
        Update: Partial<Omit<Claim, "id" | "created_at">>;
        Relationships: [];
      };
      relationships: {
        Row: Relationship;
        Insert: Omit<Relationship, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Relationship, "id" | "created_at">>;
        Relationships: [];
      };
      events: {
        Row: GraphEvent;
        Insert: GraphEventInsert;
        Update: Partial<GraphEventInsert>;
        Relationships: [];
      };
      tutor_sessions: {
        Row: TutorSession;
        Insert: TutorSessionInsert;
        Update: TutorSessionUpdate;
        Relationships: [];
      };
      tutor_cycles: {
        Row: TutorCycle;
        Insert: TutorCycleInsert;
        Update: TutorCycleUpdate;
        Relationships: [];
      };
      tutor_hints: {
        Row: TutorHint;
        Insert: TutorHintInsert;
        Update: TutorHintUpdate;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      grade_level: Grade;
      math_class: MathClass;
      tricky_topic: TrickyTopic;
      hint_frequency: HintFrequency;
      source_kind: SourceKind;
      claim_status: ClaimStatus;
      sensitivity: Sensitivity;
      page_state: PageState;
      step_status: StepStatus;
      hint_type: HintType;
      session_end_reason: SessionEndReason;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
