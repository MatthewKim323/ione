/**
 * Toaster — bottom-right marginalia stack.
 *
 * Phase 5 / R5.
 *
 * Subscribes to lib/toast and renders the live queue. Each toast is a card
 * keyed in the marginalia palette:
 *
 *   info     ink (paper text on raised paper)
 *   success  moss
 *   warn     brass
 *   error    red-pencil
 *
 * Animations are CSS-only (no motion lib) so the component stays cheap.
 * Mounted once at the App root.
 */
import { useEffect, useState } from "react";
import { dismiss, subscribe, type ToastRecord, type ToastSeverity } from "../lib/toast";

const SEVERITY_STYLES: Record<
  ToastSeverity,
  { bar: string; text: string; ring: string; tag: string }
> = {
  info: {
    bar: "bg-paper-mute",
    text: "text-paper",
    ring: "border-ink-line",
    tag: "ione",
  },
  success: {
    bar: "bg-moss",
    text: "text-paper",
    ring: "border-ink-line",
    tag: "ok",
  },
  warn: {
    bar: "bg-brass",
    text: "text-paper",
    ring: "border-ink-line",
    tag: "heads up",
  },
  error: {
    bar: "bg-red-pencil",
    text: "text-paper",
    ring: "border-red-pencil",
    tag: "error",
  },
};

export function Toaster() {
  const [items, setItems] = useState<ToastRecord[]>([]);

  useEffect(() => subscribe(setItems), []);

  if (items.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none"
      style={{ width: "min(92vw, 380px)" }}
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((t) => {
        const styles = SEVERITY_STYLES[t.severity];
        return (
          <div
            key={t.id}
            role={t.severity === "error" ? "alert" : "status"}
            className={`pointer-events-auto group relative bg-ink-deep border ${styles.ring} px-4 py-3`}
            style={{
              animation: "toast-in 220ms cubic-bezier(0.16,1,0.3,1)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            }}
          >
            <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${styles.bar}`} />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 pl-2">
                <div
                  className={`font-sub text-[9px] tracking-[0.22em] uppercase mb-1 ${
                    t.severity === "error"
                      ? "text-red-pencil"
                      : t.severity === "warn"
                        ? "text-brass"
                        : t.severity === "success"
                          ? "text-moss"
                          : "text-paper-mute"
                  }`}
                >
                  {styles.tag}
                </div>
                <div
                  className={`text-[14px] leading-snug ${styles.text}`}
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {t.text}
                </div>
                {t.description && (
                  <div className="font-sub text-[11px] tracking-wide text-paper-mute mt-1.5 leading-relaxed">
                    {t.description}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="text-paper-mute hover:text-red-pencil transition-colors text-[16px] leading-none px-1 -mr-1"
                aria-label="dismiss"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes toast-in {
          from {
            opacity: 0;
            transform: translateY(8px) translateX(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0) translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
