import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";

export type PipelineStep = {
  n: string;
  name: string;
  sub: string;
  body: string;
  out: string;
  color: "paper-dim" | "brass" | "moss" | "red-pencil";
};

const dotColor = (c: PipelineStep["color"]) => {
  if (c === "red-pencil") return "bg-red-pencil";
  if (c === "brass") return "bg-brass";
  if (c === "moss") return "bg-moss";
  return "bg-paper-dim";
};

/* Opaque folder gray (reference: matte light blue–gray) */
const FILE = {
  surface: "bg-[#c5c8d0]",
  tabActive: "bg-[#c5c8d0]",
  tabIdle: "bg-[#b0b3bd]",
  border: "border-[#989fad]",
  text: "text-ink",
  sub: "text-ink/70",
} as const;

const PENCIL = [0.16, 1, 0.3, 1] as const;

const stepListVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.055, delayChildren: 0.04 },
  },
} as const;

const stepItemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: PENCIL },
  },
} as const;

type Props = { steps: readonly PipelineStep[] };

/**
 * Side-by-side folder tabs (staggered like physical index folders) + one solid
 * content panel. No transparency on file surfaces.
 */
export function PipelineStepCarousel({ steps }: Props) {
  const [index, setIndex] = useState(0);
  const reduce = useReducedMotion();
  const n = steps.length;
  const step = steps[index];
  const dragX = useRef(0);

  const go = (dir: -1 | 1) => {
    setIndex((i) => (i + dir + n) % n);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragX.current = e.clientX;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const dx = e.clientX - dragX.current;
    if (dx < -48) go(1);
    else if (dx > 48) go(-1);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      go(-1);
    }
  };

  return (
    <div
      className="relative"
      onKeyDown={onKey}
      role="region"
      tabIndex={0}
      aria-label="Pipeline stages. Select a file tab, or use prev, next, arrows, swipe."
    >
      <div className="mx-auto w-full max-w-xl sm:max-w-2xl">
        {/* Tab row — right-aligned so capture + intervene (and the pair between) sit toward the right */}
        <div className="flex min-h-[2.5rem] w-full flex-nowrap items-end justify-end gap-0.5 pl-2 sm:min-h-[2.75rem] sm:gap-1 sm:pl-4 -mb-px">
          {steps.map((s, i) => {
            const active = i === index;
            return (
              <button
                key={s.n}
                type="button"
                onClick={() => setIndex(i)}
                role="tab"
                aria-selected={active}
                className={[
                  "relative z-0 max-w-[7.2rem] shrink-0 rounded-t-md border border-b-0 px-1.5 py-1.5 text-left transition-[background-color,box-shadow] sm:max-w-none sm:rounded-t-lg sm:px-2.5 sm:py-1.5",
                  FILE.border,
                  "shadow-[0_1px_0_rgba(255,255,255,0.35)_inset]",
                  active
                    ? `z-20 ${FILE.tabActive} text-ink`
                    : `${FILE.tabIdle} text-ink/75 hover:bg-[#b8bac4]`,
                ].join(" ")}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full align-middle ${
                    active ? "opacity-100" : "opacity-80"
                  } ${dotColor(s.color)}`}
                />
                <span className="ml-1 font-mono text-[6px] leading-tight tracking-[0.08em] uppercase sm:ml-1.5 sm:text-[7px] sm:tracking-[0.1em]">
                  {s.n}_{s.name}
                  <span className={active ? "text-ink/50" : "text-ink/40"}>.json</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Solid file body (opaque; subtle lift like reference) */}
        <div
          className={[
            "-mt-px relative z-10 w-full min-h-[min(48vh,400px)] rounded-b-xl border border-t-0 p-5 shadow-[0_4px_14px_rgba(0,0,0,0.08)] sm:min-h-[400px] sm:rounded-b-2xl sm:p-7 md:p-8",
            FILE.border,
            FILE.surface,
            /* faint paper texture */
            "[background-image:repeating-linear-gradient(0deg,transparent,transparent_1px,rgba(0,0,0,0.02)_1px,rgba(0,0,0,0.02)_2px),repeating-linear-gradient(90deg,transparent,transparent_1px,rgba(0,0,0,0.018)_1px,rgba(0,0,0,0.018)_2px)]",
          ].join(" ")}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {reduce ? (
            <StepContent
              key={step.n}
              step={step}
              index={index}
              n={n}
              motion={false}
            />
          ) : (
            <AnimatePresence initial={false} mode="wait">
              <StepContent
                key={step.n}
                step={step}
                index={index}
                n={n}
                motion
              />
            </AnimatePresence>
          )}
        </div>
      </div>

      <Controls
        index={index}
        steps={steps}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
        onSelect={setIndex}
      />
      <p className="mt-2 text-center font-sub text-[10px] text-ink/40 sm:hidden">
        swipe the panel, or use tabs / arrows
      </p>
    </div>
  );
}

function StepContent({
  step,
  index,
  n,
  motion: motionOn,
}: {
  step: PipelineStep;
  index: number;
  n: number;
  motion: boolean;
}) {
  const body = (
    <div className="flex h-full flex-col text-ink">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3
          className="text-[2.1rem] leading-[0.95] sm:text-[2.5rem] md:text-[2.6rem]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {step.name}
        </h3>
        <span className="font-mono text-[9px] tabular-nums text-ink/40">
          {index + 1} / {n}
        </span>
      </div>
      <div className="meta-label mb-4 !text-ink/60">{step.sub}</div>
      <p className="text-[13px] leading-[1.75] text-ink/85 font-sub mb-6 flex-1 sm:text-[14px]">
        {step.body}
      </p>
      <div className="font-sub text-[10px] tracking-[0.12em] uppercase text-ink/55 flex items-center gap-2 border-t border-ink/15 pt-4">
        <span className="text-red-pencil">→</span>
        <span className="min-w-0 break-words">{step.out}</span>
      </div>
    </div>
  );

  const bodyStaggered = (
    <motion.div
      className="flex h-full flex-col"
      variants={stepListVariants}
      initial="hidden"
      animate="show"
    >
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <motion.h3
          variants={stepItemVariants}
          className="text-[2.1rem] leading-[0.95] sm:text-[2.5rem] md:text-[2.6rem]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {step.name}
        </motion.h3>
        <motion.span
          variants={stepItemVariants}
          className="font-mono text-[9px] tabular-nums text-ink/40"
        >
          {index + 1} / {n}
        </motion.span>
      </div>
      <motion.div
        className="meta-label mb-4 !text-ink/60"
        variants={stepItemVariants}
      >
        {step.sub}
      </motion.div>
      <motion.p
        variants={stepItemVariants}
        className="text-[13px] leading-[1.75] text-ink/85 font-sub mb-6 flex-1 sm:text-[14px]"
      >
        {step.body}
      </motion.p>
      <motion.div
        variants={stepItemVariants}
        className="font-sub text-[10px] tracking-[0.12em] uppercase text-ink/55 flex items-center gap-2 border-t border-ink/15 pt-4"
      >
        <span className="text-red-pencil">→</span>
        <span className="min-w-0 break-words">{step.out}</span>
      </motion.div>
    </motion.div>
  );

  if (!motionOn) {
    return <div className="flex h-full flex-col">{body}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.3, ease: PENCIL }}
      className="flex h-full min-h-0 w-full flex-col"
    >
      {bodyStaggered}
    </motion.div>
  );
}

function Controls({
  index,
  steps,
  onPrev,
  onNext,
  onSelect,
}: {
  index: number;
  steps: readonly PipelineStep[];
  onPrev: () => void;
  onNext: () => void;
  onSelect: (i: number) => void;
}) {
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:mt-6 sm:gap-4">
        <button
          type="button"
          onClick={onPrev}
          className="font-sub text-[11px] tracking-[0.16em] uppercase text-ink/55 border border-ink/20 bg-[#e8e6e1] px-4 py-2.5 transition-colors hover:border-ink/35 hover:text-ink"
          aria-label="Previous stage"
        >
          ← prev
        </button>
        <div
          className="flex items-center justify-center gap-2 px-2"
          role="tablist"
          aria-label="Select pipeline stage"
        >
          {steps.map((s, i) => (
            <button
              key={s.n}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`${s.name}, stage ${s.n}`}
              onClick={() => onSelect(i)}
              className="grid place-items-center p-1.5"
            >
              <span
                className={`block h-2.5 w-2.5 rounded-full transition-transform ${
                  i === index
                    ? `${dotColor(s.color)} scale-110 ring-2 ring-ink/25 ring-offset-2 ring-offset-[#e8e6e1]`
                    : "bg-ink/20 hover:bg-ink/35"
                }`}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onNext}
          className="font-sub text-[11px] tracking-[0.16em] uppercase text-ink/55 border border-ink/20 bg-[#e8e6e1] px-4 py-2.5 transition-colors hover:border-ink/35 hover:text-ink"
          aria-label="Next stage"
        >
          next →
        </button>
      </div>
    </>
  );
}
