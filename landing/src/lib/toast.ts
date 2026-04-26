/**
 * Imperative toast API.
 *
 * Phase 5 / R5.
 *
 * Usage:
 *   toast.error("session already active");
 *   toast.warn("ione missed a frame", { ttlMs: 8000 });
 *   toast.info("memory updated");
 *   toast.success("hint accepted");
 *
 *   toast.dismiss(id);   // optional manual dismiss
 *
 * The Toaster component mounted at the root subscribes via `subscribe()`
 * and renders the live queue. We keep this module event-bus-shaped (no
 * React imports) so callers from non-React modules (lib/capture, hooks,
 * etc.) can fire toasts without touching context.
 */

export type ToastSeverity = "info" | "success" | "warn" | "error";

export interface ToastOptions {
  /** Auto-dismiss after N ms. Pass 0 to disable auto-dismiss. */
  ttlMs?: number;
  /** Optional supporting copy under the headline. */
  description?: string;
  /** Optional explicit id (for de-duping repeated toasts). */
  id?: string;
}

export interface ToastRecord {
  id: string;
  severity: ToastSeverity;
  text: string;
  description?: string;
  createdAt: number;
  ttlMs: number;
}

type Listener = (toasts: ToastRecord[]) => void;

const TTL_DEFAULT_MS: Record<ToastSeverity, number> = {
  info: 4000,
  success: 4000,
  warn: 6000,
  error: 8000,
};

const queue: ToastRecord[] = [];
const listeners = new Set<Listener>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function notify() {
  for (const fn of listeners) fn([...queue]);
}

function push(severity: ToastSeverity, text: string, opts: ToastOptions = {}): string {
  const id = opts.id ?? `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // De-dupe by id: if a toast with this id is live, replace its content
  // and reset its timer.
  const existingIdx = queue.findIndex((t) => t.id === id);
  const ttlMs = opts.ttlMs ?? TTL_DEFAULT_MS[severity];
  const record: ToastRecord = {
    id,
    severity,
    text,
    description: opts.description,
    createdAt: Date.now(),
    ttlMs,
  };
  if (existingIdx >= 0) {
    queue[existingIdx] = record;
  } else {
    queue.push(record);
  }

  // Reset timer if any.
  const prev = timers.get(id);
  if (prev) clearTimeout(prev);
  if (ttlMs > 0) {
    const timer = setTimeout(() => dismiss(id), ttlMs);
    timers.set(id, timer);
  }

  notify();
  return id;
}

export function dismiss(id: string): void {
  const idx = queue.findIndex((t) => t.id === id);
  if (idx < 0) return;
  queue.splice(idx, 1);
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  notify();
}

export function clear(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  queue.length = 0;
  notify();
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  fn([...queue]);
  return () => {
    listeners.delete(fn);
  };
}

export const toast = {
  info: (text: string, opts?: ToastOptions) => push("info", text, opts),
  success: (text: string, opts?: ToastOptions) => push("success", text, opts),
  warn: (text: string, opts?: ToastOptions) => push("warn", text, opts),
  error: (text: string, opts?: ToastOptions) => push("error", text, opts),
  dismiss,
  clear,
};
