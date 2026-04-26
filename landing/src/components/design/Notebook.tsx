import type { ReactNode } from "react";

/**
 * A single notebook page: ink-deep background, faint horizontal ruling, soft
 * inset shadow at the top edge so it sits inside an ink desk.
 *
 * Used as the workspace shell on /tutor.
 */
export function Notebook({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "relative bg-ink-deep border border-ink-line",
        "ruled-paper",
        className ?? "",
      ].join(" ")}
      style={{
        boxShadow:
          "inset 0 24px 60px -36px rgba(0,0,0,0.65), 0 30px 80px -45px rgba(0,0,0,0.55)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Two-column layout — capture on the left, marginalia on the right. The
 * right gutter is fixed-width so margin notes always land in the same place.
 */
export function NotebookLayout({
  main,
  margin,
  className,
}: {
  main: ReactNode;
  margin: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "grid gap-0",
        "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]",
        className ?? "",
      ].join(" ")}
    >
      <div className="relative p-6 sm:p-8 lg:p-10 min-h-0">{main}</div>
      <aside className="relative border-l border-ink-line p-6 sm:p-8 lg:p-10 page-rule">
        {margin}
      </aside>
    </div>
  );
}
