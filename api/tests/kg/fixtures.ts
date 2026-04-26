/**
 * KG extractor eval fixtures (Phase 6 / I2).
 *
 * Four hand-crafted documents — one per content extractor — designed to
 * provoke a known shape of claims. The eval asserts that:
 *
 *   1. The expected predicates appeared at least once.
 *   2. At least one claim's `subject_entity` matches what we expected
 *      (almost always "Student", but the schema allows entity-on-entity).
 *   3. At least one claim's `object` includes a probe value we hand-crafted
 *      into the source document. That's how we know the LLM actually read
 *      the chunks instead of hallucinating.
 *
 * We pass the chunks straight to each extractor's `.run()`, so the
 * harness covers `extractor-base.runLlmExtraction → validateAndMapClaims`
 * end-to-end. The runner / supabase persistence layer is NOT exercised
 * here — that has its own unit tests where we don't want to pay for an LLM.
 */

import type { ChunkInput } from "../../src/kg/types.js";
import type { Predicate, ExtractorName } from "../../src/kg/predicates.js";

export interface ExtractorScenario {
  id: string;
  extractor: ExtractorName;
  /** Source kind — also controls which extractor handles() it. */
  source_kind:
    | "transcript"
    | "failed_exam"
    | "essay"
    | "practice_work";
  /** Hand-crafted chunks. The runner numbers them 0..n. */
  chunks: ChunkInput[];
  expected: {
    /** Predicates that MUST appear at least once. */
    must_emit: Predicate[];
    /** Subject entities we expect on at least one claim. */
    must_subject?: string[];
    /**
     * String / number probes that MUST appear in at least one claim's `object`.
     * If a probe is a string we substring-match (case-insensitive); numeric
     * probes are exact-match against any numeric leaf in the object.
     */
    must_object_contains?: Array<string | number>;
  };
}

const c = (
  id: string,
  source_kind: ChunkInput["source_kind"],
  text: string,
  position: number,
): ChunkInput => ({
  id,
  source_file_id: `fixture_${source_kind}`,
  source_kind,
  text,
  position,
});

// ── 1. Transcript ──────────────────────────────────────────────────────────
const transcriptScenario: ExtractorScenario = {
  id: "kg_transcript_alex",
  extractor: "TranscriptReader",
  source_kind: "transcript",
  chunks: [
    c(
      "transcript-chunk-1",
      "transcript",
      [
        "WESTLAKE HIGH SCHOOL — OFFICIAL TRANSCRIPT",
        "Student: Alex Rivera   Graduation Year: 2027",
        "",
        "Fall 2025 semester:",
        "- AP Calculus AB ........................ B-",
        "- AP US History ......................... A",
        "- Honors English 11 ..................... A-",
        "- Spanish 3 ............................. B+",
        "- Physics ............................... C+",
        "Cumulative GPA (4.0 scale): 3.42",
      ].join("\n"),
      0,
    ),
    c(
      "transcript-chunk-2",
      "transcript",
      [
        "Standardized test scores on file:",
        "- PSAT/NMSQT (Oct 2025): 1280 (max 1520)",
        "- SAT Subject — Math II (May 2025): 690",
        "Notes: Math grades trend lower than humanities — recommend additional",
        "review on AP Calculus topics, especially limits and derivatives.",
      ].join("\n"),
      1,
    ),
  ],
  expected: {
    must_emit: ["enrolled_in_class", "grade_in_class", "gpa_overall"],
    must_subject: ["Student"],
    must_object_contains: ["Calculus", 3.42],
  },
};

