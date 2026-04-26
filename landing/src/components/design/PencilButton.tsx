import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Drawn-box button that fills with red-pencil on hover. Mirrors `.cta` in
 * index.css but accepts a `tone` so the same primitive can render the
 * destructive "stop" beat (pre-filled red-pencil) without a one-off class.
 */
export function PencilButton({
  children,
  tone = "ink",
  surface = "ink",
  size = "md",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "ink" | "red" | "ghost";
  /** `desk` uses `.cta-light` so buttons read correctly on parchment / desk. */
  surface?: "ink" | "desk";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}) {
  const sizeCls =
    size === "sm"
      ? "px-3 py-2 text-[10px] tracking-[0.2em]"
      : size === "lg"
        ? "px-6 py-3.5 text-[13px] tracking-[0.18em]"
        : "px-5 py-3 text-[11px] tracking-[0.18em]";

  const base = surface === "desk" ? "cta-light" : "cta";

  const toneCls =
    tone === "red"
      ? surface === "desk"
        ? "border-red-pencil text-red-pencil hover:bg-red-pencil hover:text-paper"
        : "border-red-pencil text-red-pencil hover:bg-red-pencil hover:text-paper"
      : tone === "ghost"
        ? surface === "desk"
          ? "cta-light-ghost"
          : "cta-ghost"
        : "";

  return (
    <button
      type="button"
      className={[
        base,
        sizeCls,
        toneCls,
        "uppercase font-sub",
        className ?? "",
      ].join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}
