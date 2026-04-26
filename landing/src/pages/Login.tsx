import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { AuthLayout } from "../components/AuthLayout";
import { Field } from "../components/Field";
import { GlowButton } from "../components/design/GlowButton";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const intendedFrom = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setSubmitting(false);

    if (err) {
      setError(
        err.message.toLowerCase().includes("invalid")
          ? "that email + password combo doesn't match."
          : err.message.toLowerCase(),
      );
      return;
    }
    // PublicOnlyRoute will redirect us to /onboarding or /dashboard based on
    // profile state, but if we came from a specific page, prefer that.
    navigate(intendedFrom ?? "/dashboard", { replace: true });
  }

  return (
    <AuthLayout
      dismissDeskClick
      meta="account / re-open"
      title={
        <>
          welcome <em>back</em>.
        </>
      }
      subtitle={
        <>
          pick up where the last session left a margin note. ione remembers what
          you were working on.
        </>
      }
      footer={
        <>
          new here?{" "}
          <Link to="/signup" className="text-ink-deep hover:text-red-pencil">
            create account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <Field
          label="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@school.edu"
        />
        <Field
          label="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="•••••••••"
          error={error}
        />

        <GlowButton
          type="submit"
          disabled={submitting}
          className="glow-btn--on-light glow-btn--block mt-6"
        >
          {submitting ? "opening…" : "log in"}
          <span aria-hidden>→</span>
        </GlowButton>
      </form>
    </AuthLayout>
  );
}
