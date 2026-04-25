/**
 * The controlled predicate vocabulary for ione's student-scope knowledge graph.
 *
 * HARD RULE (borrowed from Nami's PLAN.md §5.5):
 *   Every claim uses a predicate from this list. Agents do NOT invent
 *   predicates at runtime. Without this, the ExamReader writes
 *   `weak_at: "factoring"`, the TranscriptReader writes
 *   `struggles_with_topic: "factoring"`, and no agent can answer the
 *   question "what does the student suck at" with a single query.
 *
 * Categories track ione's actual surface area as a math tutor:
 *   - academic    schools / classes / grades the student takes
 *   - performance how the student does in those classes
 *   - errors      *kinds* of mistakes (sign errors, etc.)
 *   - topics      math topics the student is weak/strong at
 *   - goals       what they want to learn / improve
 *   - meta        bookkeeping (file ingested, claim disputed, etc.)
 *
 * Sensitivity gates the ProposalQueue: high-sensitivity claims need
 * explicit confirmation before any agent can use them.
 */

export const PREDICATES = {
  // ─── academic ──────────────────────────────────────────────────────────
  enrolled_in_class: {
    category: "academic",
    writtenBy: ["TranscriptReader", "user"],
  },
  grade_in_class: {
    category: "academic",
    writtenBy: ["TranscriptReader"],
  },
  current_unit: {
    category: "academic",
    writtenBy: ["SyllabusReader", "user"],
  },
  gpa_overall: {
    category: "academic",
    writtenBy: ["TranscriptReader"],
  },
  test_score: {
    category: "academic",
    writtenBy: ["TranscriptReader", "ExamReader", "user"],
  },
  graduation_year: {
    category: "academic",
    writtenBy: ["TranscriptReader", "user"],
  },
  teacher_is: {
    category: "academic",
    writtenBy: ["SyllabusReader", "user"],
  },

  // ─── performance ───────────────────────────────────────────────────────
  scored_on_exam: {
    category: "performance",
    writtenBy: ["ExamReader"],
  },
  missed_problem_on: {
    category: "performance",
    writtenBy: ["ExamReader"],
  },
  correct_problem_on: {
    category: "performance",
    writtenBy: ["ExamReader", "PracticeWorkReader"],
  },
  low_score_in_subject: {
    category: "performance",
    writtenBy: ["TranscriptReader"],
  },
  high_score_in_subject: {
    category: "performance",
    writtenBy: ["TranscriptReader"],
  },

  // ─── errors (the *kind* of mistake) ────────────────────────────────────
  made_sign_error: {
    category: "errors",
    writtenBy: ["ExamReader", "PracticeWorkReader"],
  },
  made_arithmetic_error: {
    category: "errors",
    writtenBy: ["ExamReader", "PracticeWorkReader"],
  },
  made_concept_gap: {
    category: "errors",
    writtenBy: ["ExamReader", "PracticeWorkReader"],
  },
  skipped_step: {
    category: "errors",
    writtenBy: ["ExamReader", "PracticeWorkReader"],
  },
  misread_problem: {
    category: "errors",
    writtenBy: ["ExamReader"],
  },
  ran_out_of_time: {
    category: "errors",
    writtenBy: ["ExamReader", "user"],
  },

  // ─── topics ────────────────────────────────────────────────────────────
  weak_at_topic: {
    category: "topics",
    writtenBy: ["ExamReader", "PracticeWorkReader", "TranscriptReader", "user"],
  },
  strong_at_topic: {
    category: "topics",
    writtenBy: ["ExamReader", "PracticeWorkReader", "TranscriptReader", "user"],
  },
  unfamiliar_with_topic: {
    category: "topics",
    writtenBy: ["ExamReader", "user"],
  },
  needs_review_on: {
    category: "topics",
    writtenBy: ["ExamReader", "PracticeWorkReader", "Pacer"],
  },
  mastered_topic: {
    category: "topics",
    writtenBy: ["Pacer", "user"],
  },

  // ─── writing-side struggles (since users may upload writing exams) ─────
  weak_at_writing_skill: {
    category: "writing",
    writtenBy: ["EssayReader", "user"],
  },
  essay_word_count: {
    category: "writing",
    writtenBy: ["EssayReader"],
  },
  essay_theme: {
    category: "writing",
    writtenBy: ["EssayReader"],
  },

  // ─── goals & preferences ───────────────────────────────────────────────
  wants_to_improve_at: {
    category: "goals",
    writtenBy: ["user"],
  },
  target_class: {
    category: "goals",
    writtenBy: ["user"],
  },
  target_test: {
    category: "goals",
    writtenBy: ["user"],
  },
  prefers_explanation_style: {
    category: "goals",
    writtenBy: ["user", "Pacer"],
    sensitivity: "low",
  },
  available_study_hours_per_week: {
    category: "goals",
    writtenBy: ["user"],
  },

  // ─── identity (high sensitivity — gated behind ProposalQueue) ──────────
  has_demographic: {
    category: "identity",
    writtenBy: ["user"],
    sensitivity: "high",
  },
  has_iep_or_504: {
    category: "identity",
    writtenBy: ["user"],
    sensitivity: "high",
  },
  speaks_language: {
    category: "identity",
    writtenBy: ["user", "EssayReader"],
    sensitivity: "medium",
  },

  // ─── meta ──────────────────────────────────────────────────────────────
  source_file_ingested: {
    category: "meta",
    writtenBy: ["Archivist"],
  },
  claim_disputed_by_user: {
    category: "meta",
    writtenBy: ["ProposalQueue"],
  },
} as const;

export type Predicate = keyof typeof PREDICATES;

export type PredicateCategory =
  (typeof PREDICATES)[Predicate]["category"];

/** ProposalQueue uses this to decide whether a claim needs confirmation. */
export function sensitivityOf(p: Predicate): "low" | "medium" | "high" {
  const meta = PREDICATES[p] as { sensitivity?: "low" | "medium" | "high" };
  return meta.sensitivity ?? "low";
}

export function predicatesByCategory(
  category: PredicateCategory,
): Predicate[] {
  return (Object.keys(PREDICATES) as Predicate[]).filter(
    (p) => PREDICATES[p].category === category,
  );
}
