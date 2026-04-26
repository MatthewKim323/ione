import { motion, useMotionValue, useSpring, useReducedMotion } from "motion/react";
import { useRef } from "react";
import type { ReactNode } from "react";

const SPRING = { stiffness: 400, damping: 35, mass: 0.8 };

type Props = {
  children: ReactNode;
  index: number;
};

/**
 * 3D tilt (Framer-style: perspective + spring). Pointer drives rotateX/Y;
 * rests flat when reduced motion is requested.
 */
export function PedagogyPillarCard({ children, index }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const sRx = useSpring(rotateX, reduce ? { stiffness: 500, damping: 50 } : SPRING);
  const sRy = useSpring(rotateY, reduce ? { stiffness: 500, damping: 50 } : SPRING);
  const scale = useMotionValue(1);
  const sScale = useSpring(scale, reduce ? { stiffness: 500, damping: 50 } : SPRING);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    // ~±11° like interactive tilt; eases the Framer “fan” feel on hover
    rotateX.set(-y * 22);
    rotateY.set(x * 22);
  };

  const onEnter = () => {
    if (reduce) return;
    sScale.set(1.04);
  };

  const onLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
    sScale.set(1);
  };

  return (
    <div className="[perspective:1200px] h-full min-h-[280px]">
      <motion.div
        ref={ref}
        onMouseMove={onMove}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 0.6, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
        className="h-full flex flex-col rounded-2xl border border-ink-line/80 bg-ink/95 p-10 gap-4 shadow-[0_1px_2px_0_rgba(0,0,0,0.25),0_12px_40px_-12px_rgba(0,0,0,0.35)] will-change-transform"
        style={{
          rotateX: sRx,
          rotateY: sRy,
          scale: sScale,
          transformStyle: "preserve-3d",
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
