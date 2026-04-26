import { Math as KaTeXMath } from "../design/Math";

/**
 * Surface what the OCR pipeline actually saw whenever the agent's
 * confidence is below `threshold`. Two purposes:
 *
 *   1. Useful debug — lets a developer see the full chain of equations
 *      ione transcribed when Sonnet's confidence is shaky.
 *   2. Demo moment — the audience sees the OCR layer doing real work,
 *      not magic.
 *
 * When low-confidence fires we render *all* of:
 *   • Sonnet's "current step" (the line it picked as in-progress)
 *   • Sonnet's "completed steps" (every prior line)
 *   • Mathpix's raw transcription for the entire frame (collapsed by
 *     default — opens with one click)
 *
 * This is what fixes "ione only read x=3 with 40% confidence" UX bug —
 * the underlying Mathpix output usually has the full page, it just
 * wasn't being shown.
 */
export function OcrDebugBanner({
  confidence,
  latex,
  completedSteps,
  mathpixLatex,
  mathpixConfidence,
  threshold = 0.6,
}: {
  confidence: number | null;
  latex: string | null;
  completedSteps?: string[];
  mathpixLatex?: string | null;
  mathpixConfidence?: number | null;
  threshold?: number;
}) {
  if (confidence === null || confidence >= threshold) return null;

  const completed = completedSteps ?? [];
  const totalLines = completed.length + (latex ? 1 : 0);

  // Nothing to show if both Sonnet and Mathpix produced empty output.
  if (totalLines === 0 && !mathpixLatex) return null;

  return (
    <div
      className="border border-dashed border-rust/50 bg-rust/[0.05] px-4 py-3 text-[12px] flex flex-col gap-2 fade-up"
      style={{ fontFamily: "var(--font-display)" }}
    >
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="font-sub text-[10px] not-italic uppercase tracking-[0.2em] text-rust shrink-0">
          ocr · low confidence {(confidence * 100).toFixed(0)}%
        </span>
        <span
          className="text-paper-faint text-[10px] tracking-[0.06em]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          read {totalLines} line{totalLines === 1 ? "" : "s"}
          {mathpixConfidence !== null && mathpixConfidence !== undefined && (
            <> · {(mathpixConfidence * 100).toFixed(0)}% mathpix</>
          )}
        </span>
      </div>

      {totalLines > 0 && (
        <div className="flex flex-col gap-1 pl-1">
          {completed.map((step, i) => (
            <div
              key={`prior-${i}`}
              className="text-paper-mute italic min-w-0 break-words"
              style={{ fontStyle: "italic" }}
              title={step}
            >
              <KaTeXMath tex={step} />
            </div>
          ))}
          {latex && (
            <div
              className="text-ink-deep min-w-0 break-words"
              title={latex}
              style={{ fontStyle: "italic" }}
            >
              <KaTeXMath tex={latex} />
              <span
                className="ml-2 text-[9px] tracking-[0.16em] uppercase text-red-pencil/70 not-italic"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                · current
              </span>
            </div>
          )}
        </div>
      )}

      {mathpixLatex &&
        mathpixLatex.trim() &&
        mathpixLatex !== latex && (
          <details className="pl-1">
            <summary
              className="text-paper-faint/80 text-[10px] tracking-[0.14em] uppercase cursor-pointer hover:text-paper-mute transition-colors select-none not-italic"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              ▸ raw mathpix transcription
            </summary>
            <div
              className="mt-1.5 pl-2 border-l border-rust/30 text-paper-mute text-[11px] leading-relaxed whitespace-pre-wrap break-words not-italic"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10.5px",
              }}
            >
              {mathpixLatex}
            </div>
          </details>
        )}
    </div>
  );
}
