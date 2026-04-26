import { useEffect, useRef, useState } from "react";
import type { RoiRect } from "../../lib/capture";

/**
 * Drag-out a rectangle on the live preview to constrain capture to the math
 * region. Phase 2 / E5.
 *
 * State machine:
 *   idle  → user clicks "select region" button on the parent
 *   armed → click+drag on the surface; we render the live rectangle
 *   set   → emit roi via onChange; show small "clear" affordance
 *
 * Coordinates are stored normalized 0..1 so the same crop holds across
 * window resizes.
 */
export function RoiPicker({
  roi,
  active,
  onChange,
  onCancel,
  className,
}: {
  roi: RoiRect | null;
  active: boolean;
  onChange: (roi: RoiRect | null) => void;
  onCancel: () => void;
  className?: string;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);

  useEffect(() => {
    if (!active) setDrag(null);
  }, [active]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!active) return;
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setDrag({ x0: x, y0: y, x1: x, y1: y });
    surfaceRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!active || !drag) return;
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setDrag({ ...drag, x1: x, y1: y });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!active || !drag) return;
    surfaceRef.current?.releasePointerCapture(e.pointerId);
    const x0 = Math.min(drag.x0, drag.x1);
    const x1 = Math.max(drag.x0, drag.x1);
    const y0 = Math.min(drag.y0, drag.y1);
    const y1 = Math.max(drag.y0, drag.y1);
    setDrag(null);
    if (x1 - x0 < 0.05 || y1 - y0 < 0.05) {
      onCancel();
      return;
    }
    onChange({ x0, y0, x1, y1 });
  };

  // When idle but ROI exists, show its outline (so the student can see what
  // ione is watching). When active, show the drag-rect or a cross-hair.
  const shown = drag ?? roi;
  const showOverlay = Boolean(shown);

  return (
    <div
      ref={surfaceRef}
      className={[
        "absolute inset-0",
        active ? "cursor-crosshair" : "pointer-events-none",
        className ?? "",
      ].join(" ")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {active && !drag && (
        <div className="absolute inset-0 flex items-center justify-center bg-paper/88 pointer-events-none">
          <span
            className="text-ink-deep text-[14px] tracking-wide"
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
          >
            drag a box around the math.
          </span>
        </div>
      )}
      {showOverlay && shown && (
        <div
          className="absolute border border-red-pencil/80 bg-red-pencil/[0.05] pointer-events-none"
          style={{
            left: `${Math.min(shown.x0, shown.x1) * 100}%`,
            top: `${Math.min(shown.y0, shown.y1) * 100}%`,
            width: `${Math.abs(shown.x1 - shown.x0) * 100}%`,
            height: `${Math.abs(shown.y1 - shown.y0) * 100}%`,
            boxShadow: "0 0 0 9999px rgba(74, 70, 63, 0.42)",
          }}
        />
      )}
    </div>
  );
}
