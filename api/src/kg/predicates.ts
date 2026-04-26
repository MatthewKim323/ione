/**
 * Server-side mirror of `landing/src/lib/graph/predicates.ts`.
 *
 * Why mirror instead of import? The api/ workspace doesn't share tsconfig
 * paths with landing/, and Bun/Node ESM dies trying to resolve a sibling
 * package's TS file at runtime. Mirroring is intentional — both copies are
 * the *single source of truth* in their respective domains, and a CI check
 * (Phase 7 / J4) will diff them so they never silently drift.
 *
 * IRON RULE: every claim writes a predicate from this map. Extractors that
 * try to invent a predicate fail validation in `normalizeClaim` and the
 * claim is dropped with a logger.warn. That's how the dashboard's
 * "claims grouped by category" view stays intact even when an LLM
 * hallucinates a new shape.
 */

export const PREDICATES = {
  // ── academic ────────────────────────────────────────────────────────────
  enrolled_in_class:    { category: "academic",    sensitivity: "low" },
  grade_in_class:       { category: "academic",    sensitivity: "low" },
  current_unit:         { category: "academic",    sensitivity: "low" },
  gpa_overall:          { category: "academic",    sensitivity: "low" },
  test_score:           { category: "academic",    sensitivity: "low" },
  graduation_year:      { category: "academic",    sensitivity: "low" },
  teacher_is:           { category: "academic",    sensitivity: "low" },

  // ── performance ─────────────────────────────────────────────────────────
  scored_on_exam:        { category: "performance", sensitivity: "low" },
  missed_problem_on:     { category: "performance", sensitivity: "low" },
  correct_problem_on:    { category: "performance", sensitivity: "low" },
  low_score_in_subject:  { category: "performance", sensitivity: "low" },
  high_score_in_subject: { category: "performance", sensitivity: "low" },

  // ── errors ──────────────────────────────────────────────────────────────
  made_sign_error:       { category: "errors", sensitivity: "low" },
  made_arithmetic_error: { category: "errors", sensitivity: "low" },
  made_concept_gap:      { category: "errors", sensitivity: "low" },
  skipped_step:          { category: "errors", sensitivity: "low" },
  misread_problem:       { category: "errors", sensitivity: "low" },
  ran_out_of_time:       { category: "errors", sensitivity: "low" },

  // ── topics ──────────────────────────────────────────────────────────────
  weak_at_topic:         { category: "topics", sensitivity: "low" },
  strong_at_topic:       { category: "topics", sensitivity: "low" },
  unfamiliar_with_topic: { category: "topics", sensitivity: "low" },
  needs_review_on:       { category: "topics", sensitivity: "low" },
  mastered_topic:        { category: "topics", sensitivity: "low" },

  // ── writing ─────────────────────────────────────────────────────────────
  weak_at_writing_skill: { category: "writing", sensitivity: "low" },
  essay_word_count:      { category: "writing", sensitivity: "low" },
  essay_theme:           { category: "writing", sensitivity: "low" },

  // ── goals & preferences ─────────────────────────────────────────────────
  wants_to_improve_at:           { category: "goals", sensitivity: "low" },
  target_class:                  { category: "goals", sensitivity: "low" },
  target_test:                   { category: "goals", sensitivity: "low" },
  prefers_explanation_style:     { category: "goals", sensitivity: "low" },
  available_study_hours_per_week:{ category: "goals", sensitivity: "low" },

  // ── identity (sensitive — extractors NEVER write 'high'-sensitivity
  //   predicates without status='pending'; the ProposalQueue gate handles
  //   confirmation) ──────────────────────────────────────────────────────
  has_demographic:  { category: "identity", sensitivity: "high"   },
  has_iep_or_504:   { category: "identity", sensitivity: "high"   },
  speaks_language:  { category: "identity", sensitivity: "medium" },

  // ── meta ────────────────────────────────────────────────────────────────
  source_file_ingested:    { category: "meta", sensitivity: "low" },
  claim_disputed_by_user:  { category: "meta", sensitivity: "low" },
} as const;

export type Predicate = keyof typeof PREDICATES;
export type PredicateCategory =
  (typeof PREDICATES)[Predicate]["category"];
export type Sensitivity = "low" | "medium" | "high";

export function isPredicate(v: string): v is Predicate {
  return v in PREDICATES;
}

export function sensitivityOf(p: Predicate): Sensitivity {
  return PREDICATES[p].sensitivity as Sensitivity;
}

/**
 * The whitelist a particular extractor is allowed to emit. Mirrors the
 * `writtenBy` map on the landing side. This is checked at runtime in
 * `runner.ts` — an extractor that tries to write outside its scope has its
 * claim dropped (logged), not pushed through.
 */
export const PREDICATES_BY_EXTRACTOR = {
  TranscriptReader: [
    "enrolled_in_class",
    "grade_in_class",
    "gpa_overall",
    "test_score",
    "graduation_year",
    "low_score_in_subject",
    "high_score_in_subject",
    "weak_at_topic",
    "strong_at_topic",
  ],
  ExamReader: [
    "scored_on_exam",
    "missed_problem_on",
    "correct_problem_on",
    "test_score",
    "made_sign_error",
    "made_arithmetic_error",
    "made_concept_gap",
    "skipped_step",
    "misread_problem",
    "ran_out_of_time",
    "weak_at_topic",
    "unfamiliar_with_topic",
    "needs_review_on",
  ],
  EssayReader: [
    "weak_at_writing_skill",
    "essay_word_count",
    "essay_theme",
    "speaks_language",
  ],
  PracticeWorkReader: [
    "made_sign_error",
    "made_arithmetic_error",
    "made_concept_gap",
    "skipped_step",
    "weak_at_topic",
    "strong_at_topic",
    "needs_review_on",
    "correct_problem_on",
  ],
  SyllabusReader: [
    "current_unit",
    "teacher_is",
  ],
  Pacer: [
    "needs_review_on",
    "mastered_topic",
    "prefers_explanation_style",
  ],
  Archivist: [
    "source_file_ingested",
  ],
} as const satisfies Record<string, readonly Predicate[]>;

export type ExtractorName = keyof typeof PREDICATES_BY_EXTRACTOR;

export function isAllowedFor(
  extractor: ExtractorName,
  predicate: string,
): predicate is Predicate {
  if (!isPredicate(predicate)) return false;
  return (PREDICATES_BY_EXTRACTOR[extractor] as readonly string[]).includes(
    predicate,
  );
}
