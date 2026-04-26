import { motion, useReducedMotion } from "motion/react";
import { TextClipPathRevealLines } from "./TextClipPathReveal";
import { InteractiveGradient } from "./InteractiveGradient";
import { EnterCTA } from "./EnterCTA";
import { GlowButton } from "./design/GlowButton";

export function Closer() {
  const reduceMotion = useReducedMotion();

  return (
    <section
      id="start"
      className="relative scroll-mt-28 overflow-hidden border-t border-ink-line bg-[#f2f2f2] py-32 sm:py-48"
    >
      {/* big watermark integral, sitting behind everything */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center select-none"
      >
        <span
          className="text-paper-faint/40 leading-none"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(20rem, 60vw, 56rem)",
            fontStyle: "italic",
          }}
        >
          ∫
        </span>
      </div>

      <InteractiveGradient fullBleed className="relative z-[1] w-full">
        <div className="relative mx-auto max-w-[1380px] px-6 sm:px-10">
          <div className="grid grid-cols-1 items-end gap-x-12 gap-y-16 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <h2 className="h-display text-[clamp(3rem,8vw,8.4rem)] text-ink">
                <TextClipPathRevealLines
                  lineClassName="block"
                  lines={[
                    "check the sign",
                    <>
                      on <span style={{ fontStyle: "italic" }}>line three</span>
                      <span className="text-neon">.</span>
                    </>,
                  ]}
                />
              </h2>

              <div className="mt-10 max-w-[42ch] text-ink/80 text-[15px] leading-[1.7] font-sub">
                <TextClipPathRevealLines
                  lineClassName="block"
                  lines={[
                    "ten words of voice.",
                    <>
                      <span className="relative inline-block text-ink/80">
                        <motion.span
                          aria-hidden
                          className="absolute -left-1 -right-1 bottom-[0.04em] h-[1.05em] w-[calc(100%+0.5rem)]"
                          initial={{ scaleX: reduceMotion ? 1 : 0 }}
                          whileInView={{ scaleX: 1 }}
                          transition={{
                            duration: reduceMotion ? 0 : 0.75,
                            delay: reduceMotion ? 0 : 0.45,
                            ease: [0.16, 1, 0.3, 1],
                          }}
                          viewport={{ once: true, margin: "-10% 0px -5% 0px" }}
                          style={{ transformOrigin: "0% 50%" }}
                        >
                          <span className="block h-full w-full rounded-[2px] bg-neon" />
                        </motion.span>
                        <span className="relative z-10">one specific question</span>
                      </span>
                      . delivered in 1.2 seconds, only when ted needed it.
                    </>,
                    "the rest of the hour, ione was silent.",
                  ]}
                />
              </div>

              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: "-10%" }}
                transition={{ duration: 0.7, delay: 0.35 }}
                className="mt-12 flex flex-wrap items-center gap-5"
              >
                <EnterCTA />
                <GlowButton as="link" to="/login" tone="ghost">
                  already have an account?
                </GlowButton>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: "-10%" }}
                transition={{ duration: 0.7, delay: 0.5 }}
                className="mt-8"
              >
                <span className="relative inline-block">
                  <motion.span
                    aria-hidden
                    className="absolute -inset-x-0.5 -inset-y-0.5 -z-0"
                    initial={{ scaleX: reduceMotion ? 1 : 0 }}
                    whileInView={{ scaleX: 1 }}
                    transition={{
                      duration: reduceMotion ? 0 : 0.75,
                      delay: reduceMotion ? 0 : 0.5,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    viewport={{ once: true, margin: "-10%" }}
                    style={{ transformOrigin: "0% 50%" }}
                  >
                    <span className="block h-full w-full rounded-sm bg-neon" />
                  </motion.span>
                  <span className="relative z-10 font-sub text-[0.6875rem] sm:text-[11px] font-bold leading-relaxed tracking-[0.1em] text-ink/90">
                    works with iPad + goodnotes · no setup · email + password
                  </span>
                </span>
              </motion.div>
            </div>

            {/* right column — a small "session card" summary */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.9, delay: 0.4 }}
              className="lg:col-span-5"
            >
              <SessionCard />
            </motion.div>
          </div>

          {/* footer */}
          <div className="relative mt-32 flex flex-col items-start justify-between gap-6 border-t border-ink-line pt-10 font-sub text-[11px] uppercase tracking-[0.18em] text-paper-mute sm:flex-row sm:items-end">
            <div className="flex items-center gap-4">
              <span
                className="text-ink text-2xl leading-none normal-case tracking-normal"
                style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
              >
                ione<span className="text-neon">.</span>
              </span>
              <span className="text-ink/50">© mmxxvi</span>
            </div>
            <div className="flex flex-wrap gap-x-7 gap-y-2">
              <a href="#pipeline" className="pencil-link">
                pipeline
              </a>
              <a href="https://github.com/MatthewKim323/ione" className="pencil-link">
                github
              </a>
              <a href="#" className="pencil-link">
                privacy
              </a>
            </div>
            <div className="text-ink/50">built for the student, not at them.</div>
          </div>
        </div>
      </InteractiveGradient>
    </section>
  );
}

