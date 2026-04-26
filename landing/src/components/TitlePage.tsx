import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { SKIP_FX } from "../lib/prerender";
import { IntroTechLogoLoop } from "./IntroTechLogoLoop";

// ─── Handwriting choreography for the wordmark ────────────────────────
const STROKE_START = 0.3;
const STROKE_DUR = 0.42;
const STROKE_GAP = 0.12;

function strokeAt(index: number) {
  const start = STROKE_START + index * (STROKE_DUR + STROKE_GAP);
  return { start, end: start + STROKE_DUR };
}

const HAND_EASE = [0.65, 0, 0.35, 1] as const;

/** Logo leads the ∫ stroke slightly — same opacity / y-em motion as letters. */
const LOGO_LEAD_S = 0.14;

function HandwrittenWordmark({
  onIntroComplete,
}: {
  onIntroComplete?: () => void;
}) {
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
          onAnimationComplete={
            reduceMotion || !onIntroComplete ? undefined : onIntroComplete
          }
        >
          .
        </motion.span>
      </motion.span>
    </span>
  );
}

function TitleLogoMark({
  reduceMotion,
  skipFx,
}: {
  reduceMotion: boolean;
  skipFx: boolean;
}) {
  const instant = reduceMotion || skipFx;
  const delay = Math.max(0.06, STROKE_START - LOGO_LEAD_S);
  /** Ship `logo.svg`; swap to `logo.png` when that file exists (no 404 flash). */
  const [src, setSrc] = useState("/logo.svg");
  useLayoutEffect(() => {
    const probe = new Image();
    probe.onload = () => setSrc("/logo.png");
    probe.src = "/logo.png";
  }, []);

  return (
    <motion.img
      src={src}
      alt=""
      width={128}
      height={128}
      decoding="async"
      draggable={false}
      className="shrink-0 select-none [font-size:inherit]"
      style={{
        height: "0.82em",
        width: "auto",
        maxWidth: "min(26vw, 1.85em)",
        objectFit: "contain",
        filter:
          "drop-shadow(0 2px 0 rgba(0,0,0,0.28)) drop-shadow(0 6px 18px rgba(0,0,0,0.35)) drop-shadow(0 14px 36px rgba(0,0,0,0.28))",
      }}
      initial={instant ? { opacity: 1, y: "0em" } : { opacity: 0, y: "0.06em" }}
      animate={{ opacity: 1, y: "0em" }}
      transition={
        instant
          ? { duration: 0 }
          : {
              delay,
              duration: STROKE_DUR,
              ease: HAND_EASE,
            }
      }
    />
  );
}

export function TitlePage({
  onIntroComplete,
}: {
  /** Fires once the handwritten title (including period bounce) has finished. */
  onIntroComplete?: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const firedRef = useRef(false);

  const fireIntroComplete = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onIntroComplete?.();
  };

  useEffect(() => {
    if (!onIntroComplete) return;
    if (SKIP_FX) {
      fireIntroComplete();
      return;
    }
    if (reduceMotion) {
      const id = window.setTimeout(fireIntroComplete, 520);
      return () => clearTimeout(id);
    }
  }, [reduceMotion, onIntroComplete]);

  useEffect(() => {
    if (!onIntroComplete || SKIP_FX || reduceMotion) return;
    const id = window.setTimeout(fireIntroComplete, 4800);
    return () => clearTimeout(id);
  }, [reduceMotion, onIntroComplete]);

  return (
    <section className="relative min-h-screen" style={{ minHeight: "100vh" }}>
      {/* Iris-style vertical tech strip — intro hero only (matches useiris.tech placement). */}
      <div
        className="pointer-events-none absolute z-[1] hidden md:block"
        style={{
          top: "50%",
          right: "clamp(124px, 15vw, 236px)",
          transform: "translateY(-50%)",
          height: "clamp(344px, 50vh, 452px)",
          width: "104px",
          overflow: "hidden",
          opacity: 0.88,
        }}
        aria-hidden
      >
        <IntroTechLogoLoop />
      </div>

      <div className="relative z-[2] flex min-h-screen flex-col justify-start items-start pl-3 pr-6 py-8 sm:pl-4 sm:pr-10 sm:py-10 md:pl-5 md:pr-14 md:py-12 lg:pl-7 lg:pr-16 text-left pb-[clamp(2.75rem,7vh,5.5rem)] pt-[clamp(4.5rem,16vh,14rem)] md:pt-[clamp(5rem,18vh,16rem)]">
        <div className="flex w-full max-w-[min(100%,92vw)] flex-col items-stretch -translate-x-0.5 sm:-translate-x-1 md:-translate-x-1.5">
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
              display: "inline-flex",
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "flex-end",
              overflow: "visible",
            }}
          >
            <motion.span
              className="inline-flex flex-row flex-wrap items-end gap-x-0 gap-y-[0.12em] [text-rendering:optimizeLegibility] [font-size:inherit]"
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.85, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
            >
              <TitleLogoMark reduceMotion={reduceMotion} skipFx={SKIP_FX} />
              <span className="inline-flex min-w-0 items-end -ml-[0.14em] sm:-ml-[0.18em] md:-ml-[0.2em]">
                <HandwrittenWordmark
                  onIntroComplete={
                    SKIP_FX || reduceMotion ? undefined : fireIntroComplete
                  }
                />
              </span>
            </motion.span>

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
