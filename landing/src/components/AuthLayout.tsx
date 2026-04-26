import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useCallback, useEffect } from "react";
import type { ReactNode, MouseEvent } from "react";

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
  dismissDeskClick = false,
}: {
  meta: string;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Use the wider page format for steps with embedded panels (e.g. doc upload). */
  wide?: boolean;
  /**
   * Clicking the grey “desk” (outside the cream card + footer block) returns
   * in history — used on /login for a light dismiss.
   */
  dismissDeskClick?: boolean;
}) {
  const navigate = useNavigate();

  const onDeskClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!dismissDeskClick) return;
      const n = e.target as Node;
      const el = n instanceof Element ? n : n.parentElement;
      if (!el) return;
      if (el.closest("[data-auth-sheet]")) return;
      if (el.closest("header")) return;
      if (window.history.length > 1) navigate(-1);
      else navigate("/");
    },
    [dismissDeskClick, navigate],
  );

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
    <div
      className="desk-page flex min-h-screen flex-col pl-10 pr-6 sm:pl-20 sm:pr-10"
      onClick={onDeskClick}
    >
      <header className="flex items-center justify-between pt-6 sm:pt-8">
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

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center py-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className={`h-fit w-full shrink-0 ${
            wide ? "max-w-[680px]" : "max-w-[460px]"
          } relative`}
        >
          {/* the sheet of paper — only this + the link footer block “own” the sheet, not
              the full-width motion wrapper, so desk clicks in <main> stay outside data-auth-sheet */}
          <div
            data-auth-sheet
            className="notebook-card with-margin-rule ruled-paper-light py-10 pl-20 pr-8 sm:py-12 sm:pl-24 sm:pr-10"
          >
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
            <div
              data-auth-sheet
              className="mt-6 text-center font-sub text-[11px] tracking-[0.14em] uppercase text-paper-mute"
            >
              {footer}
            </div>
          )}
        </motion.div>
      </main>

      <footer className="flex justify-between pb-6 font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
        <span>© ione</span>
        <span>tutor in the margin</span>
      </footer>
    </div>
  );
}
