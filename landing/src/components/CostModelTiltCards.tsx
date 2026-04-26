import { useRef } from "react";
import { motion, useReducedMotion, useSpring } from "motion/react";

const PERSPECTIVE = 1000;
const TILT_DEG = 6;

const CARD_SURFACE = [
  "relative h-full w-full rounded-2xl border p-5 sm:p-6",
  "border-ink/15 bg-[#e4ded2]",
  "shadow-[0_4px_14px_rgba(0,0,0,0.08),0_0_0_1px_rgba(255,255,255,0.2)_inset]",
  "[background-image:repeating-linear-gradient(0deg,transparent,transparent_1px,rgba(0,0,0,0.02)_1px,rgba(0,0,0,0.02)_2px),repeating-linear-gradient(90deg,transparent,transparent_1px,rgba(0,0,0,0.018)_1px,rgba(0,0,0,0.018)_2px)]",
  "min-h-[9.5rem] will-change-transform",
].join(" ");

type Stat = { n: string; top: string; bot: string };

const STATS: readonly Stat[] = [
  { n: "~ 95%", top: "of frames skipped", bot: "(no diff, no work)" },
  { n: "~ 4%", top: "reach the OCR agent", bot: "(diff but trivial)" },
  { n: "~ 1%", top: "reach intervene", bot: "(and most stay silent)" },
];

/**
 * One cream card per stat: full stat as a single line, whole card tilts on hover.
 */
function StatTiltCard({ n, top, bot }: Stat) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const rx = useSpring(0, { stiffness: 300, damping: 32, mass: 0.35 });
  const ry = useSpring(0, { stiffness: 300, damping: 32, mass: 0.35 });

  const onMove = (e: React.MouseEvent) => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    rx.set(-y * TILT_DEG);
    ry.set(x * TILT_DEG);
  };

  const onLeave = () => {
    rx.set(0);
    ry.set(0);
  };

  return (
    <div className="h-full" style={{ perspective: PERSPECTIVE }}>
      <motion.div
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        className={CARD_SURFACE}
        style={{
          transformStyle: "preserve-3d",
          rotateX: rx,
          rotateY: ry,
        }}
      >
        <div
          className="text-ink text-[1.75rem] leading-none tabular-nums sm:text-[1.9rem]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {n}
        </div>
        <div className="meta-label mt-3 !text-ink/75">{top}</div>
        <div className="mt-1.5 font-sub text-[11px] leading-snug text-ink/55">
          {bot}
        </div>
      </motion.div>
    </div>
  );
}

const REVEAL = { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const };

export function CostModelTiltCards() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-4 md:gap-5">
      {STATS.map((s, i) => (
        <motion.div
          key={s.n}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-6%" }}
          transition={{ ...REVEAL, delay: i * 0.08 }}
        >
          <StatTiltCard n={s.n} top={s.top} bot={s.bot} />
        </motion.div>
      ))}
    </div>
  );
}
