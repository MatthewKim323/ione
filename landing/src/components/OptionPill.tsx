interface OptionPillProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}

/**
 * Compact selectable chip — used for grade level, hint frequency, etc.
 * Selected state fills with red-pencil; unselected is a thin warm hairline.
 * Tuned for cream parchment surfaces on the warm-desk page.
 */
export function OptionPill({ label, selected, onClick }: OptionPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        "px-4 py-2 font-sub text-xs tracking-[0.14em] uppercase border transition-all duration-300 ease-[var(--ease-pencil)]",
        selected
          ? "bg-red-pencil border-red-pencil text-paper shadow-[0_2px_8px_-3px_rgba(196,48,43,0.4)]"
          : "border-line text-paper-faint hover:text-ink-deep hover:border-paper-faint hover:bg-paper-warm/60",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
