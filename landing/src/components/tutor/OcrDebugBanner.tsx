import { Math as KaTeXMath } from "../design/Math";

/**
 * Reveal the agent's transcribed LaTeX when OCR confidence is below 0.6.
 * Two purposes:
 *   1. Useful debug — lets a developer see what the system *thinks* the
 *      student wrote when confidence is shaky.
 *   2. Demo moment — the audience sees the OCR layer doing real work, not
 *      magic.
 */
export function OcrDebugBanner({
  confidence,
  latex,
  threshold = 0.6,
}: {
  confidence: number | null;
  latex: string | null;
  threshold?: number;
}) {
  if (!latex) return null;
  if (confidence === null || confidence >= threshold) return null;

  return (
    <div
      className="border border-dashed border-rust/50 bg-rust/[0.05] px-4 py-3 text-[12px] flex items-baseline gap-3 fade-up"
      style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
    >
      <span className="font-sub text-[10px] not-italic uppercase tracking-[0.2em] text-rust shrink-0">
        ocr · low confidence {(confidence * 100).toFixed(0)}%
      </span>
      <span className="text-paper-faint shrink min-w-0 truncate">
        thinks you wrote{" "}
        <span className="text-ink-deep">
          <KaTeXMath tex={latex} />
        </span>
      </span>
    </div>
  );
}
