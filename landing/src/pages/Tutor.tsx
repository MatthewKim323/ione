import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { TutorWorkspace } from "../components/tutor/TutorWorkspace";
import { BackupVideoStage } from "../components/tutor/BackupVideoStage";
import { HairlineRule } from "../components/design/HairlineRule";

/**
 * /tutor — the live tutoring surface. Wraps the TutorWorkspace with the
 * shared ink-deep desk background and a thin top nav for return-to-dashboard.
 *
 * Modes:
 *   default            → live agent loop (`<TutorWorkspace />`).
 *   ?mode=video        → Phase 5 / R6 stage failsafe — plays a pre-rendered
 *                        recording. Useful when the conference wifi cracks.
 *   ?mode=demo         → handled inside `<TutorWorkspace />`; lowers the
 *                        predictive threshold for the rehearsed seed problem
 *                        only (Phase 5 / R4).
 */
export default function Tutor() {
  const [params] = useSearchParams();
  const mode = params.get("mode");

  const subtitle = useMemo(() => {
    if (mode === "video") return "ione · tutor · video";
    if (mode === "demo") return "ione · tutor · demo";
    return "ione · tutor";
  }, [mode]);

  return (
    <div className="min-h-screen bg-ink text-paper">
      <header className="px-6 sm:px-10 py-5 flex items-center justify-between max-w-[1280px] mx-auto">
        <Link
          to="/dashboard"
          className="font-mono text-[11px] tracking-[0.22em] uppercase text-paper-mute hover:text-paper transition-colors"
        >
          ← back to dashboard
        </Link>
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-faint">
          {subtitle}
        </span>
      </header>
      <HairlineRule />
      <main className="px-6 sm:px-10 py-8 max-w-[1280px] mx-auto">
        {mode === "video" ? <BackupVideoStage /> : <TutorWorkspace />}
      </main>
    </div>
  );
}
