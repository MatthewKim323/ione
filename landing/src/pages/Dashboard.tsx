import { useEffect } from "react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { MeetTheTutorCard } from "../components/dashboard/MeetTheTutorCard";
import type {
  HintFrequency,
  MathClass,
  TrickyTopic,
} from "../lib/database.types";

const CLASS_LABELS: Record<MathClass, string> = {
  pre_algebra: "Pre-Algebra",
  algebra_1: "Algebra I",
  geometry: "Geometry",
  algebra_2: "Algebra II",
  trigonometry: "Trigonometry",
  pre_calculus: "Pre-Calculus",
  calculus_1: "Calculus I",
  ap_calc_ab: "AP Calculus AB",
  ap_calc_bc: "AP Calculus BC",
  calculus_2: "Calculus II",
  linear_algebra: "Linear Algebra",
  statistics: "Statistics",
  other: "Self-directed",
};

const TOPIC_LABELS: Record<TrickyTopic, string> = {
  sign_errors: "sign errors",
  fractions: "fractions",
  word_problems: "word problems",
  algebra_manipulation: "algebra steps",
  factoring: "factoring",
  exponents_logs: "exponents / logs",
  trig_identities: "trig identities",
  limits: "limits",
  derivatives: "derivatives",
  integrals: "integrals",
  showing_work: "showing work",
  memorizing_rules: "memorizing rules",
  reading_problem: "reading the problem",
  time_pressure: "time pressure",
};

const FREQ_LABELS: Record<HintFrequency, string> = {
  rare: "rarely (mostly silent)",
  balanced: "balanced (default)",
  active: "actively (more guidance)",
};

export default function Dashboard() {
  const { user, profile, signOut } = useAuth();

  // Sync the desk page background with the html/body so overscroll never
  // shows the old dark ink. Mirrors the landing's PAGE_BG handling.
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

  if (!profile) return null; // route guard ensures we have one, but TS

  const firstName = profile.first_name;
  const classLabel = profile.current_class
    ? CLASS_LABELS[profile.current_class]
    : "—";
  const gradeLabel = profile.grade ?? "—";
  const topics = profile.tricky_topics
    .map((t) => TOPIC_LABELS[t])
    .filter(Boolean);

  return (
    <div className="min-h-screen desk-page">
      {/* ── header ──────────────────────────────────────────────────── */}
      <header className="border-b border-line px-6 sm:px-10 py-5 flex items-center justify-between bg-desk/80 backdrop-blur-[2px] sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            aria-label="back to landing"
            className="text-ink-deep text-2xl leading-none hover:opacity-80 transition-opacity"
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
          >
            ione<span className="text-neon">.</span>
          </Link>
          <span className="hidden sm:inline-flex items-center gap-2 font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
            <span aria-hidden>●</span>
            your desk
          </span>
        </div>
        <div className="flex items-center gap-6">
          <Link
            to="/dashboard/graph"
            className="font-sub text-[11px] tracking-[0.14em] uppercase pencil-link-light"
          >
            memory & graph
          </Link>
          <Link
            to="/"
            className="hidden sm:inline-block font-sub text-[11px] tracking-[0.14em] uppercase pencil-link-light"
          >
            ← landing
          </Link>
          <span className="hidden md:inline-block font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
            {user?.email}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="font-sub text-[11px] tracking-[0.14em] uppercase pencil-link-light"
          >
            sign out
          </button>
        </div>
      </header>

      {/* ── main: hero is full-bleed; desk content stays in a reading column ─ */}
      <main className="pt-10 sm:pt-12 pb-24 overflow-x-hidden">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <MeetTheTutorCard />
        </motion.div>

        <div className="max-w-[1100px] mx-auto px-6 sm:px-10 mt-16 sm:mt-20">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="section-label-light mb-4">© ione — 000 / desk</div>
            <h1 className="h-display-light text-[3.5rem] sm:text-[4.75rem] leading-[0.95] mb-2">
              welcome,{" "}
              <span className="h-forest">{firstName.toLowerCase()}.</span>
            </h1>
            <p className="text-paper-faint text-base sm:text-lg leading-relaxed max-w-[58ch] mb-12 mt-4">
              the strip above is the live tutor — drift when it is quiet, surge
              when it speaks. your session card and graph sit here on the calm
              desk.
            </p>
          </motion.div>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="section-label-light mb-4">session brief</div>
            <div className="notebook-card ruled-paper-light p-8 sm:p-10 relative">
              <div
                aria-hidden
                className="absolute left-[28px] top-3 bottom-3 w-px bg-red-pencil/40"
              />

              <BriefRow
                meta="i."
                label="working in"
                value={classLabel}
              />
              <BriefRow
                meta="ii."
                label="known stalls"
                value={
                  topics.length > 0 ? (
                    <span className="flex flex-wrap gap-x-3 gap-y-1">
                      {topics.map((t, i) => (
                        <span key={t} className="text-ink-deep">
                          {t}
                          {i < topics.length - 1 && (
                            <span className="text-paper-mute ml-3">·</span>
                          )}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-paper-mute italic">
                      none yet — ione will learn yours.
                    </span>
                  )
                }
              />
              <BriefRow
                meta="iii."
                label="hints"
                value={`${profile.hint_voice ? "voice on" : "text only"} · ${FREQ_LABELS[profile.hint_frequency]}`}
              />
              <BriefRow
                meta="iv."
                label="grade"
                value={
                  profile.grade === "college"
                    ? "college"
                    : profile.grade === "adult"
                      ? "self-taught"
                      : profile.grade
                        ? `grade ${profile.grade}`
                        : gradeLabel
                }
                last
              />
            </div>
          </motion.section>
        </div>

        {/* ── knowledge graph lives on /dashboard/graph (one ingest surface) ─ */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-[1100px] mx-auto px-6 sm:px-10 mt-24"
        >
          <div className="section-label-light mb-4">© ione — 001 / graph</div>
          <div className="notebook-card ruled-paper-light p-8 sm:p-10 relative">
            <div
              aria-hidden
              className="absolute left-[28px] top-3 bottom-3 w-px bg-red-pencil/40"
            />
            <h2
              className="h-display-light text-[1.75rem] sm:text-[2.25rem] leading-tight mb-3 pl-2 sm:pl-0"
            >
              build your <em className="h-forest">knowledge graph</em>
            </h2>
            <p className="text-paper-faint text-sm sm:text-base leading-relaxed max-w-[58ch] mb-8 pl-2 sm:pl-0">
              uploads, indexing, and “what does ione think it knows” all live
              in one place now. drop a mixed bag of files at once — each file is
              chunked and routed to extractors automatically.
            </p>
            <Link
              to="/dashboard/graph"
              className="inline-flex items-center gap-2 cta-light px-6 py-3 font-sub text-[11px] tracking-[0.18em] uppercase ml-2 sm:ml-0"
            >
              open memory & graph →
            </Link>
          </div>
        </motion.section>
      </main>
    </div>
  );
}

function BriefRow({
  meta,
  label,
  value,
  last,
}: {
  meta: string;
  label: string;
  value: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={[
        "grid grid-cols-[3rem_1fr] gap-4 py-4",
        last ? "" : "border-b border-line-soft",
      ].join(" ")}
    >
      <div
        className="font-sub text-paper-mute text-sm pt-0.5"
        style={{ fontStyle: "italic", fontFamily: "var(--font-display)" }}
      >
        {meta}
      </div>
      <div>
        <div className="font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute mb-1">
          {label}
        </div>
        <div className="text-ink-deep text-base leading-snug">{value}</div>
      </div>
    </div>
  );
}
