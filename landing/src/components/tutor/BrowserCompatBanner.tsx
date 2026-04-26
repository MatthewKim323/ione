import { useEffect, useState } from "react";
import {
  describeMissing,
  probeBrowserSupport,
  type BrowserSupportReport,
} from "../../lib/browserSupport";

/**
 * Banner that probes the browser on mount and warns when a capability the
 * tutor needs is missing. Sits above the workspace; dismissable so a user
 * who knows what they're doing can ignore it.
 *
 * Phase 5 / R3.
 */
export function BrowserCompatBanner() {
  const [report, setReport] = useState<BrowserSupportReport | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setReport(probeBrowserSupport());
  }, []);

  if (!report || report.ok || dismissed) return null;

  return (
    <div
      role="alert"
      className="border border-rust bg-rust/[0.08] px-5 py-4 mb-6 flex items-start gap-4"
      style={{ boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.04)" }}
    >
      <div className="flex-1 min-w-0">
        <div className="font-sub text-[10px] tracking-[0.22em] uppercase text-rust mb-1">
          browser · heads up
        </div>
        <div
          className="text-ink-deep text-[15px]"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
        >
          {describeMissing(report.missing)}
        </div>
        <div className="text-paper-faint text-[13px] mt-1.5 leading-relaxed">
          ione is built around <span className="text-ink-deep">Chrome 120+</span>{" "}
          on a desktop or laptop. detected:{" "}
          <span className="text-ink-deep">{report.uaHint}</span>. open this page
          in chrome and the tutor will start working.
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="font-sub text-[10px] tracking-[0.18em] uppercase text-paper-faint hover:text-ink-deep transition-colors px-2 py-1"
        aria-label="dismiss browser warning"
      >
        dismiss
      </button>
    </div>
  );
}
