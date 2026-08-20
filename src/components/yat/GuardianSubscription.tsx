import { useState } from "react";
import { activateSubscription, isPremiumActive, type SubscriptionRow } from "@/lib/yatApi";

const PLANS = [
  { id: "monthly" as const, label: "Monthly", price: "8,000 MMK / month" },
  { id: "yearly" as const, label: "Yearly", price: "75,000 MMK / year" },
];

const FEATURES = [
  "Blocking apps",
  "Multiple devices",
  "Daily schedule",
  "Restriction apps",
];

function remaining(expires: string) {
  const ms = new Date(expires).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} left`;
  return `${Math.max(1, Math.floor(ms / 3600000))} hours left`;
}

export function GuardianSubscription({
  guardianId,
  subscription,
  onChanged,
  onClose,
}: {
  guardianId: string;
  subscription: SubscriptionRow | null;
  onChanged: (next: SubscriptionRow) => void;
  onClose: () => void;
}) {
  const [plan, setPlan] = useState<"monthly" | "yearly">("monthly");
  const [payOpen, setPayOpen] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = isPremiumActive(subscription);

  async function pay() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await activateSubscription(guardianId, plan);
      onChanged(next);
      setPayOpen(false);
      setScreenshot(null);
    } catch (e) {
      console.error("[subscription] activation failed", e);
      setError("Payment could not be confirmed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-semibold text-foreground">Subscription</h2>
        <button type="button" onClick={onClose} className="text-[13px] font-medium text-primary">
          Close
        </button>
      </div>

      {active && subscription ? (
        <div className="mt-4 rounded-2xl border border-border bg-card p-5">
          <p className="text-[16px] font-semibold text-primary">Premium Active</p>
          <dl className="mt-3 space-y-2 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="font-semibold capitalize text-card-foreground">
                {subscription.plan}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Activated</dt>
              <dd className="text-card-foreground">
                {new Date(subscription.activated_at).toLocaleDateString()}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Expires</dt>
              <dd className="text-card-foreground">
                {new Date(subscription.expires_at).toLocaleDateString()}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Remaining</dt>
              <dd className="font-semibold text-card-foreground">
                {remaining(subscription.expires_at)}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-col items-center text-center">
            <span
              className="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold text-foreground"
              style={{ backgroundColor: "#FFC531" }}
              aria-hidden
            >
              Y
            </span>
            <p className="mt-3 text-[18px] font-semibold text-foreground">Yat Lite Premium</p>
          </div>

          <div className="mt-4 space-y-2">
            {PLANS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPlan(item.id)}
                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left ${
                  plan === item.id ? "border-primary bg-primary/5" : "border-border bg-card"
                }`}
              >
                <span className="text-[14px] font-semibold text-card-foreground">{item.label}</span>
                <span className="text-[13px] text-muted-foreground">{item.price}</span>
              </button>
            ))}
          </div>

          <ul className="mt-4 space-y-1.5">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-[13px] text-foreground">
                <span className="text-primary">✓</span>
                {feature}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setPayOpen(true)}
            className="mt-5 h-14 w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground"
          >
            Upgrade to Premium
          </button>
        </>
      )}

      {payOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 px-4 pb-6">
          <div className="max-h-[85%] w-full max-w-[380px] overflow-y-auto rounded-3xl bg-card p-5">
            <p className="text-[16px] font-semibold text-card-foreground">KBZPay</p>
            <p className="text-[13px] text-muted-foreground">
              {plan === "monthly" ? "8,000 MMK / month" : "75,000 MMK / year"}
            </p>

            <div className="mt-4 flex flex-col items-center rounded-2xl bg-secondary p-4">
              <div className="grid h-32 w-32 grid-cols-8 gap-[2px] bg-card p-1" aria-label="KBZPay QR">
                {Array.from({ length: 64 }).map((_, i) => (
                  <span
                    key={i}
                    className={(i * 7) % 3 === 0 ? "bg-foreground" : "bg-transparent"}
                  />
                ))}
              </div>
              <p className="mt-3 text-[13px] font-semibold text-foreground">
                Account Name: Yat Lite Myanmar
              </p>
              <p className="text-[13px] text-muted-foreground">Account Number: 09-7788-2211</p>
            </div>

            <label className="mt-4 block text-[13px] font-medium text-muted-foreground">
              Add Payment Screenshot
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setScreenshot(e.target.files?.[0]?.name ?? null)}
                className="mt-1 block w-full text-[12px] text-muted-foreground"
              />
            </label>
            {screenshot && (
              <p className="mt-1 text-[12px] text-primary">Attached: {screenshot}</p>
            )}

            {error && <p className="mt-3 text-[13px] text-destructive">{error}</p>}

            <button
              type="button"
              disabled={!screenshot || busy}
              onClick={() => void pay()}
              className="mt-4 h-14 w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Confirming…" : "Receipt Sent"}
            </button>
            <button
              type="button"
              onClick={() => setPayOpen(false)}
              className="mt-2 h-11 w-full text-[13px] font-medium text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
