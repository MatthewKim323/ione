import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { SectionLabel } from "./SectionLabel";
// @ts-expect-error — LiquidChrome is a JSX file w/o type defs.
import LiquidChrome from "./LiquidChrome";

interface LogLine {
  t: string;
  kind:
    | "boot"
    | "skip"
    | "process"
    | "ocr"
    | "reason"
    | "intervene-silent"
    | "intervene-speak"
    | "tts"
    | "tutor"
    | "memory";
  text: string;
}

const LOG: LogLine[] = [
  { t: "12:04:00", kind: "boot", text: "$ ione start --student=ted" },
  {
    t: "12:04:00",
    kind: "boot",
    text: "  ▍ booting agents · backboard reachable · auth0 ok",
  },
  {
    t: "12:04:00",
    kind: "boot",
    text: "  ▍ canonical solver primed for problem 4 (∫ poly)",
  },
  { t: "12:04:08", kind: "skip", text: "capture · 1.04 MB · diff 0.00 → skip" },
  { t: "12:04:16", kind: "skip", text: "capture · 1.04 MB · diff 0.01 → skip" },
  {
    t: "12:04:24",
    kind: "process",
    text: "capture · 1.04 MB · diff 0.04 → process",
  },
  { t: "12:04:25", kind: "ocr", text: "ocr        2 lines       t=420ms" },
  {
    t: "12:04:26",
    kind: "reason",
    text: "reason     step_status=correct  t=890ms",
  },
  {
    t: "12:04:26",
    kind: "intervene-silent",
    text: "intervene  should_speak=false   reason=on_track",
  },
  { t: "12:04:32", kind: "skip", text: "capture · 1.04 MB · diff 0.00 → skip" },
  { t: "12:04:40", kind: "skip", text: "capture · 1.04 MB · diff 0.01 → skip" },
  {
    t: "12:04:48",
    kind: "process",
    text: "capture · 1.04 MB · diff 0.06 → process",
  },
  { t: "12:04:48", kind: "ocr", text: "ocr        3 lines       t=388ms" },
  {
    t: "12:04:49",
    kind: "reason",
    text: "reason     step_status=minor_error  severity=3",
  },
  {
    t: "12:04:49",
    kind: "memory",
    text: "memory     ted has 4 prior sign errors · escalate",
  },
  {
    t: "12:04:50",
    kind: "intervene-speak",
    text: "intervene  should_speak=true   type=error_callout",
  },
  {
    t: "12:04:50",
    kind: "tutor",
    text: '            "check the sign on line three."',
  },
  {
    t: "12:04:51",
    kind: "tts",
    text: "tts        elevenlabs/flash 1.2s → ▶",
  },
  {
    t: "12:05:18",
    kind: "process",
    text: "capture · 1.04 MB · diff 0.05 → process",
  },
  {
    t: "12:05:19",
    kind: "reason",
    text: "reason     step_status=correct  (corrected)",
  },
  {
    t: "12:05:19",
    kind: "intervene-silent",
    text: "intervene  should_speak=false   reason=do_not_interrupt_flow",
  },
];

const COLOR: Record<LogLine["kind"], string> = {
  boot: "text-paper-dim",
  skip: "text-paper-mute",
  process: "text-brass",
  ocr: "text-paper-dim",
  reason: "text-paper-dim",
  "intervene-silent": "text-moss",
  "intervene-speak": "text-red-pencil",
  tts: "text-paper-dim",
  tutor: "text-red-pencil",
  memory: "text-rust",
};

