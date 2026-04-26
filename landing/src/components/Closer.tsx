import { motion } from "motion/react";
import { SectionLabel } from "./SectionLabel";
import { EnterCTA } from "./EnterCTA";
import { Link } from "react-router-dom";

export function Closer() {
  return (
    <section
      id="start"
      className="relative px-6 sm:px-10 py-32 sm:py-48 border-t border-ink-line overflow-hidden"
    >
      {/* big watermark integral, sitting behind everything */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center select-none"
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

      <div className="relative max-w-[1380px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.6 }}
        >
          <SectionLabel number="004" name="start" />
        </motion.div>

        <div className="mt-16 grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-16 items-end">
          <div className="lg:col-span-7">
            {/* the headline is rendered as a margin annotation — */}
            {/* a quote of the kind of hint ione actually says.    */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.7 }}
              className="meta-label mb-4 flex items-center gap-3"
            >
              <span className="text-red-pencil">▌</span>
              <span>a hint · t = 92s</span>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              className="h-display text-[clamp(3rem,8vw,8.4rem)]"
            >
              <span className="block">check the sign</span>
              <span className="block">
                on{" "}
                <span style={{ fontStyle: "italic" }}>line three</span>
                <span className="text-red-pencil">.</span>
              </span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="mt-10 max-w-[42ch] text-paper-dim text-[15px] leading-[1.7] font-sub"
            >
              ten words of voice. one specific question. delivered in 1.2
              seconds, only when ted needed it. the rest of the hour, ione
              was silent.
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.7, delay: 0.35 }}
              className="mt-12 flex flex-wrap items-center gap-5"
            >
              <EnterCTA />
              <Link to="/login" className="cta cta-ghost">
                already have an account?
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.7, delay: 0.5 }}
              className="mt-8 font-sub text-[11px] tracking-[0.18em] text-paper-mute"
            >
              works with iPad + goodnotes · no setup · email + password
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
      </div>

      {/* footer */}
      <div className="relative max-w-[1380px] mx-auto mt-32 pt-10 border-t border-ink-line flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6 font-sub text-[11px] uppercase tracking-[0.18em] text-paper-mute">
        <div className="flex items-center gap-4">
          <span
            className="text-paper text-2xl leading-none normal-case tracking-normal"
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
          >
            ione<span className="text-red-pencil">.</span>
          </span>
          <span className="text-paper-faint">© mmxxvi</span>
        </div>
        <div className="flex flex-wrap gap-x-7 gap-y-2">
          <a href="#pipeline" className="pencil-link">pipeline</a>
          <a href="https://github.com/MatthewKim323/ione" className="pencil-link">github</a>
          <a href="#" className="pencil-link">privacy</a>
        </div>
        <div className="text-paper-faint">
          built for the student, not at them.
        </div>
      </div>
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
