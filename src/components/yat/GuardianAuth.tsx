import { useState, type FormEvent } from "react";
import { UserRound } from "lucide-react";
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
        className="h-[60px] w-full rounded-[18px] border border-input bg-muted px-5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
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

  const heading =
    mode === "signup"
      ? "Create your Guardian account"
      : mode === "forgot"
        ? "Reset your Guardian password"
        : "Sign in as Guardian to continue";

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-card">
      {/* Blue hero */}
      <div className="bg-primary px-6 pb-12 pt-8 text-center">
        <div className="mx-auto grid h-[76px] w-[76px] place-items-center rounded-full bg-card">
          <UserRound className="h-9 w-9 text-primary" strokeWidth={1.75} />
        </div>
        <h1 className="mx-auto mt-5 max-w-[280px] text-[22px] font-bold leading-snug text-primary-foreground">
          {heading}
        </h1>
      </div>

      {/* White form sheet */}
      <div className="-mt-8 flex flex-1 flex-col rounded-t-[32px] bg-card px-6 pb-10 pt-7">
        <div className="grid grid-cols-2 rounded-[18px] border border-border bg-muted p-1">
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={`h-[46px] rounded-[14px] text-[15px] transition-colors ${
              mode !== "signup"
                ? "bg-card font-semibold text-primary shadow-sm"
                : "font-medium text-muted-foreground"
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={`h-[46px] rounded-[14px] text-[15px] transition-colors ${
              mode === "signup"
                ? "bg-card font-semibold text-primary shadow-sm"
                : "font-medium text-muted-foreground"
            }`}
          >
            Sign up
          </button>
        </div>

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
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => switchMode("forgot")}
                className="text-[13px] font-medium text-primary"
              >
                Forgot Password?
              </button>
            </div>
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
            className="h-[60px] w-full rounded-[18px] bg-primary text-[16px] font-bold text-primary-foreground shadow-[0_8px_20px_-8px_var(--primary)] transition-opacity active:opacity-90 disabled:opacity-60"
          >
            {busy
              ? "Please wait…"
              : mode === "signup"
                ? "Sign up"
                : mode === "forgot"
                  ? "Send Reset Link"
                  : "Log in"}
          </button>
        </form>

        <button
          type="button"
          onClick={onBack}
          className="mt-6 self-center text-[14px] font-semibold text-primary"
        >
          Back to Connect Device
        </button>
      </div>
    </div>
  );
}
