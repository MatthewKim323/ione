import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { SKIP_FX } from "../lib/prerender";

const LOADER_SRC = "/loader.mp4";

/** Shell fade — landing is mounted underneath for a full crossfade */
const EXIT_DURATION = 1.14;
const EXIT_EASE = [0.33, 1, 0.64, 1] as const;

type LandingLoaderProps = {
  onFinished: () => void;
  /** Fires once when exit starts — parent mounts the real landing under this layer */
  onExitStart?: () => void;
  /** Full-viewport color behind the video (e.g. black to match the clip). */
  pageBg: string;
};

/**
 * Initial landing view: centered loader video + thin bar (progress = playback position).
 * Fades out once assets + fonts are ready and the clip has finished (or errored).
 */
export function LandingLoader({
  onFinished,
  onExitStart,
  pageBg,
}: LandingLoaderProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef(0);
  const doneRef = useRef(false);
  const exitStartFiredRef = useRef(false);

  const [assetsReady, setAssetsReady] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const [videoBroken, setVideoBroken] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [playhead, setPlayhead] = useState(0);

  const safeFinish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onFinished();
  }, [onFinished]);

  useEffect(() => {
    if (SKIP_FX || reduceMotion) {
      safeFinish();
    }
  }, [reduceMotion, safeFinish]);

  useEffect(() => {
    if (SKIP_FX || reduceMotion) return;

    let cancelled = false;
    const run = async () => {
      try {
        await Promise.all([
          document.readyState === "complete"
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                window.addEventListener("load", () => resolve(), { once: true });
              }),
          document.fonts?.ready ?? Promise.resolve(),
        ]);
      } catch {
        /* ignore */
      }
      if (!cancelled) setAssetsReady(true);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [reduceMotion]);

  useEffect(() => {
    if (SKIP_FX || reduceMotion) return;
    const video = videoRef.current;
    if (!video) return;

    const tick = () => {
      const d = video.duration;
      if (Number.isFinite(d) && d > 0) {
        const t = Math.min(Math.max(video.currentTime, 0), d);
        setPlayhead(t / d);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [reduceMotion]);

  useEffect(() => {
    if (SKIP_FX || reduceMotion) return;
    const video = videoRef.current;
    if (!video) return;

    const onEnded = () => setVideoEnded(true);
    const onError = () => setVideoBroken(true);

    const tryPlay = () => {
      void video.play().catch(() => {
        /* autoplay */
      });
    };

    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);

    if (video.readyState >= 1) tryPlay();
    else video.addEventListener("canplay", tryPlay, { once: true });

    return () => {
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      video.removeEventListener("canplay", tryPlay);
    };
  }, [reduceMotion]);

  useEffect(() => {
    if (SKIP_FX || reduceMotion) return;
    const video = videoRef.current;
    if (!video || !videoEnded || assetsReady) return;
    try {
      video.pause();
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Math.max(0, video.duration - 0.04);
      }
    } catch {
      /* ignore */
    }
  }, [videoEnded, assetsReady, reduceMotion]);

  const videoOk = videoEnded || videoBroken;

  useEffect(() => {
    if (SKIP_FX || reduceMotion) return;
    if (!assetsReady || !videoOk || exiting) return;
    setExiting(true);
  }, [assetsReady, videoOk, exiting, reduceMotion]);

  useEffect(() => {
    if (SKIP_FX || reduceMotion) return;
    if (!videoBroken || !assetsReady || exiting) return;
    setPlayhead(1);
    setExiting(true);
  }, [videoBroken, assetsReady, exiting, reduceMotion]);

  useEffect(() => {
    if (SKIP_FX || reduceMotion) return;
    const t = window.setTimeout(() => {
      if (doneRef.current) return;
      setAssetsReady(true);
      setVideoEnded(true);
      setVideoBroken(true);
    }, 12000);
    return () => clearTimeout(t);
  }, [reduceMotion]);

  useEffect(() => {
    if (!exiting || SKIP_FX || reduceMotion) return;
    if (exitStartFiredRef.current) return;
    exitStartFiredRef.current = true;
    onExitStart?.();
  }, [exiting, onExitStart, reduceMotion]);

  useEffect(() => {
    if (!exiting) return;
    const ms = EXIT_DURATION * 1000 + 60;
    const t = window.setTimeout(() => safeFinish(), ms);
    return () => clearTimeout(t);
  }, [exiting, safeFinish]);

  if (SKIP_FX || reduceMotion) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[3] flex flex-col items-center justify-center px-5 sm:px-8"
      style={{
        backgroundColor: pageBg,
        pointerEvents: exiting ? "none" : "auto",
      }}
      initial={{ opacity: 1 }}
      animate={
        exiting
          ? { opacity: 0, scale: 1.018 }
          : { opacity: 1, scale: 1 }
      }
      transition={{
        duration: EXIT_DURATION,
        ease: EXIT_EASE,
      }}
      aria-busy="true"
      aria-label="Loading"
    >
      <motion.div
        className="flex w-full max-w-[min(320px,82vw)] flex-col items-center"
        initial={false}
        animate={
          exiting
            ? { opacity: 0, y: 14, scale: 0.94 }
            : { opacity: 1, y: 0, scale: 1 }
        }
        transition={{
          duration: EXIT_DURATION * 0.88,
          ease: EXIT_EASE,
        }}
      >
        <video
          ref={videoRef}
          className="w-full max-h-[min(28vh,220px)] sm:max-h-[min(30vh,240px)] object-contain"
          src={LOADER_SRC}
          muted
          playsInline
          preload="auto"
        />
        <div
          className="mt-4 h-[2px] w-[min(140px,36vw)] overflow-hidden rounded-full bg-white/[0.12]"
          aria-hidden
        >
          <div
            className="h-full rounded-full bg-white/[0.42] transition-[width] duration-100 ease-linear"
            style={{ width: `${Math.round(playhead * 10000) / 100}%` }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}
