import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { AuthLayout } from "../components/AuthLayout";
import { Field } from "../components/Field";
import { GlowButton } from "../components/design/GlowButton";

export default function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("password needs at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("passwords don't match.");
      return;
    }

    setSubmitting(true);
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/onboarding` },
    });
    setSubmitting(false);

    if (err) {
      setError(err.message.toLowerCase());
      return;
    }
    // Two cases:
    //   1. Email confirmation OFF in Supabase → session is returned, route
    //      guards will pick it up and send us to /onboarding.
    //   2. Email confirmation ON → no session yet, show the "check your inbox"
    //      state instead of leaving the user staring at the form.
    if (data.session) {
      navigate("/onboarding", { replace: true });
    } else {
      setNeedsConfirm(true);
    }
  }

  if (needsConfirm) {
    return (
      <AuthLayout
        dismissDeskClick
        meta="account / pending"
        title={<>check your inbox.</>}
        subtitle={
          <>
            we sent a confirmation link to <span className="text-ink-deep">{email}</span>.
            click it and we&apos;ll pick right up.
          </>
        }
        footer={
          <>
            already confirmed?{" "}
            <Link to="/login" className="text-ink-deep hover:text-red-pencil">
              log in
            </Link>
          </>
        }
      >
        <div className="font-sub text-xs text-paper-dim leading-relaxed">
          if it doesn&apos;t show up in a minute or two, peek inside your spam
          folder. ione&apos;s emails are quiet but they&apos;re real.
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      dismissDeskClick
      meta="account / 001"
      title={
        <>
          start a <em>notebook</em>.
        </>
      }
      subtitle={
        <>
          ione watches your work and only intervenes when it&apos;ll help. first we
          need to know who&apos;s at the desk.
        </>
      }
      footer={
        <>
          have an account?{" "}
          <Link to="/login" className="text-ink-deep hover:text-red-pencil">
            log in
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
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="at least 8 characters"
          hint="we never see your work — just the timestamps."
        />
        <Field
          label="confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="type it again"
          error={error}
        />

        <GlowButton
          type="submit"
          disabled={submitting}
          className="glow-btn--on-light glow-btn--block mt-6"
        >
          {submitting ? "drawing the line…" : "create account"}
          <span aria-hidden>→</span>
        </GlowButton>
      </form>
    </AuthLayout>
  );
}
