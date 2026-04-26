import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { useEffect } from "react";
import type { ReactNode } from "react";

/**
 * Shared chrome for /login, /signup, and /onboarding pages.
 *
 * Visual: a sheet of cream parchment resting on the warm off-white desk
 * (matching the landing page bg). The brand mark up top, a meta line above
 * the form, a red pencil margin rule on the left of the page. All auth
 * surfaces share the same layout so navigating between them feels like
 * turning pages in the same notebook.
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
  // Match the landing page bg so the desk feels continuous across surfaces.
  useEffect(() => {
    const prevBody = document.body.style.backgroundColor;
    const prevHtml = document.documentElement.style.backgroundColor;
    document.body.style.backgroundColor = "#f2f2f2";
    document.documentElement.style.backgroundColor = "#f2f2f2";
    return () => {
      document.body.style.backgroundColor = prevBody;
      document.documentElement.style.backgroundColor = prevHtml;
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col desk-page">
      <header className="px-6 sm:px-10 pt-6 sm:pt-8 flex items-center justify-between">
        <Link
          to="/"
          className="font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute hover:text-ink-deep transition-colors"
        >
          ← back
        </Link>
        <Link
          to="/"
          className="text-ink-deep text-2xl leading-none"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
        >
          ione<span className="text-neon">.</span>
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
          {/* the sheet of paper resting on the desk */}
          <div className="notebook-card with-margin-rule ruled-paper-light px-8 py-10 sm:px-10 sm:py-12">
            <div className="section-label-light mb-6">{meta}</div>
            <h1
              className="h-display-light text-[2.25rem] sm:text-[2.625rem] mb-3"
              style={{ fontStyle: "italic" }}
            >
              {title}
            </h1>
            {subtitle && (
              <p className="text-paper-faint text-sm leading-relaxed mb-8 max-w-[36ch]">
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

      <footer className="px-6 sm:px-10 pb-6 font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute flex justify-between">
        <span>© ione</span>
        <span>tutor in the margin</span>
      </footer>
    </div>
  );
}
