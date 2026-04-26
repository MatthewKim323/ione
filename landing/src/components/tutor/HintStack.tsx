import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { HintCard, type SurfacedHint } from "./HintCard";

/**
 * A queue of marginalia hints. Shows the latest 3, dedups consecutive
 * identical text within a 12s window (so a flicker in the SSE doesn't
 * cause a hint to appear twice), and fades each card after its lifetime.
 */

const MAX_VISIBLE = 3;
const DEDUP_WINDOW_MS = 12_000;

export function HintStack({
  incoming,
  audioMuted = false,
}: {
  incoming: SurfacedHint | null;
  audioMuted?: boolean;
}) {
  const [hints, setHints] = useState<SurfacedHint[]>([]);
  const seenRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!incoming) return;
    const now = Date.now();

    // dedup by normalized text within window.
    const norm = incoming.text.replace(/\s+/g, " ").trim().toLowerCase();
    const lastSeen = seenRef.current.get(norm) ?? 0;
    if (now - lastSeen < DEDUP_WINDOW_MS) return;
    seenRef.current.set(norm, now);
    // garbage-collect old entries.
    for (const [k, t] of seenRef.current) {
      if (now - t > DEDUP_WINDOW_MS * 4) seenRef.current.delete(k);
    }

    setHints((prev) => {
      const next = [...prev, incoming];
      // keep at most MAX_VISIBLE; drop oldest beyond.
      while (next.length > MAX_VISIBLE) next.shift();
      return next;
    });
  }, [incoming]);

  const handleDismiss = useCallback((id: string) => {
    setHints((prev) => prev.filter((h) => h.id !== id));
  }, []);

  return (
    <div
      className="relative flex flex-col items-stretch gap-1"
      aria-live="polite"
    >
      <AnimatePresence>
        {hints.map((h) => (
          <HintCard
            key={h.id}
            hint={h}
            onDismiss={handleDismiss}
            audioMuted={audioMuted}
          />
        ))}
      </AnimatePresence>
      {hints.length === 0 && (
        <div
          className="mt-4 text-paper-faint text-[12px] leading-relaxed select-none"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
        >
          ione is reading along. it'll only speak when there's something
          worth saying.
        </div>
      )}
    </div>
  );
}
