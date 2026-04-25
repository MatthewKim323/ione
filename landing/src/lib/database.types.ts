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
    };
    CompositeTypes: { [_ in never]: never };
  };
};
