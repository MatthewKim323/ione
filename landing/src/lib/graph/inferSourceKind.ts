import type { SourceKind } from "../database.types";

/**
 * Guess `source_kind` from filename + MIME so users can drop a pile of files
 * at once. Each file still gets its own row and extractor routing on the server.
 *
 * Resolution order matters. We previously checked "is this text?" *before*
 * filename keywords, which collapsed every .md/.txt into `note` — and `note`
 * has no content extractor, so a transcript-named markdown silently produced
 * a single Archivist bookkeeping claim instead of the dozen TranscriptReader
 * facts you'd expect. The order below now reads:
 *
 *   1. unambiguous MIME signals (audio)
 *   2. filename keywords (transcript / exam / syllabus / essay / practice)
 *   3. extension hints (.docx → essay)
 *   4. text fallback (`note`)
 *   5. binary fallback (`practice_work` for PDFs/images, awaiting OCR)
 *   6. catch-all (`other`)
 *
 * Conservative defaults: unknown binaries → practice_work; PracticeWorkReader
 * no-ops cleanly on non-math content, so worst case is one wasted LLM call.
 */
export function inferSourceKind(file: File): SourceKind {
  const name = file.name.toLowerCase();
  const mime = (file.type || "").toLowerCase();

  // 1. Audio is unambiguous.
  if (mime.startsWith("audio/")) return "voice";

  // 2. Filename keywords — first match wins.
  if (name.includes("syllabus")) return "syllabus";

  if (
    name.includes("transcript") ||
    name.includes("report card") ||
    name.includes("grade report") ||
    name.includes("grades")
  ) {
    return "transcript";
  }

  if (
    name.includes("essay") ||
    name.includes("personal statement") ||
    name.includes("common app") ||
    name.includes("draft")
  ) {
    return "essay";
  }

  // Graded exam — must mention some kind of assessment AND signal that it was
  // graded/marked. Otherwise the word "test" alone is too noisy (e.g. a test
  // plan, a "test" note).
  const looksGradedExam =
    /(midterm|final|exam|quiz|assessment)/.test(name) &&
    /(score|graded|mark|result|corrected|teacher|red\s*pen|fail)/.test(name);
  if (looksGradedExam) return "failed_exam";

  // Practice work / homework / scratch. Routes typed-up scratch sheets and
  // problem sets to PracticeWorkReader even when the bytes are plain text.
  if (
    /\b(practice|homework|worksheet|problem[\s-]?set|scratch|hw)\b/.test(name)
  ) {
    return "practice_work";
  }

  // 3. .docx → essay (writing-shaped binary).
  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return "essay";
  }

  // 4. Plain text with no telling filename → note. This is the *fallback*,
  // not the primary path — we only land here after the filename keyword
  // rules above have all whiffed.
  if (
    mime.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".csv")
  ) {
    return "note";
  }

  // 5. Binary fallback — PDFs / images route to PracticeWorkReader. The
  // server-side OCR worker (TODO) will replace this once images can be
  // chunked; for now PracticeWorkReader gracefully no-ops on non-math.
  if (
    mime === "application/pdf" ||
    mime.startsWith("image/") ||
    name.endsWith(".pdf") ||
    /\.(png|jpe?g|webp|heic|gif)$/i.test(file.name)
  ) {
    return "practice_work";
  }

  return "other";
}