export function Signal() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (count >= LOG.length) return;
    // boot rows print fast, the rest print at "real time" feel
    const delay =
      LOG[count].kind === "boot"
        ? 90
        : LOG[count].kind === "tutor"
          ? 600
          : LOG[count].kind === "tts"
            ? 350
            : LOG[count].kind === "intervene-speak"
              ? 250
              : 130;
    const id = setTimeout(() => setCount((c) => c + 1), delay);
    return () => clearTimeout(id);
  }, [count]);

  // restart the print loop when it scrolls back into view (nice-to-have)
  return (
    <section
      id="signal"
      className="relative px-6 sm:px-10 py-32 sm:py-44 border-t border-ink-line overflow-hidden"
    >
      {/* Subtle purple LiquidChrome backdrop — sits behind everything,
          dim opacity + low amplitude so it reads as ambient depth, not
          a feature.  The vertical mask makes the chrome ease in at the
          top edge of the section and fade out at the bottom, so the
          transition with the neighboring sections is gradual instead
          of a hard rectangle of color appearing on scroll. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.26,
          // Vertical fade in/out (top + bottom 22% are the ramp zones)
          // crossed with a radial vignette so the corners also feather
          // into the page background rather than butting against it.
          maskImage:
            "linear-gradient(to bottom," +
            " rgba(0,0,0,0) 0%," +
            " rgba(0,0,0,1) 22%," +
            " rgba(0,0,0,1) 78%," +
            " rgba(0,0,0,0) 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom," +
            " rgba(0,0,0,0) 0%," +
            " rgba(0,0,0,1) 22%," +
            " rgba(0,0,0,1) 78%," +
            " rgba(0,0,0,0) 100%)",
        }}
      >
        <LiquidChrome
          // baseColor: deeper, more saturated purple at the troughs.
          baseColor={[0.22, 0.08, 0.36]}
          // maxColor: brightest peak — soft purple-lavender ≈ #C9B0FF.
          // (Shifted away from the previous #CCCCFF so the highlight
          // reads as purple rather than pale blue-white.)
          maxColor={[0.79, 0.69, 1.0]}
          speed={0.35}
          amplitude={0.18}
          frequencyX={2.5}
          frequencyY={1.5}
          interactive={true}
        />
      </div>

      <div className="relative max-w-[1380px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.6 }}
        >
          <SectionLabel number="003" name="signal" />
        </motion.div>

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-12">
          <div className="lg:col-span-5">
            <motion.h2
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className="h-display text-[clamp(2.4rem,5vw,4.6rem)] text-ink"
            >
              <span className="block">ione runs</span>
              <span className="block">
                in the{" "}
                <span style={{ fontStyle: "italic" }}>terminal</span>
                <span className="text-neon">.</span>
              </span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="text-ink/80 text-[15px] leading-[1.7] font-sub mt-10 max-w-[42ch]"
            >
              Every cycle prints a single line. Skipped frames in faint grey,
              processed frames in brass, the rare moment of speech in red. Most
              sessions are mostly grey.
            </motion.p>

            <div className="mt-10 space-y-3">
              {[
                ["grey", "skipped frame · diff < 0.04"],
                ["brass", "diff exceeded · processed"],
                ["moss", "intervene · stayed silent"],
                ["red", "intervene · spoke a hint"],
              ].map(([color, label]) => (
                <div key={label} className="flex items-center gap-3">
                  <span
                    className={`w-3 h-3 ${
                      color === "red"
                        ? "bg-red-pencil"
                        : color === "brass"
                          ? "bg-brass"
                          : color === "moss"
                            ? "bg-moss"
                            : "bg-paper-mute"
                    }`}
                  />
                  <span className="font-sub text-[11px] uppercase tracking-[0.18em] text-paper-mute">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* terminal box */}
          <div className="lg:col-span-7">
            <div className="border border-ink-line bg-ink-deep shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)]">
              {/* terminal chrome */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-ink-line">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-pencil/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-brass/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-moss/80" />
                </div>
                <div className="font-sub text-[10px] uppercase tracking-[0.22em] text-paper-mute">
                  ~/ione · ted&apos;s desk · zsh
                </div>
                <div className="font-sub text-[10px] tracking-[0.18em] text-paper-mute">
                  120×34
                </div>
              </div>

              {/* terminal body */}
              <div className="p-5 sm:p-7 font-mono text-[12.5px] leading-[1.75] min-h-[480px]">
                {LOG.slice(0, count).map((line, i) => (
                  <div key={i} className="flex gap-4 whitespace-pre">
                    <span className="text-paper-faint tabular-nums select-none">
                      {line.kind === "boot" ? "        " : `[${line.t}]`}
                    </span>
                    <span className={COLOR[line.kind]}>{line.text}</span>
                  </div>
                ))}
                {count < LOG.length ? (
                  <div className="flex gap-4">
                    <span className="text-paper-faint">          </span>
                    <span className="text-red-pencil pencil-cursor"></span>
                  </div>
                ) : (
                  <div className="flex gap-4 mt-3">
                    <span className="text-paper-faint tabular-nums">
                      [12:05:24]
                    </span>
                    <span className="text-paper-mute pencil-cursor">
                      capture · listening
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* footer caption */}
            <div className="mt-5 flex items-center justify-between font-sub text-[10px] uppercase tracking-[0.22em] text-paper-mute">
              <span>excerpt · 2026.04.25 · 1m 24s of session</span>
              <span>{count}/{LOG.length} lines</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
