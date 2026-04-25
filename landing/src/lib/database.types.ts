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
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      grade_level: Grade;
      math_class: MathClass;
      tricky_topic: TrickyTopic;
      hint_frequency: HintFrequency;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
