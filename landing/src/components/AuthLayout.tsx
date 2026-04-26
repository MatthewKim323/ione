import { Link } from "react-router-dom";
import { motion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Shared chrome for /login, /signup, and /onboarding pages.
 *
 * Visual: a single ruled-paper "page" centered on the ink background, with the
 * brand mark up top and a meta line above the form.  Auth pages all use the
 * same layout so navigating between them feels like turning pages in the same
 * notebook, not jumping between unrelated screens.
 */
export function AuthLayout({
  meta,
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  meta: string;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Use the wider page format for steps with embedded panels (e.g. doc upload). */
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-ink">
      <header className="px-6 sm:px-10 pt-6 sm:pt-8 flex items-center justify-between">
        <Link
          to="/"
          className="font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute hover:text-paper transition-colors"
        >
          ← back
        </Link>
        <Link
          to="/"
          className="text-paper text-2xl leading-none"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
        >
          ione<span className="text-red-pencil">.</span>
        </Link>
        <div className="font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
          {meta}
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 sm:px-10 py-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className={`w-full ${wide ? "max-w-[680px]" : "max-w-[460px]"} relative`}
        >
          {/* the page */}
          <div className="relative ruled-paper border border-ink-line bg-ink-deep px-8 py-10 sm:px-10 sm:py-12">
            {/* red margin rule on the left side, like a real notebook page */}
            <div
              aria-hidden
              className="absolute left-[28px] top-0 bottom-0 w-px bg-red-pencil/40"
            />

            <div className="section-label mb-6">{meta}</div>
            <h1
              className="h-editorial text-[2.25rem] sm:text-[2.625rem] mb-3"
              style={{ fontStyle: "italic" }}
            >
              {title}
            </h1>
            {subtitle && (
              <p className="text-paper-dim text-sm leading-relaxed mb-8 max-w-[36ch]">
                {subtitle}
              </p>
            )}
            {children}
          </div>

          {footer && (
            <div className="mt-6 text-center font-sub text-[11px] tracking-[0.14em] uppercase text-paper-mute">
              {footer}
            </div>
          )}
        </motion.div>
      </main>

      <footer className="px-6 sm:px-10 pb-6 font-sub text-[10px] tracking-[0.22em] uppercase text-paper-faint flex justify-between">
        <span>© ione</span>
        <span>tutor in the margin</span>
      </footer>
    </div>
  );
}
