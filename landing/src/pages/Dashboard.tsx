import { motion } from "motion/react";
import { useAuth } from "../lib/auth";
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
    <div className="min-h-screen bg-ink">
      {/* ── header ──────────────────────────────────────────────────── */}
      <header className="border-b border-ink-line px-6 sm:px-10 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span
            className="text-paper text-2xl leading-none"
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
          >
            ione<span className="text-red-pencil">.</span>
          </span>
          <span className="hidden sm:inline-block font-mono text-[10px] tracking-[0.22em] uppercase text-paper-mute">
            session / idle
          </span>
        </div>
        <div className="flex items-center gap-6">
          <span className="hidden sm:inline-block font-mono text-[10px] tracking-[0.22em] uppercase text-paper-mute">
            {user?.email}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="font-mono text-[11px] tracking-[0.14em] uppercase pencil-link"
          >
            sign out
          </button>
        </div>
      </header>

      {/* ── main ────────────────────────────────────────────────────── */}
      <main className="max-w-[1100px] mx-auto px-6 sm:px-10 pt-16 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="section-label mb-4">© ione — 000 / desk</div>
          <h1
            className="h-display text-[3.5rem] sm:text-[4.75rem] leading-[0.95] mb-8"
            style={{ fontStyle: "italic" }}
          >
            welcome, {firstName.toLowerCase()}.
          </h1>
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed max-w-[58ch] mb-16">
            your notebook is open. when you're ready to start a session, ione
            will watch your iPad work and intervene only when it'll genuinely
            help. for now, this is the desk — quiet on purpose.
          </p>
        </motion.div>

        {/* two-column session brief */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-12">
          {/* left: session brief */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-7"
          >
            <div className="section-label mb-4">session brief</div>
            <div className="border border-ink-line bg-ink-deep ruled-paper p-8 sm:p-10 relative">
              <div
                aria-hidden
                className="absolute left-[28px] top-0 bottom-0 w-px bg-red-pencil/30"
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
                        <span key={t} className="text-paper">
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

          {/* right: capture status placeholder */}
          <motion.aside
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5"
          >
            <div className="section-label mb-4">capture</div>
            <div className="border border-ink-line bg-ink-raise p-8 sm:p-10">
              <div className="flex items-baseline gap-3 mb-6">
                <span className="text-red-pencil text-2xl leading-none">●</span>
                <span className="font-mono text-[11px] tracking-[0.22em] uppercase text-paper-dim">
                  not yet capturing
                </span>
              </div>
              <p className="text-paper-dim text-sm leading-relaxed mb-8">
                connect an iPad mirror or screen share and ione will start
                watching. nothing is recorded until you press start.
              </p>
              <button
                type="button"
                disabled
                className="cta cta-ghost w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                title="capture coming soon"
              >
                start session
                <span aria-hidden>→</span>
              </button>
              <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-paper-faint mt-4 text-center">
                wiring in progress
              </p>
            </div>

            {/* margin note */}
            <div
              className="mt-6 pl-2"
              style={{ fontFamily: "var(--font-hand)" }}
            >
              <span className="text-red-pencil text-2xl leading-tight">
                tutor lives here →
              </span>
            </div>
          </motion.aside>
        </div>
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
        last ? "" : "border-b border-ink-line",
      ].join(" ")}
    >
      <div
        className="font-mono text-paper-mute text-sm pt-0.5"
        style={{ fontStyle: "italic", fontFamily: "var(--font-display)" }}
      >
        {meta}
      </div>
      <div>
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-mute mb-1">
          {label}
        </div>
        <div className="text-paper text-base leading-snug">{value}</div>
      </div>
    </div>
  );
}
