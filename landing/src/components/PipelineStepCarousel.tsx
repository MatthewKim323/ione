import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, useState, type CSSProperties } from "react";

export type PipelineStep = {
  n: string;
  name: string;
  sub: string;
  body: string;
  out: string;
  color: "paper-dim" | "brass" | "moss" | "red-pencil";
};

/* File body matches landing desk; top tabs stay parchment (active = file surface, not bark) */
const FILE = {
  surface: "bg-[#e4ded2]",
  border: "border-ink/15",
  text: "text-ink",
  sub: "text-ink/70",
  tabIdle:
    "bg-[#c8c1b3] text-ink/80 hover:bg-[#d2cbc0] border-ink/12 border-b-0",
  tabActive:
    "z-20 border-b-0 border-ink/20 bg-[#e4ded2] text-ink shadow-[0_1px_0_rgba(255,255,255,0.45)_inset]",
} as const;

const PENCIL = [0.16, 1, 0.3, 1] as const;

/** 72° between petals, first petal at top (–90° offset) */
const PETAL_ANGLES_5: readonly number[] = [0, 72, 144, 216, 288].map(
  (d) => d - 90,
);

/** Main stage word (capture, ocr, …) — dark brown fill, light cream highlight */
const pipelineStepTitleStyle: CSSProperties = {
  color: "var(--color-bark)",
  textShadow: "0 1px 0 rgba(255,255,255,0.2), 0 2px 5px rgba(0,0,0,0.1)",
};

/**
 * Five-petal blossom (shared by file tabs + bottom stage controls).
 * Slightly plumper petals (rx/ry) so it reads clearly at small sizes.
 */
function StageFlower({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden>
      <g transform="translate(10,10)" fill="currentColor">
        {PETAL_ANGLES_5.map((deg) => (
          <ellipse
            key={deg}
            cx="0"
            cy="-3.25"
            rx="2.35"
            ry="3.45"
            transform={`rotate(${deg})`}
          />
        ))}
        <circle r="1.65" />
      </g>
    </svg>
  );
}

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
        <div className="flex min-h-[3rem] w-full flex-nowrap items-end justify-end gap-1 pl-2 sm:min-h-[3.35rem] sm:gap-1.5 sm:pl-4 -mb-px">
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
                  "relative z-0 max-w-[8.5rem] shrink-0 rounded-t-md px-2.5 py-2 text-left transition-[background-color,border-color,color,box-shadow] sm:max-w-none sm:rounded-t-lg sm:px-3.5 sm:py-2.5",
                  "border border-b-0",
                  active ? FILE.tabActive : FILE.tabIdle,
                ].join(" ")}
              >
                <span
                  className={`inline-flex shrink-0 items-center align-middle ${
                    active
                      ? "text-neon"
                      : "text-neon/60 hover:text-neon"
                  }`}
                >
                  <StageFlower className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </span>
                <span className="ml-1.5 font-mono text-[8px] leading-tight tracking-[0.08em] uppercase sm:ml-2 sm:text-[9px] sm:tracking-[0.1em]">
                  <span className={active ? "text-ink/45" : "text-ink/40"}>
                    {s.n}_
                  </span>
                  <span className="text-bark font-bold">{s.name}</span>
                  <span className={active ? "text-ink/38" : "text-ink/35"}>
                    .json
                  </span>
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
          className="text-[2.6rem] leading-[0.95] sm:text-[2.95rem] md:text-[3.2rem]"
          style={{
            fontFamily: "var(--font-display)",
            ...pipelineStepTitleStyle,
          }}
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
          className="text-[2.6rem] leading-[0.95] sm:text-[2.95rem] md:text-[3.2rem]"
          style={{ fontFamily: "var(--font-display)", ...pipelineStepTitleStyle }}
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
  const reduce = useReducedMotion() ?? false;
  const n = steps.length;

  const ltrMotion = (i: number) => ({
    initial: { opacity: reduce ? 1 : 0, x: reduce ? 0 : -14 },
    whileInView: { opacity: 1, x: 0 },
    transition: {
      duration: reduce ? 0 : 0.44,
      delay: reduce ? 0 : 0.03 + i * 0.072,
      ease: PENCIL,
    },
    viewport: { once: true, amount: 0.3 },
  });

  const chromeBase =
    "inline-flex h-11 shrink-0 items-center justify-center rounded-md border font-sub text-[11px] tracking-[0.16em] uppercase transition-[background-color,border-color,color,box-shadow]";
  const chromeIdle =
    "border-ink/15 bg-[#e4ded2] text-ink/50 hover:border-ink/25 hover:bg-[#d8d0c4] hover:text-ink/75";
  const chromeActive =
    "border-bark/35 bg-bark shadow-[0_0_20px_rgba(191,227,42,0.28),inset_0_1px_0_rgba(255,255,255,0.1)]";

  return (
    <div
      className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:mt-6 sm:gap-2.5"
      role="group"
      aria-label="Pipeline stage navigation"
    >
      <motion.button
        type="button"
        className={`${chromeBase} ${chromeIdle} min-w-[6.5rem] px-3`}
        onClick={onPrev}
        aria-label="Previous stage"
        {...ltrMotion(0)}
      >
        ← prev
      </motion.button>
      {steps.map((s, i) => (
        <motion.button
          key={s.n}
          type="button"
          role="tab"
          aria-selected={i === index}
          aria-label={`${s.name}, stage ${s.n}`}
          onClick={() => onSelect(i)}
          className={[
            `${chromeBase} w-11 p-0`,
            i === index ? chromeActive : chromeIdle,
            i === index ? "text-neon" : "text-ink/40",
          ].join(" ")}
          {...ltrMotion(1 + i)}
        >
          <StageFlower className="h-5 w-5" />
        </motion.button>
      ))}
      <motion.button
        type="button"
        className={`${chromeBase} ${chromeIdle} min-w-[6.5rem] px-3`}
        onClick={onNext}
        aria-label="Next stage"
        {...ltrMotion(1 + n)}
      >
        next →
      </motion.button>
    </div>
  );
}
