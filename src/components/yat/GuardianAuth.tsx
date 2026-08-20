import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";

type Mode = "login" | "signup" | "forgot";

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="h-[54px] w-full rounded-2xl border border-input bg-card px-4 text-[15px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
      />
    </label>
  );
}

export function GuardianAuth({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setInfo(null);

    try {
      setBusy(true);

      if (mode === "signup") {
        if (!name.trim()) throw new Error("Please enter your name.");
        if (password.length < 6) throw new Error("Password must be at least 6 characters.");
        if (password !== confirm) throw new Error("Passwords do not match.");

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name.trim() },
          },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setInfo("Account created. Check your email to confirm, then sign in.");
          switchMode("login");
          setInfo("Account created. Check your email to confirm, then sign in.");
        }
        return;
      }

      if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setInfo("Password reset link sent. Check your email.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
    } catch (caught) {
      console.error("[guardian-auth]", caught);
      setError(caught instanceof Error ? caught.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "signup" ? "Create Guardian Account" : mode === "forgot" ? "Forgot Password" : "Welcome Back";
  const subtitle =
    mode === "signup"
      ? "Set up your Guardian account to connect devices."
      : mode === "forgot"
        ? "We'll email you a link to reset your password."
        : "Sign in to your Guardian account.";

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-8 pt-4">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 self-start text-[13px] font-medium text-muted-foreground"
      >
        ← Back
      </button>

      <h1 className="text-[24px] font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {mode === "signup" && (
          <Field
            label="Name"
            type="text"
            value={name}
            onChange={setName}
            placeholder="Your name"
            autoComplete="name"
          />
        )}
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="email"
        />
        {mode !== "forgot" && (
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        )}
        {mode === "signup" && (
          <Field
            label="Confirm Password"
            type="password"
            value={confirm}
            onChange={setConfirm}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        )}

        {mode === "login" && (
          <button
            type="button"
            onClick={() => switchMode("forgot")}
            className="text-[13px] font-medium text-primary"
          >
            Forgot Password?
          </button>
        )}

        {error && (
          <p className="rounded-2xl bg-block-surface px-4 py-3 text-[13px] text-destructive">
            {error}
          </p>
        )}
        {info && (
          <p className="rounded-2xl bg-accent px-4 py-3 text-[13px] text-accent-foreground">{info}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="h-[56px] w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground transition-opacity active:opacity-90 disabled:opacity-60"
        >
          {busy
            ? "Please wait…"
            : mode === "signup"
              ? "Sign Up"
              : mode === "forgot"
                ? "Send Reset Link"
                : "Login"}
        </button>
      </form>

      <div className="mt-6 text-center text-[13px] text-muted-foreground">
        {mode === "login" ? (
          <>
            Don't have an account?{" "}
            <button type="button" onClick={() => switchMode("signup")} className="font-semibold text-primary">
              Sign Up
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button type="button" onClick={() => switchMode("login")} className="font-semibold text-primary">
              Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
