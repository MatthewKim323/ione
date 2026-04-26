import type { SourceKind } from "../database.types";

/**
 * Guess `source_kind` from filename + MIME so users can drop a pile of files
 * at once. Each file still gets its own row and extractor routing on the server.
 *
 * Conservative defaults: unknown binaries → practice_work (PracticeWorkReader
 * no-ops cleanly on non-math). Plain text → note (eager chunk in browser).
 */
export function inferSourceKind(file: File): SourceKind {
  const name = file.name.toLowerCase();
  const mime = (file.type || "").toLowerCase();

  if (mime.startsWith("audio/")) return "voice";

  if (
    mime.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".csv")
  ) {
    return "note";
  }

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

  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return "essay";
  }

  const looksGradedExam =
    /(midterm|final|exam|quiz|assessment|test)/.test(name) &&
    /(score|graded|mark|result|corrected|teacher|red\s*pen|fail)/.test(name);

  if (looksGradedExam) return "failed_exam";

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
