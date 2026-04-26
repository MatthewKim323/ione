type Props = {
  className?: string;
  /**
   * bloom — semi-transparent on dark (hero, video).
   * nav — slightly darker for the light glass nav pill.
   * heroBlack — near-black fill.
   * heroGreen — neon green fill (see how it works).
   */
  variant?: "bloom" | "nav" | "heroBlack" | "heroGreen";
};

/**
 * Six-petal + center disk; matches the landing flower / bg video motif.
 */
export function FlowerCtaShape({
  className = "",
  variant = "bloom",
}: Props) {
  const fill =
    variant === "heroGreen"
      ? "rgba(191, 227, 42, 0.88)"
      : variant === "heroBlack"
        ? "rgba(10, 10, 10, 0.96)"
        : variant === "nav"
          ? "rgba(18, 24, 32, 0.11)"
          : "rgba(255, 255, 255, 0.14)";
  const petals = [0, 60, 120, 180, 240, 300].map((deg) => (
    <ellipse
      key={deg}
      cx={50}
      cy={24}
      rx={11}
      ry={20}
      fill={fill}
      stroke="none"
      transform={`rotate(${deg} 50 50)`}
    />
  ));
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {petals}
      <circle
        cx={50}
        cy={50}
        r={11}
        fill={fill}
        stroke="none"
      />
    </svg>
  );
}