function SessionCard() {
  return (
    <div className="border border-ink-line bg-ink-deep p-7 relative">
      {/* corner marks */}
      <Corner pos="tl" />
      <Corner pos="tr" />
      <Corner pos="bl" />
      <Corner pos="br" />

      <div className="flex items-center justify-between meta-label mb-6">
        <span>session · 5.3 / problem 4</span>
        <span className="text-paper-dim">28 min</span>
      </div>

      <div
        className="text-paper text-[2.4rem] leading-none mb-4"
        style={{ fontFamily: "var(--font-display)" }}
      >
        ted, <span style={{ fontStyle: "italic" }}>15</span>
      </div>

      <div className="font-sub text-[12px] text-paper-dim leading-[1.8]">
        <Row k="frames captured" v="208" />
        <Row k="frames processed" v="11" muted />
        <Row k="agent invocations" v="11 → 11 → 11" />
        <Row k="hints spoken" v="2" red />
        <Row k="time silent" v="27.2 min" />
        <Row k="compute" v="$0.41" />
      </div>

      <div className="mt-7 pt-5 border-t border-ink-line">
        <div className="meta-label mb-2">struggle profile</div>
        <div className="flex flex-wrap gap-2">
          {[
            ["sign errors", true],
            ["u-sub overreach", false],
            ["chain rule slips", false],
            ["limit notation", false],
          ].map(([label, hot]) => (
            <span
              key={String(label)}
              className={`px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] font-sub border ${
                hot
                  ? "border-red-pencil/60 text-red-pencil"
                  : "border-ink-line text-paper-mute"
              }`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <div
        className="hand text-[1.7rem] text-red-pencil mt-7"
        style={{ transform: "rotate(-1deg)" }}
      >
        better than yesterday.
      </div>
    </div>
  );
}

function Row({
  k,
  v,
  red,
  muted,
}: {
  k: string;
  v: string;
  red?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-dashed border-ink-line py-1.5">
      <span className="text-paper-mute uppercase text-[10px] tracking-[0.18em]">
        {k}
      </span>
      <span
        className={`tabular-nums ${
          red
            ? "text-red-pencil"
            : muted
              ? "text-paper-mute"
              : "text-paper"
        }`}
      >
        {v}
      </span>
    </div>
  );
}

function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const map: Record<typeof pos, string> = {
    tl: "top-0 left-0 border-t border-l",
    tr: "top-0 right-0 border-t border-r",
    bl: "bottom-0 left-0 border-b border-l",
    br: "bottom-0 right-0 border-b border-r",
  };
  return (
    <span
      aria-hidden
      className={`absolute w-3 h-3 border-red-pencil ${map[pos]} -m-px`}
    />
  );
}
