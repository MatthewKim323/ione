import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * Workspace shell on /tutor.
 * - `ink` — late-night notebook (original).
 * - `desk` — cream sheet on the light desk, aligned with /dashboard.
 */
export function Notebook({
  children,
  className,
  variant = "ink",
}: {
  children: ReactNode;
  className?: string;
  variant?: "ink" | "desk";
}) {
  const isDesk = variant === "desk";
  return (
    <div
      className={[
        "relative border",
        isDesk
          ? "bg-paper border-line ruled-paper-light text-ink-deep"
          : "bg-ink-deep border-ink-line ruled-paper",
        className ?? "",
      ].join(" ")}
      style={{
        boxShadow: isDesk
          ? "inset 0 20px 48px -32px rgba(74,70,63,0.06), 0 18px 48px -28px rgba(74,70,63,0.14)"
          : "inset 0 24px 60px -36px rgba(0,0,0,0.65), 0 30px 80px -45px rgba(0,0,0,0.55)",
      }}
    >
      {children}
    </div>
  );
}

/** Persisted column widths for the three-pane tutor / agent surface. */
export type NotebookLayoutResizableOptions = {
  /** localStorage key (include a version suffix if you change min defaults). */
  storageKey: string;
  defaultLeftPx?: number;
  defaultRightPx?: number;
};

const RESIZE_HANDLE_PX = 8;
const MIN_MAIN_PX = 280;
const MIN_LEFT_PX = 200;
const MIN_RIGHT_PX = 220;
const DEFAULT_LEFT_PX = 300;
const DEFAULT_RIGHT_PX = 360;
const MAX_LEFT_PX = 560;
const MAX_RIGHT_PX = 640;

