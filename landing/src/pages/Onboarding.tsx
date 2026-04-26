import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { AuthLayout } from "../components/AuthLayout";
import { Field } from "../components/Field";
import { OptionPill } from "../components/OptionPill";
import { OptionRow } from "../components/OptionRow";
import { SourceUpload } from "../components/SourceUpload";
import { SourceList } from "../components/SourceList";
import { GlowButton } from "../components/design/GlowButton";
import type {
  Grade,
  HintFrequency,
  MathClass,
  ProfileInsert,
  TrickyTopic,
} from "../lib/database.types";

const GRADES: { value: Grade; label: string }[] = [
  { value: "6", label: "6" },
  { value: "7", label: "7" },
  { value: "8", label: "8" },
  { value: "9", label: "9" },
  { value: "10", label: "10" },
  { value: "11", label: "11" },
  { value: "12", label: "12" },
  { value: "college", label: "college" },
  { value: "adult", label: "self-taught" },
];

const CLASSES: { value: MathClass; label: string; description?: string }[] = [
  { value: "pre_algebra", label: "Pre-Algebra" },
  { value: "algebra_1", label: "Algebra I" },
  { value: "geometry", label: "Geometry" },
  { value: "algebra_2", label: "Algebra II" },
  { value: "trigonometry", label: "Trigonometry" },
  { value: "pre_calculus", label: "Pre-Calculus" },
  { value: "calculus_1", label: "Calculus I", description: "intro / single-variable" },
  { value: "ap_calc_ab", label: "AP Calculus AB" },
  { value: "ap_calc_bc", label: "AP Calculus BC" },
  { value: "calculus_2", label: "Calculus II", description: "series, parametrics, polar" },
  { value: "linear_algebra", label: "Linear Algebra" },
  { value: "statistics", label: "Statistics" },
  { value: "other", label: "Something else" },
];

const TOPICS: { value: TrickyTopic; label: string }[] = [
  { value: "sign_errors", label: "sign errors" },
  { value: "fractions", label: "fractions" },
  { value: "word_problems", label: "word problems" },
  { value: "algebra_manipulation", label: "algebra steps" },
  { value: "factoring", label: "factoring" },
  { value: "exponents_logs", label: "exponents / logs" },
  { value: "trig_identities", label: "trig identities" },
  { value: "limits", label: "limits" },
  { value: "derivatives", label: "derivatives" },
  { value: "integrals", label: "integrals" },
  { value: "showing_work", label: "showing work" },
  { value: "memorizing_rules", label: "memorizing rules" },
  { value: "reading_problem", label: "reading the problem" },
  { value: "time_pressure", label: "time pressure" },
];

const FREQUENCIES: { value: HintFrequency; label: string; description: string }[] =
  [
    {
      value: "rare",
      label: "Rarely",
      description: "speak only when I'm clearly stuck for a while.",
    },
    {
      value: "balanced",
      label: "Balanced",
      description: "default — speak when intervention is high-value.",
    },
    {
      value: "active",
      label: "Actively",
      description: "speak more often, even at small forks in the work.",
    },
  ];

const TOTAL_STEPS = 4;

