import { useId, useState, type ReactNode } from "react";

/**
 * Desk-style disclosure for the tutor right rail — collapses tall blocks
 * (voice, marginalia, knowledge graph) without unmounting children so WebGL,
 * audio bus, and KG fetches keep behaving normally.
 */
export function MarginCollapsible({
  title,
  defaultOpen = true,
  children,
  className,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const btnId = useId();
  const panelId = useId();

  return (
    <div
      className={[
        "rounded-sm border border-line/55 bg-paper/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]",
        className ?? "",
      ].join(" ")}
    >
      <button
        type="button"
        id={btnId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-2.5 py-2 text-left transition-colors hover:bg-paper-warm/22"
      >
        <span className="section-label-light">{title}</span>
        <span
          className="shrink-0 text-paper-mute select-none transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            fontSize: "0.5rem",
            letterSpacing: "0.02em",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
          aria-hidden
        >
          ▼
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={btnId}
        className="grid border-t border-line/35 transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden px-2.5 pb-3 pt-2">{children}</div>
      </div>
    </div>
  );
}
