import { motion } from "motion/react";

// ─── Handwriting choreography for the wordmark ────────────────────────
const STROKE_START = 0.3;
const STROKE_DUR = 0.42;
const STROKE_GAP = 0.12;

function strokeAt(index: number) {
  const start = STROKE_START + index * (STROKE_DUR + STROKE_GAP);
  return { start, end: start + STROKE_DUR };
}

const HAND_EASE = [0.65, 0, 0.35, 1] as const;

function HandwrittenWordmark() {
  const integral = strokeAt(0);
  const o = strokeAt(1);
  const n = strokeAt(2);
  const e = strokeAt(3);
  const period = strokeAt(4);
  const tittleAt = integral.end + 0.06;

  const letterMotionProps = (start: number) => ({
    initial: { opacity: 0, y: "0.06em" },
    animate: { opacity: 1, y: "0em" },
    transition: { delay: start, duration: STROKE_DUR, ease: HAND_EASE },
    style: {
      display: "inline-block",
      position: "relative" as const,
    },
  });

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <motion.span {...letterMotionProps(integral.start)}>
        <span
          aria-hidden
          style={{
            position: "relative",
            display: "inline-block",
            fontSize: "0.88em",
            marginRight: "-0.1em",
            transform: "translateY(0.08em)",
          }}
        >
          ∫
          <motion.span
            aria-hidden
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              delay: tittleAt,
              duration: 0.22,
              ease: [0.34, 1.56, 0.64, 1],
            }}
            style={{
              position: "absolute",
              left: "0.28em",
              top: "-0.12em",
              width: "0.1em",
              height: "0.1em",
              borderRadius: "9999px",
              backgroundColor: "currentColor",
              transformOrigin: "50% 50%",
            }}
          />
        </span>
      </motion.span>

      <motion.span {...letterMotionProps(o.start)}>
        <span aria-hidden>o</span>
      </motion.span>

      <motion.span {...letterMotionProps(n.start)}>
        <span aria-hidden>n</span>
      </motion.span>

      <motion.span {...letterMotionProps(e.start)}>
        <span aria-hidden>e</span>
      </motion.span>

      <motion.span
        {...letterMotionProps(period.start)}
        style={{
          ...letterMotionProps(period.start).style,
          color: "#FFFFFF",
          fontStyle: "normal",
        }}
      >
        .
      </motion.span>
    </span>
  );
}

export function TitlePage() {
  return (
    <section
      className="relative min-h-screen"
      style={{ minHeight: "100vh" }}
    >
      {/* Wordmark only — vertically centered, left-aligned. */}
      <div className="flex min-h-screen flex-col justify-center items-start px-6 sm:px-10 md:px-14 lg:pl-20 text-left">
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.25 }}
          className="h-display"
          style={{
            fontSize: "clamp(7rem, 22vw, 22rem)",
            letterSpacing: "-0.04em",
            lineHeight: 0.9,
            color: "#FFFFFF",
            fontStyle: "italic",
            textShadow:
              "0 1px 0 rgba(0,0,0,0.22)," +
              " 0 6px 18px rgba(0,0,0,0.28)," +
              " 0 18px 48px rgba(0,0,0,0.22)",
            position: "relative",
            display: "inline-block",
            overflow: "visible",
          }}
        >
          <HandwrittenWordmark />

          <span
            style={{
              position: "absolute",
              width: "1px",
              height: "1px",
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
              clipPath: "inset(50%)",
              whiteSpace: "nowrap",
            }}
          >
            ione.
          </span>
        </motion.h1>
      </div>
    </section>
  );
}
