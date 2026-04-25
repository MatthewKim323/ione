interface OptionRowProps {
  label: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
}

/**
 * Vertical selectable row — used for current_class. Reads like a checked-off
 * item in a notebook: a small empty box on the left fills with red pencil
 * when chosen.
 */
export function OptionRow({
  label,
  description,
  selected,
  onClick,
}: OptionRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        "w-full flex items-center gap-4 px-4 py-3 text-left border transition-colors duration-300 group",
        selected
          ? "bg-ink-raise border-red-pencil"
          : "border-ink-line hover:border-paper-faint",
      ].join(" ")}
    >
      {/* checkbox-like indicator */}
      <span
        aria-hidden
        className={[
          "shrink-0 w-3.5 h-3.5 border transition-all",
          selected
            ? "bg-red-pencil border-red-pencil"
            : "border-paper-faint group-hover:border-paper-mute",
        ].join(" ")}
      />
      <span className="flex-1 min-w-0">
        <span
          className={[
            "block font-mono text-sm",
            selected ? "text-paper" : "text-paper-dim",
          ].join(" ")}
        >
          {label}
        </span>
        {description && (
          <span className="block font-mono text-[11px] text-paper-mute mt-0.5">
            {description}
          </span>
        )}
      </span>
    </button>
  );
}
