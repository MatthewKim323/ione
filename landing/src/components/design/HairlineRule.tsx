/**
 * One-pixel rule with optional pencil-end ticks. Used as section separators
 * inside Notebook and the Tutor workspace. Default tone is `ink-line`; use
 * `tone="line"` on light desk surfaces.
 */
export function HairlineRule({
  tone = "ink-line",
  ticks = false,
  className,
}: {
  tone?: "ink-line" | "line" | "paper" | "paper-faint" | "red-pencil";
  ticks?: boolean;
  className?: string;
}) {
  const colorVar =
    tone === "line"
      ? "var(--color-line)"
      : tone === "paper"
        ? "var(--color-paper)"
        : tone === "paper-faint"
          ? "var(--color-paper-faint)"
          : tone === "red-pencil"
            ? "var(--color-red-pencil)"
            : "var(--color-ink-line)";

  return (
    <div
      className={[
        "relative w-full flex items-center gap-2",
        className ?? "",
      ].join(" ")}
      aria-hidden
    >
      {ticks && (
        <span
          className="block w-1 h-2 -mt-0.5"
          style={{ backgroundColor: colorVar }}
        />
      )}
      <div className="flex-1 h-px" style={{ backgroundColor: colorVar }} />
      {ticks && (
        <span
          className="block w-1 h-2 -mt-0.5"
          style={{ backgroundColor: colorVar }}
        />
      )}
    </div>
  );
}
