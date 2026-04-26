import { Link, type LinkProps } from "react-router-dom";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type GlowTone = "default" | "hero" | "ghost";
type GlowShape = "pill" | "circle";

type Common = {
  children: ReactNode;
  className?: string;
  tone?: GlowTone;
  shape?: GlowShape;
  /** Full width (e.g. auth forms) */
  block?: boolean;
};

type GlowButtonAsButton = Common &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    as?: "button";
    to?: never;
    href?: never;
  };

type GlowButtonAsLink = Common &
  Omit<LinkProps, "className" | "children"> & {
    as: "link";
    to: string;
  };

type GlowButtonAsAnchor = Common &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children"> & {
    as: "a";
    href: string;
  };

export type GlowButtonProps =
  | GlowButtonAsButton
  | GlowButtonAsLink
  | GlowButtonAsAnchor;

function buildWrapCls(
  tone: GlowTone,
  shape: GlowShape,
  block: boolean,
  className: string,
) {
  return [
    "glow-btn",
    tone === "hero" ? "glow-btn--hero" : "",
    tone === "ghost" ? "glow-btn--ghost" : "",
    shape === "circle" ? "glow-btn--circle" : "",
    block ? "glow-btn--block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Framer-inspired glow CTA: soft halo, metallic rim, subtle shimmer sweep.
 * Use `tone="hero"` for the landing hero primary; `tone="ghost"` for outline.
 * On auth cards add class `glow-btn--on-light` via `className`.
 */
export function GlowButton(props: GlowButtonProps) {
  const ch = props.children;
  const face = (
    <span className="glow-btn__face">
      <span className="glow-btn__shimmer" aria-hidden />
      {ch}
    </span>
  );

  if (props.as === "link") {
    const { as, tone = "default", shape = "pill", block = false, className = "", children, ...linkRest } = props;
    return (
      <Link {...linkRest} className={buildWrapCls(tone, shape, block, className)}>
        <span className="glow-btn__halo" aria-hidden />
        {face}
      </Link>
    );
  }

  if (props.as === "a") {
    const { as, tone = "default", shape = "pill", block = false, className = "", children, ...aRest } = props;
    return (
      <a {...aRest} className={buildWrapCls(tone, shape, block, className)}>
        <span className="glow-btn__halo" aria-hidden />
        {face}
      </a>
    );
  }

  const {
    tone = "default",
    shape = "pill",
    block = false,
    className = "",
    children,
    type = "button",
    ...btnRest
  } = props as GlowButtonAsButton;

  return (
    <button type={type} {...btnRest} className={buildWrapCls(tone, shape, block, className)}>
      <span className="glow-btn__halo" aria-hidden />
      {face}
    </button>
  );
}
