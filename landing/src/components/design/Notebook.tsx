import type { ReactNode } from "react";

/**
 * Workspace shell on /tutor.
 * - `ink` — late-night notebook (original).
 * - `desk` — cream sheet on the light desk, aligned with /dashboard.
 */
export function Notebook({
  children,
  className,
  variant = "ink",
}: {
  children: ReactNode;
  className?: string;
  variant?: "ink" | "desk";
}) {
  const isDesk = variant === "desk";
  return (
    <div
      className={[
        "relative border",
        isDesk
          ? "bg-paper border-line ruled-paper-light text-ink-deep"
          : "bg-ink-deep border-ink-line ruled-paper",
        className ?? "",
      ].join(" ")}
      style={{
        boxShadow: isDesk
          ? "inset 0 20px 48px -32px rgba(74,70,63,0.06), 0 18px 48px -28px rgba(74,70,63,0.14)"
          : "inset 0 24px 60px -36px rgba(0,0,0,0.65), 0 30px 80px -45px rgba(0,0,0,0.55)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Two- or three-column notebook layout — capture in the middle, marginalia
 * pinned to the right gutter, and an optional left "agent trace" rail.
 *
 *   • without `left`: `[main | margin]` (the historical 2-col tutor)
 *   • with `left`:    `[left | main | margin]` (3-col, lg+ only)
 *
 * On widths below `lg` we always stack the columns top-to-bottom so the
 * iPad mirror keeps pride of place on tablet/phone. Putting the agent trace
 * BEFORE the main column on small screens would mean the user has to scroll
 * past the log to find their work — we put it after instead, just above the
 * margin notes.
 */
export function NotebookLayout({
  left,
  main,
  margin,
  className,
  variant = "ink",
}: {
  /** Optional left rail (e.g. agent trace). 300px on lg+, stacks below `main` on smaller widths. */
  left?: ReactNode;
  main: ReactNode;
  margin: ReactNode;
  className?: string;
  variant?: "ink" | "desk";
}) {
  const isDesk = variant === "desk";
  const railBorder = isDesk
    ? "border-t border-line lg:border-t-0 lg:border-r lg:border-line"
    : "border-t border-ink-line lg:border-t-0 lg:border-r lg:border-ink-line";
  const marginBorder = isDesk
    ? "border-t border-line lg:border-t-0 lg:border-l lg:border-line"
    : "border-t border-ink-line lg:border-t-0 lg:border-l lg:border-ink-line";
  const marginRule = isDesk ? "page-rule-light" : "page-rule";

  const cols = left
    ? "grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_360px]"
    : "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]";

  return (
    <div className={["grid gap-0", cols, className ?? ""].join(" ")}>
      {/* Left rail — agent trace. Hidden on mobile, dropped after `main`. */}
      {left && (
        <aside
          className={[
            // small screens: row 2 (after main, before margin); large: column 1
            "relative p-6 sm:p-8 lg:p-10",
            railBorder,
            "order-2 lg:order-1",
          ].join(" ")}
        >
          {left}
        </aside>
      )}
      <div
        className={[
          "relative p-6 sm:p-8 lg:p-10 min-h-0",
          left ? "order-1 lg:order-2" : "",
        ].join(" ")}
      >
        {main}
      </div>
      <aside
        className={[
          "relative border-l-0 lg:border-l",
          marginBorder,
          "p-6 sm:p-8 lg:p-10",
          marginRule,
          left ? "order-3" : "",
        ].join(" ")}
      >
        {margin}
      </aside>
    </div>
  );
}
