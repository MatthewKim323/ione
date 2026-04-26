import { motion, useReducedMotion } from "motion/react";

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
  const reduceMotion = useReducedMotion() ?? false;
  const integral = strokeAt(0);
  const o = strokeAt(1);
  const n = strokeAt(2);
  const e = strokeAt(3);
  const period = strokeAt(4);
  const tittleAt = integral.end + 0.06;
  /** One up–down–up cycle; `repeat: 1` in transition ⇒ two bounces total. */
  const PERIOD_BOUNCE_DUR = 0.4;

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
            transform: "translate(-0.035em, 0.08em)",
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
              left: "0.4em",
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
        <motion.span
          aria-hidden
          style={{
            display: "inline-block",
            color: "inherit",
            fontStyle: "normal",
            willChange: reduceMotion ? undefined : "transform",
          }}
          initial={reduceMotion ? false : { y: 0 }}
          animate={
            reduceMotion
              ? { y: 0 }
              : { y: ["0em", "-0.07em", "0em"] }
          }
          transition={
            reduceMotion
              ? { duration: 0 }
              : {
                  // Same delay as the period stroke so bounce starts as it appears.
                  delay: period.start,
                  duration: PERIOD_BOUNCE_DUR,
                  repeat: 1,
                  ease: [0.4, 0, 0.2, 1],
                }
          }
        >
          .
        </motion.span>
      </motion.span>
    </span>
  );
}

export function TitlePage() {
  return (
    <section className="relative min-h-screen" style={{ minHeight: "100vh" }}>
      <div className="relative flex min-h-screen flex-col justify-center items-start px-6 py-8 sm:px-10 sm:py-10 md:px-14 md:py-12 lg:pl-20 text-left pb-[clamp(2.75rem,7vh,5.5rem)]">
        <div className="flex w-full max-w-[min(100%,92vw)] flex-col items-stretch">
          <h1
            className="h-display"
            style={{
              fontSize: "clamp(7rem, 22vw, 22rem)",
              letterSpacing: "-0.04em",
              lineHeight: 0.9,
              color: "#FFFFFF",
              fontStyle: "italic",
              textShadow:
                "0 2px 0 rgba(0,0,0,0.32)," +
                " 0 8px 24px rgba(0,0,0,0.4)," +
                " 0 20px 52px rgba(0,0,0,0.32)",
              position: "relative",
              display: "inline-block",
              overflow: "visible",
            }}
          >
            <motion.div
              className="inline-block w-full [text-rendering:optimizeLegibility]"
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.85, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
            >
              <HandwrittenWordmark />
            </motion.div>

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
          </h1>

          <div className="intro-title-rule-wrap w-full" aria-hidden>
            <div className="intro-title-rule" />
          </div>
        </div>
      </div>
    </section>
  );
}
