/**
 * Dev-only per-cycle cost + token meter. Mounted by Tutor.tsx behind
 * `import.meta.env.DEV`. Keeps a small ring of the most recent N cycles so
 * we can eyeball whether a single cycle just blew up.
 */

import { motion } from "motion/react";

export type CostMeterCycle = {
  cycle_id: string;
  cost_usd: number;
  ms: number;
  surfaced_hint: boolean;
};

export function CostMeter({
  cycles,
  totalUsd,
  budgetUsd = 1.5,
}: {
  cycles: CostMeterCycle[];
  totalUsd: number;
  budgetUsd?: number;
}) {
  const pct = Math.min(100, (totalUsd / budgetUsd) * 100);
  const tone =
    pct < 60 ? "var(--color-moss)" : pct < 90 ? "var(--color-brass)" : "var(--color-red-pencil)";

  return (
    <div className="border border-ink-line bg-ink-raise p-4 text-[11px] font-mono uppercase tracking-[0.16em] text-paper-mute">
      <div className="flex items-baseline justify-between mb-2">
        <span>cost meter · dev</span>
        <span className="tabular-nums text-paper-dim">
          ${totalUsd.toFixed(4)} / ${budgetUsd.toFixed(2)}
        </span>
      </div>
      <div className="h-1 w-full bg-ink relative overflow-hidden mb-3">
        <motion.div
          animate={{ width: `${pct}%`, backgroundColor: tone }}
          transition={{ duration: 0.4 }}
          className="absolute inset-y-0 left-0"
        />
      </div>
      <ol className="space-y-1 max-h-32 overflow-auto">
        {cycles
          .slice(-8)
          .reverse()
          .map((c) => (
            <li key={c.cycle_id} className="grid grid-cols-[80px_60px_1fr_24px] gap-2 tabular-nums">
              <span className="text-paper-faint">{c.cycle_id.slice(0, 8)}</span>
              <span className="text-paper-dim">${c.cost_usd.toFixed(4)}</span>
              <span className="text-paper-faint">{c.ms}ms</span>
              <span className={c.surfaced_hint ? "text-red-pencil" : "text-paper-faint"}>
                {c.surfaced_hint ? "✎" : "·"}
              </span>
            </li>
          ))}
        {cycles.length === 0 && (
          <li className="text-paper-faint">awaiting first cycle…</li>
        )}
      </ol>
    </div>
  );
}
