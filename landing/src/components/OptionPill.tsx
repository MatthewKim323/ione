interface OptionPillProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}

/**
 * Compact selectable chip — used for grade level, hint frequency, etc.
 * Selected state fills with red-pencil; unselected is a thin paper-faint outline.
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
          ? "bg-red-pencil border-red-pencil text-paper"
          : "border-paper-faint text-paper-dim hover:text-paper hover:border-paper-mute",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