function loadPersistedSizes(
  key: string,
  defaults: { left: number; right: number },
): { left: number; right: number } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaults;
    const j = JSON.parse(raw) as { left?: unknown; right?: unknown };
    const left = typeof j.left === "number" ? j.left : defaults.left;
    const right = typeof j.right === "number" ? j.right : defaults.right;
    return {
      left: clamp(left, MIN_LEFT_PX, MAX_LEFT_PX),
      right: clamp(right, MIN_RIGHT_PX, MAX_RIGHT_PX),
    };
  } catch {
    return defaults;
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function subscribeLg(cb: () => void) {
  const mq = window.matchMedia("(min-width: 1024px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function lgSnapshot() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(min-width: 1024px)").matches;
}

function lgServerSnapshot() {
  return false;
}

function useLgBreakpoint() {
  return useSyncExternalStore(subscribeLg, lgSnapshot, lgServerSnapshot);
}

type ResizableInnerProps = {
  left: ReactNode;
  main: ReactNode;
  margin: ReactNode;
  className?: string;
  variant: "ink" | "desk";
  storageKey: string;
  defaultLeftPx: number;
  defaultRightPx: number;
};

function NotebookLayoutResizable({
  left,
  main,
  margin,
  className,
  variant,
  storageKey,
  defaultLeftPx,
  defaultRightPx,
}: ResizableInnerProps) {
  const isDesk = variant === "desk";
  const railBorder = isDesk
    ? "border-t border-line lg:border-t-0 lg:border-r lg:border-line"
    : "border-t border-ink-line lg:border-t-0 lg:border-r lg:border-ink-line";
  const marginBorder = isDesk
    ? "border-t border-line lg:border-t-0 lg:border-l lg:border-line"
    : "border-t border-ink-line lg:border-t-0 lg:border-l lg:border-ink-line";
  const marginRule = isDesk ? "page-rule-light" : "page-rule";

  const lg = useLgBreakpoint();
  const rootRef = useRef<HTMLDivElement>(null);
  const defaults = useRef({
    left: defaultLeftPx,
    right: defaultRightPx,
  });

  const [leftW, setLeftW] = useState(defaultLeftPx);
  const [rightW, setRightW] = useState(defaultRightPx);
  const widthsRef = useRef({ left: defaultLeftPx, right: defaultRightPx });
  widthsRef.current = { left: leftW, right: rightW };

  useLayoutEffect(() => {
    const d = {
      left: defaultLeftPx,
      right: defaultRightPx,
    };
    defaults.current = d;
    const loaded = loadPersistedSizes(storageKey, d);
    setLeftW(loaded.left);
    setRightW(loaded.right);
  }, [storageKey, defaultLeftPx, defaultRightPx]);

  const persist = useCallback(
    (L: number, R: number) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ left: L, right: R }));
      } catch {
        // private mode / quota
      }
    },
    [storageKey],
  );

  const drag = useRef<{
    edge: "left" | "right";
    startX: number;
    startLeft: number;
    startRight: number;
  } | null>(null);

  const applyBounds = useCallback((L: number, R: number) => {
    const w = rootRef.current?.getBoundingClientRect().width ?? 1200;
    const maxLeft = Math.min(
      MAX_LEFT_PX,
      w - MIN_MAIN_PX - R - RESIZE_HANDLE_PX * 2,
    );
    const maxRight = Math.min(
      MAX_RIGHT_PX,
      w - MIN_MAIN_PX - L - RESIZE_HANDLE_PX * 2,
    );
    return {
      left: clamp(L, MIN_LEFT_PX, Math.max(MIN_LEFT_PX, maxLeft)),
      right: clamp(R, MIN_RIGHT_PX, Math.max(MIN_RIGHT_PX, maxRight)),
    };
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d0 = drag.current;
      if (!d0) return;
      const dx = e.clientX - d0.startX;
      if (d0.edge === "left") {
        const next = applyBounds(d0.startLeft + dx, d0.startRight);
        setLeftW(next.left);
      } else {
        const next = applyBounds(d0.startLeft, d0.startRight - dx);
        setRightW(next.right);
      }
    };
    const onUp = () => {
      if (!drag.current) return;
      drag.current = null;
      const { left: L, right: R } = widthsRef.current;
      const b = applyBounds(L, R);
      setLeftW(b.left);
      setRightW(b.right);
      persist(b.left, b.right);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [applyBounds, persist]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !lg) return;
    const ro = new ResizeObserver(() => {
      if (drag.current) return;
      const { left: L, right: R } = widthsRef.current;
      const b = applyBounds(L, R);
      if (b.left !== L || b.right !== R) {
        setLeftW(b.left);
        setRightW(b.right);
        persist(b.left, b.right);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [lg, applyBounds, persist]);

  const startDragLeft = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const { left: L, right: R } = widthsRef.current;
    drag.current = {
      edge: "left",
      startX: e.clientX,
      startLeft: L,
      startRight: R,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const startDragRight = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const { left: L, right: R } = widthsRef.current;
    drag.current = {
      edge: "right",
      startX: e.clientX,
      startLeft: L,
      startRight: R,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleStrip = isDesk
    ? "cursor-col-resize touch-none select-none border-0 p-0 w-2 shrink-0 bg-transparent hover:bg-brass/12 active:bg-brass/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brass/50"
    : "cursor-col-resize touch-none select-none border-0 p-0 w-2 shrink-0 bg-transparent hover:bg-paper-dim/10 active:bg-paper-dim/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-paper-dim/40";

  const gridStyle: CSSProperties | undefined =
    lg
      ? {
          display: "grid",
          gap: 0,
          gridTemplateColumns: `${leftW}px ${RESIZE_HANDLE_PX}px minmax(0,1fr) ${RESIZE_HANDLE_PX}px ${rightW}px`,
        }
      : undefined;

  const resetWidths = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const L = defaults.current.left;
      const R = defaults.current.right;
      const b = applyBounds(L, R);
      setLeftW(b.left);
      setRightW(b.right);
      persist(b.left, b.right);
    },
    [applyBounds, persist],
  );

  return (
    <div
      ref={rootRef}
      className={[
        "min-w-0 gap-0",
        lg ? "" : "grid grid-cols-1",
        className ?? "",
      ].join(" ")}
      style={gridStyle}
    >
      {/* DOM order = mobile stack: main → agent trace → margin (matches legacy NotebookLayout). */}
      <div
        className={[
          "relative p-6 sm:p-8 lg:p-10 min-h-0",
          "col-start-1 row-start-1 lg:col-start-3 lg:row-start-1",
        ].join(" ")}
      >
        {main}
      </div>

      <button
        type="button"
        aria-label="Resize columns: agent trace and main"
        title="Drag to resize. Double-click to reset default widths."
        onPointerDown={startDragLeft}
        onDoubleClick={resetWidths}
        className={[handleStrip, "hidden lg:block lg:col-start-2 lg:row-start-1 self-stretch z-10"].join(
          " ",
        )}
      />

      <aside
        className={[
          "relative p-6 sm:p-8 lg:p-10 min-h-0",
          railBorder,
          "col-start-1 row-start-2 lg:col-start-1 lg:row-start-1",
        ].join(" ")}
      >
        {left}
      </aside>

      <button
        type="button"
        aria-label="Resize columns: main and margin"
        title="Drag to resize. Double-click to reset default widths."
        onPointerDown={startDragRight}
        onDoubleClick={resetWidths}
        className={[handleStrip, "hidden lg:block lg:col-start-4 lg:row-start-1 self-stretch z-10"].join(
          " ",
        )}
      />

      <aside
        className={[
          "relative border-l-0 lg:border-l",
          marginBorder,
          "p-6 sm:p-8 lg:p-10 min-h-0",
          marginRule,
          "col-start-1 row-start-3 lg:col-start-5 lg:row-start-1",
        ].join(" ")}
      >
        {margin}
      </aside>
    </div>
  );
}

/**
 * Two- or three-column notebook layout — capture in the middle, marginalia
 * pinned to the right gutter, and an optional left "agent trace" rail.
 *
 *   • without `left`: `[main | margin]` (the historical 2-col tutor)
 *   • with `left`:    `[left | main | margin]` (3-col, lg+ only)
 *
 * On widths below `lg` we always stack the columns top-to-bottom so the
 * iPad mirror keeps pride of place on tablet/phone. Putting the agent trace
 * BEFORE the main column on small screens would mean the user has to scroll
 * past the log to find their work — we put it after instead, just above the
 * margin notes.
 *
 * When `resizableThreeColumn` is passed together with `left`, large screens
 * show drag handles between the three panes; widths persist in localStorage.
 */
export function NotebookLayout({
  left,
  main,
  margin,
  className,
  variant = "ink",
  resizableThreeColumn,
}: {
  /** Optional left rail (e.g. agent trace). 300px on lg+, stacks below `main` on smaller widths. */
  left?: ReactNode;
  main: ReactNode;
  margin: ReactNode;
  className?: string;
  variant?: "ink" | "desk";
  resizableThreeColumn?: NotebookLayoutResizableOptions;
}) {
  if (left && resizableThreeColumn) {
    return (
      <NotebookLayoutResizable
        left={left}
        main={main}
        margin={margin}
        className={className}
        variant={variant}
        storageKey={resizableThreeColumn.storageKey}
        defaultLeftPx={resizableThreeColumn.defaultLeftPx ?? DEFAULT_LEFT_PX}
        defaultRightPx={resizableThreeColumn.defaultRightPx ?? DEFAULT_RIGHT_PX}
      />
    );
  }

  const isDesk = variant === "desk";
  const railBorder = isDesk
    ? "border-t border-line lg:border-t-0 lg:border-r lg:border-line"
    : "border-t border-ink-line lg:border-t-0 lg:border-r lg:border-ink-line";
  const marginBorder = isDesk
    ? "border-t border-line lg:border-t-0 lg:border-l lg:border-line"
    : "border-t border-ink-line lg:border-t-0 lg:border-l lg:border-ink-line";
  const marginRule = isDesk ? "page-rule-light" : "page-rule";

  const cols = left
    ? "grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_360px]"
    : "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]";

  return (
    <div className={["grid gap-0", cols, className ?? ""].join(" ")}>
      {/* Left rail — agent trace. Hidden on mobile, dropped after `main`. */}
      {left && (
        <aside
          className={[
            // small screens: row 2 (after main, before margin); large: column 1
            "relative p-6 sm:p-8 lg:p-10",
            railBorder,
            "order-2 lg:order-1",
          ].join(" ")}
        >
          {left}
        </aside>
      )}
      <div
        className={[
          "relative p-6 sm:p-8 lg:p-10 min-h-0",
          left ? "order-1 lg:order-2" : "",
        ].join(" ")}
      >
        {main}
      </div>
      <aside
        className={[
          "relative border-l-0 lg:border-l",
          marginBorder,
          "p-6 sm:p-8 lg:p-10",
          marginRule,
          left ? "order-3" : "",
        ].join(" ")}
      >
        {margin}
      </aside>
    </div>
  );
}
