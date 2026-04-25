import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { SectionLabel } from "./SectionLabel";

export function Demo() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Once flipped to true, never plays again for the rest of this page-load.
  // A full refresh remounts the component and resets it to false.
  const hasPlayedRef = useRef(false);

  // For the visual "play" indicator on the chrome (purely cosmetic).
  const [phase, setPhase] = useState<"idle" | "playing" | "ended">("idle");

  useEffect(() => {
    const section = sectionRef.current;
    const video = videoRef.current;
    if (!section || !video) return;

    const onEnded = () => setPhase("ended");
    const onPlay = () => setPhase("playing");
    video.addEventListener("ended", onEnded);
    video.addEventListener("play", onPlay);

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (hasPlayedRef.current) continue;
          hasPlayedRef.current = true;
          // Always start from the beginning, then play once.
          video.currentTime = 0;
          const p = video.play();
          if (p && typeof p.catch === "function") {
            p.catch(() => {
              // Autoplay was blocked — let the click-to-play overlay handle it.
              hasPlayedRef.current = false;
            });
          }
        }
      },
      { threshold: 0.45 }
    );
    io.observe(section);

    return () => {
      io.disconnect();
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("play", onPlay);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="demo"
      className="relative px-6 sm:px-10 py-32 sm:py-44 border-t border-ink-line"
    >
      <div className="max-w-[1380px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.6 }}
        >
          <SectionLabel number="004" name="demo" />
        </motion.div>

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-12">
          <div className="lg:col-span-6">
            <motion.h2
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className="h-display text-[clamp(2.4rem,5vw,4.6rem)]"
            >
              <span className="block">see it</span>
              <span className="block">
                in <span style={{ fontStyle: "italic" }}>motion</span>
                <span className="text-red-pencil">.</span>
              </span>
            </motion.h2>
          </div>
          <div className="lg:col-span-6 lg:pt-4">
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="text-paper-dim text-[15px] leading-[1.7] font-mono max-w-[52ch]"
            >
              The capture loop on a real session — frames sampled, diffed, and
              sent only when something changed. Plays once when you scroll
              here; stays on its last frame until you refresh.
            </motion.p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="mt-16"
        >
          <div className="border border-ink-line bg-ink-deep shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)]">
            {/* chrome */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-ink-line">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-pencil/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-brass/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-moss/80" />
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-paper-mute">
                ione · live capture
              </div>
              <div className="font-mono text-[10px] tracking-[0.18em] text-paper-mute tabular-nums">
                {phase === "idle"
                  ? "● idle"
                  : phase === "playing"
                    ? "● rec"
                    : "▣ end"}
              </div>
            </div>

            {/* video */}
            <div className="relative aspect-video w-full bg-black">
              <video
                ref={videoRef}
                src="/demo.mp4"
                muted
                playsInline
                preload="auto"
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-paper-mute">
            <span>excerpt · screen capture · 2026.04.25</span>
            <span>
              {phase === "idle"
                ? "ready"
                : phase === "playing"
                  ? "playing once"
                  : "complete · refresh to replay"}
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
