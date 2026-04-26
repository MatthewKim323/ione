import { motion } from "motion/react";
import { SectionLabel } from "./SectionLabel";
import { InteractiveGradient } from "./InteractiveGradient";

const PILLARS = [
  {
    n: "i.",
    title: "stay silent.",
    body: "Default state is observation. The tutor watches for ninety seconds before considering whether your stall warrants a nudge. Most stalls don't.",
  },
  {
    n: "ii.",
    title: "ask, never answer.",
    body: "When it does intervene, it asks a question you can answer by looking at your own work — \u201Ccheck the sign on line three\u201D, not \u201Cthe answer is 28\u201D.",
  },
  {
    n: "iii.",
    title: "remember the stall.",
    body: "Every intervention writes to a longitudinal memory. After three weeks, ione knows your sign errors and your u-sub overreach by name.",
  },
  {
    n: "iv.",
    title: "give the page back.",
    body: "ione lives in the margin — never on the page. The student does the math; the tutor only ever annotates.",
  },
];

const STATS = [
  { n: "1", label: "page at a time" },
  { n: "<3", label: "hints / problem (avg)" },
  { n: "8s", label: "capture cycle" },
  { n: "$0.02", label: "compute / cycle" },
];

export function Pedagogy() {
  return (
    <section
      id="pedagogy"
      className="relative px-6 sm:px-10 py-32 sm:py-44 border-t border-ink-line overflow-hidden"
    >
      {/* Interactive animated gradient — full-section background. Tracks
          the cursor at the window level so it stays responsive even with
          content layered on top.  Low-opacity multiply blend keeps it
          readable underneath the body copy. */}
      <InteractiveGradient
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0.7,
          mixBlendMode: "multiply",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />

      <div className="relative z-10 max-w-[1380px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.6 }}
        >
          <SectionLabel number="001" name="pedagogy" />
        </motion.div>

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-16">
          <div className="lg:col-span-6">
            <motion.h2
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className="h-display text-[clamp(2.4rem,5vw,4.6rem)]"
            >
              <span className="block">stay silent.</span>
              <span
                className="block text-paper-dim"
                style={{ fontStyle: "italic" }}
              >
                intervene only
              </span>
              <span className="block">
                when it helps<span className="text-red-pencil">.</span>
              </span>
            </motion.h2>
          </div>

          <div className="lg:col-span-6 lg:pt-4 space-y-7">
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="text-paper-dim text-[15px] leading-[1.7] font-sub max-w-[52ch]"
            >
              The best math tutors are mostly silent. They sit beside the
              student, watch the work{" "}
              <strong className="text-paper font-bold">unfold</strong>, and
              intervene exactly twice in an hour — once to redirect, once to
              confirm. The rest is the student doing the thinking.
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="text-paper-dim text-[15px] leading-[1.7] font-sub max-w-[52ch]"
            >
              ione is built on this{" "}
              <strong className="text-paper font-bold">asymmetry</strong>.
              Speech is expensive; silence is the default. Every hint must
              earn its existence by passing through three stages of
              skepticism before reaching the student&apos;s ear.
            </motion.p>

            {/* hand-written aside */}
            <div
              className="hand text-[2rem] text-red-pencil pt-2"
              style={{ transform: "rotate(-1.5deg)" }}
            >
              the page belongs to the student.
            </div>
          </div>
        </div>

        {/* stats strip */}
        <div className="mt-24 grid grid-cols-2 sm:grid-cols-4 gap-y-10 border-t border-ink-line pt-10">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="flex flex-col gap-2"
            >
              <span
                className="text-paper text-[clamp(2.4rem,4vw,3.6rem)] leading-none"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {s.n}
              </span>
              <span className="meta-label">{s.label}</span>
            </motion.div>
          ))}
        </div>

        {/* pillars */}
        <div className="mt-28 grid grid-cols-1 md:grid-cols-2 gap-px bg-ink-line">
          {PILLARS.map((p, i) => (
            <motion.article
              key={p.title}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
              className="bg-ink p-10 flex flex-col gap-4 group hover:bg-ink-deep transition-colors duration-500"
            >
              <div className="flex items-baseline justify-between">
                <span
                  className="text-red-pencil text-[1.6rem] leading-none"
                  style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
                >
                  {p.n}
                </span>
                <span className="meta-label">pillar</span>
              </div>
              <h3
                className="text-paper text-[1.9rem] leading-[1.05] mt-3"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {p.title}
              </h3>
              <p className="text-paper-dim text-[14px] leading-[1.7] font-sub mt-1">
                {p.body}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
