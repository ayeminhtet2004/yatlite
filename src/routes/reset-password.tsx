import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { PhoneShell } from "@/components/phone/PhoneShell";
import { supabase } from "@/integrations/supabase/client";

const TITLE = "Reset Password — Yat Lite";
const DESCRIPTION = "Set a new password for your Yat Lite Guardian account.";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    try {
      setBusy(true);
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
    } catch (caught) {
      console.error("[reset-password]", caught);
      setError(caught instanceof Error ? caught.message : "Could not update password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PhoneShell
      onBack={() => window.history.back()}
      onHome={() => {
        window.location.href = "/";
      }}
      onRecents={() => {
        window.location.href = "/";
      }}
    >
      <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-8 pt-6">
        <h1 className="text-[24px] font-semibold tracking-tight text-foreground">New Password</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Choose a new password for your Guardian account.
        </p>

        {done ? (
          <div className="mt-8">
            <p className="rounded-2xl bg-accent px-4 py-3 text-[13px] text-accent-foreground">
              Password updated. You can return to Yat Lite.
            </p>
            <button
              type="button"
              onClick={() => router.navigate({ to: "/" })}
              className="mt-4 h-[56px] w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground"
            >
              Return Home
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="New password"
              autoComplete="new-password"
              className="h-[54px] w-full rounded-2xl border border-input bg-card px-4 text-[15px] outline-none focus:border-primary"
            />
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              className="h-[54px] w-full rounded-2xl border border-input bg-card px-4 text-[15px] outline-none focus:border-primary"
            />
            {error && (
              <p className="rounded-2xl bg-block-surface px-4 py-3 text-[13px] text-destructive">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="h-[56px] w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Updating…" : "Update Password"}
            </button>
          </form>
        )}
      </div>
    </PhoneShell>
  );
}
