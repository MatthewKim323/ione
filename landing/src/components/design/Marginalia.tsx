import type { ReactNode } from "react";

/**
 * Hand-written annotation in the margin. Caveat font, slight CCW rotation,
 * red-pencil ink. Used by HintCard to wrap each surfaced hint.
 *
 * The wrapper is purely visual — animation/timing logic lives in HintCard,
 * dedup/stack logic in HintStack.
 */
export function Marginalia({
  children,
  rotation = -1.5,
  tone = "red-pencil",
  className,
}: {
  children: ReactNode;
  rotation?: number;
  tone?: "red-pencil" | "graphite" | "brass" | "moss";
  className?: string;
}) {
  const colorVar =
    tone === "graphite"
      ? "var(--color-paper-dim)"
      : tone === "brass"
        ? "var(--color-brass)"
        : tone === "moss"
          ? "var(--color-moss)"
          : "var(--color-red-pencil)";

  return (
    <div
      className={["select-none", className ?? ""].join(" ")}
      style={{
        fontFamily: "var(--font-hand)",
        color: colorVar,
        transform: `rotate(${rotation}deg)`,
        lineHeight: 1.15,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Hand-drawn underline SVG — used inside HintCard to underscore a key word.
 * `width` defaults to 100% so the squiggle fills its parent.
 */
export function HandUnderline({
  className,
  color = "var(--color-red-pencil)",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 200 8"
      preserveAspectRatio="none"
      aria-hidden
      className={["block w-full h-2 -mt-0.5", className ?? ""].join(" ")}
    >
      <path
        d="M 2 5 Q 25 2, 50 5 T 100 4 T 150 6 T 198 4"
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}