type StepKey = 0 | 1 | 2 | 3;

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();

  const [step, setStep] = useState<StepKey>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [firstName, setFirstName] = useState("");
  const [grade, setGrade] = useState<Grade | null>(null);

  // Step 2
  const [currentClass, setCurrentClass] = useState<MathClass | null>(null);
  const [trickyTopics, setTrickyTopics] = useState<TrickyTopic[]>([]);

  // Step 3
  const [hintVoice, setHintVoice] = useState(true);
  const [hintFrequency, setHintFrequency] = useState<HintFrequency>("balanced");

  // Step 4 — optional sources
  const [profileSaved, setProfileSaved] = useState(false);
  const [sourceListReloadKey, setSourceListReloadKey] = useState(0);

  function toggleTopic(t: TrickyTopic) {
    setTrickyTopics((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  const step1Valid = firstName.trim().length > 0 && grade !== null;
  const step2Valid = currentClass !== null;

  async function saveProfileThenAdvance() {
    if (!user) {
      setError("session expired. log in again.");
      return;
    }
    if (!grade || !currentClass) {
      setError("missing required answers.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const payload: ProfileInsert = {
      id: user.id,
      first_name: firstName.trim(),
      grade,
      current_class: currentClass,
      tricky_topics: trickyTopics,
      hint_voice: hintVoice,
      hint_frequency: hintFrequency,
      onboarded_at: new Date().toISOString(),
    };

    const { error: err } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" });

    if (err) {
      console.error("[onboarding] save failed", err);
      setSubmitting(false);
      setError(err.message.toLowerCase());
      return;
    }
    await refreshProfile();
    setProfileSaved(true);
    setSubmitting(false);
    setStep(3);
  }

  function finish() {
    navigate("/dashboard", { replace: true });
  }

  return (
    <AuthLayout
      wide={step === 3}
      meta={`onboarding / ${step + 1} of ${TOTAL_STEPS}`}
      title={
        step === 0 ? (
          <>
            who's at the <em>desk</em>?
          </>
        ) : step === 1 ? (
          <>
            what are you <em>working on</em>?
          </>
        ) : step === 2 ? (
          <>
            how should I <em>help</em>?
          </>
        ) : (
          <>
            what should I <em>read</em>?
          </>
        )
      }
      subtitle={
        step === 0
          ? "just enough to address you in the margin notes."
          : step === 1
            ? "context shapes what counts as a stall vs. genuine thinking."
            : step === 2
              ? "you can change any of this later from settings."
              : "drop in anything that shows where you actually struggle. optional — skip if you're starting blank."
      }
      footer={<StepDots active={step} total={TOTAL_STEPS} />}
    >
      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div
            key="step-0"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <Field
              label="first name"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="how should we address you?"
              autoComplete="given-name"
              autoFocus
            />

            <div className="mt-6 mb-2 font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
              grade level
            </div>
            <div className="flex flex-wrap gap-2">
              {GRADES.map((g) => (
                <OptionPill
                  key={g.value}
                  label={g.label}
                  selected={grade === g.value}
                  onClick={() => setGrade(g.value)}
                />
              ))}
            </div>

            <div className="flex justify-end mt-10">
              <GlowButton
                type="button"
                disabled={!step1Valid}
                onClick={() => setStep(1)}
                className="glow-btn--on-light disabled:opacity-40 disabled:cursor-not-allowed"
              >
                next
                <span aria-hidden>→</span>
              </GlowButton>
            </div>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div
            key="step-1"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-2 font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
              current class
            </div>
            <div className="flex flex-col gap-1.5 mb-8">
              {CLASSES.map((c) => (
                <OptionRow
                  key={c.value}
                  label={c.label}
                  description={c.description}
                  selected={currentClass === c.value}
                  onClick={() => setCurrentClass(c.value)}
                />
              ))}
            </div>

            <div className="mb-2 font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
              what feels tricky?
              <span className="ml-2 normal-case tracking-normal text-paper-faint">
                (optional — pick any that ring true)
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {TOPICS.map((t) => (
                <OptionPill
                  key={t.value}
                  label={t.label}
                  selected={trickyTopics.includes(t.value)}
                  onClick={() => toggleTopic(t.value)}
                />
              ))}
            </div>

            <div className="flex justify-between items-center mt-10">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="font-sub text-xs tracking-[0.14em] uppercase text-paper-mute hover:text-ink-deep transition-colors"
              >
                ← back
              </button>
              <GlowButton
                type="button"
                disabled={!step2Valid}
                onClick={() => setStep(2)}
                className="glow-btn--on-light disabled:opacity-40 disabled:cursor-not-allowed"
              >
                next
                <span aria-hidden>→</span>
              </GlowButton>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step-2"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-2 font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
              voice hints
            </div>
            <div className="flex gap-2 mb-8">
              <OptionPill
                label="speak hints aloud"
                selected={hintVoice}
                onClick={() => setHintVoice(true)}
              />
              <OptionPill
                label="text only"
                selected={!hintVoice}
                onClick={() => setHintVoice(false)}
              />
            </div>

            <div className="mb-2 font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
              intervention frequency
            </div>
            <div className="flex flex-col gap-1.5">
              {FREQUENCIES.map((f) => (
                <OptionRow
                  key={f.value}
                  label={f.label}
                  description={f.description}
                  selected={hintFrequency === f.value}
                  onClick={() => setHintFrequency(f.value)}
                />
              ))}
            </div>

            {error && (
              <p className="mt-4 font-sub text-[11px] text-red-pencil">
                {error}
              </p>
            )}

            <div className="flex justify-between items-center mt-10">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="font-sub text-xs tracking-[0.14em] uppercase text-paper-mute hover:text-ink-deep transition-colors"
              >
                ← back
              </button>
              <GlowButton
                type="button"
                disabled={submitting}
                onClick={() => {
                  if (profileSaved) {
                    setStep(3);
                  } else {
                    void saveProfileThenAdvance();
                  }
                }}
                className="glow-btn--on-light disabled:opacity-50 disabled:cursor-wait"
              >
                {submitting ? "saving…" : "next"}
                <span aria-hidden>→</span>
              </GlowButton>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step-3"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="text-paper-dim text-sm leading-relaxed mb-6 max-w-[58ch]">
              ione builds a private knowledge graph of you from these. drop
              files here (you can add more later from memory & graph). each file
              is classified from its name and type, then chunked for agents.
              nothing leaves your account.
            </p>

            <SourceUpload
              heading="add a first source"
              onUploaded={() => setSourceListReloadKey((k) => k + 1)}
            />

            <div className="mt-6">
              <SourceList reloadKey={sourceListReloadKey} />
            </div>

            {error && (
              <p className="mt-4 font-sub text-[11px] text-red-pencil">
                {error}
              </p>
            )}

            <div className="flex justify-between items-center mt-10">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="font-sub text-xs tracking-[0.14em] uppercase text-paper-mute hover:text-ink-deep transition-colors"
              >
                ← back
              </button>
              <div className="flex items-center gap-5">
                <button
                  type="button"
                  onClick={finish}
                  className="font-sub text-xs tracking-[0.14em] uppercase text-paper-mute hover:text-ink-deep transition-colors"
                >
                  skip for now
                </button>
                <GlowButton
                  type="button"
                  onClick={finish}
                  className="glow-btn--on-light"
                >
                  open the tutor
                  <span aria-hidden>→</span>
                </GlowButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}

function StepDots({ active, total }: { active: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-3">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={[
            "block w-8 h-px transition-colors duration-500",
            i === active
              ? "bg-red-pencil"
              : i < active
                ? "bg-paper-mute"
                : "bg-line",
          ].join(" ")}
          aria-current={i === active}
        />
      ))}
      <span className="ml-3 font-sub text-[10px] tracking-[0.22em] uppercase text-paper-faint tabular-nums">
        {active + 1} / {total}
      </span>
    </div>
  );
}
