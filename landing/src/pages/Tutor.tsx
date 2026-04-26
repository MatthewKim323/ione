import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { TutorWorkspace } from "../components/tutor/TutorWorkspace";
import { BackupVideoStage } from "../components/tutor/BackupVideoStage";
import { HairlineRule } from "../components/design/HairlineRule";

/**
 * /tutor — live tutoring + agents. Light “desk” chrome matches /dashboard;
 * the workspace itself is a cream notebook sheet (see Notebook variant).
 */
export default function Tutor() {
  const [params] = useSearchParams();
  const mode = params.get("mode");

  const subtitle = useMemo(() => {
    if (mode === "video") return "ione · tutor · video";
    if (mode === "demo") return "ione · tutor · demo";
    return "ione · tutor · agents";
  }, [mode]);

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
    <div className="min-h-screen desk-page">
      <header className="border-b border-line px-6 sm:px-10 py-5 flex items-center justify-between max-w-[1280px] mx-auto bg-desk/80 backdrop-blur-[2px] sticky top-0 z-20">
        <Link
          to="/dashboard"
          className="font-sub text-[11px] tracking-[0.22em] uppercase pencil-link-light"
        >
          ← back to desk
        </Link>
        <span className="font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
          {subtitle}
        </span>
      </header>
      <div className="max-w-[1280px] mx-auto px-6 sm:px-10">
        <HairlineRule tone="line" className="my-0" />
      </div>
      <main className="px-6 sm:px-10 py-8 max-w-[1280px] mx-auto">
        {mode === "video" ? <BackupVideoStage /> : <TutorWorkspace />}
      </main>
    </div>
  );
}
