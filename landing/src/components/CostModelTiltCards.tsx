import { motion } from "motion/react";

const CARD_SURFACE = [
  "relative h-full w-full rounded-xl border p-5 sm:p-6",
  "border-ink/12 bg-[#ebe4d6]/85",
  "shadow-[0_3px_12px_rgba(22,19,16,0.06),0_0_0_1px_rgba(255,255,255,0.22)_inset]",
  "[background-image:repeating-linear-gradient(0deg,transparent,transparent_1px,rgba(61,54,53,0.025)_1px,rgba(61,54,53,0.025)_2px),repeating-linear-gradient(90deg,transparent,transparent_1px,rgba(61,54,53,0.02)_1px,rgba(61,54,53,0.02)_2px)]",
  "min-h-[9.5rem]",
  "transition-[box-shadow,border-color] duration-300 ease-out",
  /* Neon glow on hover — matches --color-neon chartreuse */
  "hover:border-neon/50",
  "hover:shadow-[0_0_26px_rgba(191,227,42,0.42),0_0_52px_rgba(191,227,42,0.18),0_3px_14px_rgba(22,19,16,0.07),0_0_0_1px_rgba(255,255,255,0.2)_inset]",
].join(" ");

type Stat = { n: string; top: string; bot: string };

const STATS: readonly Stat[] = [
  { n: "~ 95%", top: "of frames skipped", bot: "(no diff, no work)" },
  { n: "~ 4%", top: "reach the OCR agent", bot: "(diff but trivial)" },
  { n: "~ 1%", top: "reach intervene", bot: "(and most stay silent)" },
];

function StatCard({ n, top, bot }: Stat) {
  return (
    <div className={`${CARD_SURFACE} cursor-default`}>
      <div
        className="text-bark text-[1.75rem] leading-none tabular-nums sm:text-[1.9rem]"
        style={{
          fontFamily: "var(--font-display)",
          textShadow: "0 1px 0 rgba(255,255,255,0.18)",
        }}
      >
        {n}
      </div>
      <div className="meta-label mt-3 !text-bark/70">{top}</div>
      <div className="mt-1.5 font-sub text-[11px] leading-snug text-bark/58">
        {bot}
      </div>
    </div>
  );
}

const REVEAL = { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const };

export function CostModelTiltCards() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-3 md:gap-4">
      {STATS.map((s, i) => (
        <motion.div
          key={s.n}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-6%" }}
          transition={{ ...REVEAL, delay: i * 0.08 }}
        >
          <StatCard n={s.n} top={s.top} bot={s.bot} />
        </motion.div>
      ))}
    </div>
  );
}