// ── 2. Failed exam ─────────────────────────────────────────────────────────
const examScenario: ExtractorScenario = {
  id: "kg_exam_calculus_unit2",
  extractor: "ExamReader",
  source_kind: "failed_exam",
  chunks: [
    c(
      "exam-chunk-1",
      "failed_exam",
      [
        "AP CALCULUS AB — UNIT 2 EXAM (Limits & Derivatives)",
        "Student: Alex Rivera   Date: 2026-03-12   Score: 21 / 40 (53%)",
        "",
        "Problem 3 [-4 pts]: Find d/dx [3x^2 - 5x + 7].",
        "  Student wrote: 6x - 5 + 7. Forgot constant rule — kept the +7.",
        "Problem 5 [-3 pts]: Evaluate lim_{x→2} (x^2-4)/(x-2).",
        "  Student wrote: 'undefined'. Did not factor (x-2)(x+2)/(x-2).",
        "Problem 7 [-2 pts]: Sign of derivative at x=-1 for f(x)=-x^3+2x.",
        "  Student dropped the leading minus and wrote +1 instead of -1.",
      ].join("\n"),
      0,
    ),
    c(
      "exam-chunk-2",
      "failed_exam",
      [
        "Problem 9 [-5 pts]: Find slope of tangent line at x=3 for f(x)=x^2.",
        "  Student left blank — ran out of time per their note.",
        "Problem 11 [correct]: Power rule on f(x)=4x^3 → 12x^2.",
        "Pattern observed: 4 of 6 errors trace to limits + sign handling.",
      ].join("\n"),
      1,
    ),
  ],
  expected: {
    must_emit: ["scored_on_exam", "missed_problem_on"],
    must_subject: ["Student"],
    must_object_contains: ["Calculus", "limits"],
  },
};

// ── 3. Essay ───────────────────────────────────────────────────────────────
const essayScenario: ExtractorScenario = {
  id: "kg_essay_oedipus",
  extractor: "EssayReader",
  source_kind: "essay",
  chunks: [
    c(
      "essay-chunk-1",
      "essay",
      [
        "Title: Fate vs Free Will in Oedipus Rex",
        "Word count: 612",
        "",
        "Oedipus Rex is a play about fate. The play has many themes. One theme is",
        "fate. Another theme is free will. Oedipus tries to escape his fate but he",
        "can't. The author Sophocles thinks fate wins. There are many examples in",
        "the play. The first example is when Oedipus learns the prophecy.",
      ].join("\n"),
      0,
    ),
    c(
      "essay-chunk-2",
      "essay",
      [
        "The second example is when he kills his father at the crossroads. The",
        "third example is when he marries his mother. He doesn't know it's his",
        "mother but he does it anyway. So fate wins. In conclusion, fate vs free",
        "will is a important theme in Oedipus Rex. Sophocles shows us that fate",
        "is more strong than free will.",
      ].join("\n"),
      1,
    ),
  ],
  expected: {
    must_emit: ["weak_at_writing_skill", "essay_theme"],
    must_subject: ["Student"],
    must_object_contains: ["fate"],
  },
};

// ── 4. Practice work ───────────────────────────────────────────────────────
const practiceScenario: ExtractorScenario = {
  id: "kg_practice_factoring",
  extractor: "PracticeWorkReader",
  source_kind: "practice_work",
  chunks: [
    c(
      "practice-chunk-1",
      "practice_work",
      [
        "Algebra 2 — Factoring practice (5 problems, ungraded)",
        "",
        "1. x^2 - 7x + 12  → student wrote (x+3)(x+4). Wrong signs:",
        "   p+q should equal -7, p·q = 12. Should be (x-3)(x-4).",
        "2. x^2 + 5x + 6   → student wrote (x+2)(x+3). Correct.",
        "3. x^2 - 9        → student wrote (x-3)(x-3). Forgot DOTS:",
        "   x^2 - 9 = (x-3)(x+3).",
      ].join("\n"),
      0,
    ),
    c(
      "practice-chunk-2",
      "practice_work",
      [
        "4. 2x^2 + 8x      → student wrote 2(x^2+4x), then stopped. Did not",
        "   pull out additional x: 2x(x+4).",
        "5. x^2 + 4x + 4   → student wrote (x+2)^2. Correct.",
        "Notes: 3 of 5 mistakes trace to sign-handling on factor pairs.",
      ].join("\n"),
      1,
    ),
  ],
  expected: {
    must_emit: ["made_sign_error", "weak_at_topic"],
    must_subject: ["Student"],
    must_object_contains: ["factoring"],
  },
};

export const extractorScenarios: ExtractorScenario[] = [
  transcriptScenario,
  examScenario,
  essayScenario,
  practiceScenario,
];
