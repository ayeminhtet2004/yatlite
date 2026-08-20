import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  cancelPairingCode,
  createPairingCode,
  fetchPairingCode,
  formatCode,
  qrPayload,
  type PairingCodeRow,
  type RequestedPermissions,
} from "@/lib/yatApi";
import { QrBlock } from "./QrBlock";

type Step = "form" | "permissions" | "waiting" | "success";

const PERMISSION_ITEMS: {
  key: keyof RequestedPermissions | "risk";
  title: string;
  hint: string;
}[] = [
  { key: "risk", title: "Risky Apps & Websites", hint: "Required" },
  { key: "recentApps", title: "Recent App Activity", hint: "See which apps were opened" },
  { key: "visitedWebsites", title: "Visited Websites", hint: "See browsing history" },
  { key: "installedApps", title: "Installed Apps", hint: "Needed for app blocking" },
];

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`h-7 w-12 shrink-0 rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-muted"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <span
        className={`block h-6 w-6 rounded-full bg-card shadow transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

export function GuardianPair({
  guardianId,
  onPaired,
  blocked = false,
  onUpgrade,
}: {
  guardianId: string;
  onPaired: () => void;
  /** A second controlled device requires Premium. */
  blocked?: boolean;
  onUpgrade?: () => void;
}) {
  const [step, setStep] = useState<Step>("form");
  const [deviceName, setDeviceName] = useState("");
  const [perms, setPerms] = useState<RequestedPermissions>({
    recentApps: true,
    visitedWebsites: false,
    installedApps: false,
  });
  const [pairing, setPairing] = useState<PairingCodeRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pairedRef = useRef(false);

  // Realtime + polling fallback while waiting for the controlled device.
  useEffect(() => {
    if (step !== "waiting" || !pairing) return;
    pairedRef.current = false;

    const markPaired = (row: PairingCodeRow) => {
      if (row.status === "paired" && !pairedRef.current) {
        pairedRef.current = true;
        setPairing(row);
        setStep("success");
      }
    };

    const channel = supabase
      .channel(`pairing-${pairing.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pairing_codes",
          filter: `id=eq.${pairing.id}`,
        },
        (payload) => markPaired(payload.new as PairingCodeRow),
      )
      .subscribe();

    const poll = window.setInterval(async () => {
      const row = await fetchPairingCode(pairing.id);
      if (row) markPaired(row);
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(poll);
    };
  }, [step, pairing]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const row = await createPairingCode(guardianId, deviceName.trim(), perms);
      setPairing(row);
      setStep("waiting");
    } catch (e) {
      console.error("[pair] generate failed", e);
      setError("Could not generate a pairing code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPairing(null);
    setDeviceName("");
    setStep("form");
    setCopied(false);
  }

  if (blocked) {
    return (
      <div className="rounded-2xl border border-border bg-card px-5 py-8 text-center">
        <p className="text-[15px] font-semibold text-card-foreground">Premium required</p>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Your first controlled device is free. Adding more devices needs Yat Lite Premium.
        </p>
        <button
          type="button"
          onClick={() => onUpgrade?.()}
          className="mt-5 h-12 w-full rounded-2xl bg-primary text-[14px] font-semibold text-primary-foreground"
        >
          See Premium
        </button>
      </div>
    );
  }

  if (step === "success" && pairing) {
    return (
      <div className="flex flex-col items-center px-2 py-10 text-center">
        <div className="flex h-20 w-20 animate-[pulse_1.2s_ease-in-out_2] items-center justify-center rounded-full bg-primary text-3xl text-primary-foreground">
          ✓
        </div>
        <h2 className="mt-5 text-[20px] font-semibold text-foreground">Paired Successfully!</h2>
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          {pairing.device_name} is now connected to Yat Lite.
        </p>
        <button
          type="button"
          onClick={() => {
            reset();
            onPaired();
          }}
          className="mt-8 h-14 w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground"
        >
          Continue
        </button>
      </div>
    );
  }

  if (step === "waiting" && pairing) {
    return (
      <div className="flex flex-col items-center px-1 py-4 text-center">
        <h2 className="text-[20px] font-semibold text-foreground">Pair Controlled Device</h2>
        <p className="mt-1 text-[13px] uppercase tracking-wide text-muted-foreground">
          Controlled Device
        </p>
        <p className="text-[16px] font-semibold text-foreground">{pairing.device_name}</p>

        <div className="mt-5 rounded-2xl border border-border bg-card p-2">
          <QrBlock payload={qrPayload(pairing.code)} />
        </div>

        <p className="mt-5 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
          Pairing Code
        </p>
        <p className="mt-1 text-[32px] font-bold tracking-[0.18em] text-foreground">
          {formatCode(pairing.code)}
        </p>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(pairing.code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
          className="mt-2 h-10 rounded-xl border border-border px-5 text-[13px] font-semibold text-primary"
        >
          {copied ? "Copied" : "Copy"}
        </button>

        <div className="mt-6 flex items-center gap-2 text-[13px] text-muted-foreground">
          <span className="h-2 w-2 animate-ping rounded-full bg-primary" />
          Waiting for controlled device to connect...
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">Code expires in 10 minutes.</p>

        <button
          type="button"
          onClick={async () => {
            await cancelPairingCode(pairing.id);
            reset();
          }}
          className="mt-6 text-[13px] font-medium text-muted-foreground"
        >
          Cancel pairing
        </button>
      </div>
    );
  }

  return (
    <div className="py-2">
      <h2 className="text-[20px] font-semibold text-foreground">Pair Controlled Device</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Give the device a name, then choose what you want to monitor.
      </p>

      <label className="mt-6 block text-[13px] font-medium text-foreground" htmlFor="device-name">
        Controlled Device Name
      </label>
      <input
        id="device-name"
        value={deviceName}
        onChange={(e) => setDeviceName(e.target.value)}
        placeholder="Mark"
        className="mt-1.5 h-14 w-full rounded-2xl border border-border bg-card px-4 text-[15px] text-foreground outline-none focus:border-primary"
      />

      {error && <p className="mt-3 text-[13px] text-destructive">{error}</p>}

      <button
        type="button"
        disabled={!deviceName.trim()}
        onClick={() => setStep("permissions")}
        className="mt-6 h-14 w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
      >
        Generate Code
      </button>

      {step === "permissions" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 px-2 pb-2">
          <div className="w-full max-w-[404px] rounded-3xl bg-card p-5">
            <h3 className="text-[17px] font-semibold text-card-foreground">
              Monitoring Permissions
            </h3>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Choose what Yat Lite may monitor on {deviceName.trim()}.
            </p>

            <div className="mt-4 space-y-3">
              {PERMISSION_ITEMS.map((item) => {
                const required = item.key === "risk";
                const value = required
                  ? true
                  : perms[item.key as keyof RequestedPermissions];
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3"
                  >
                    <div>
                      <p className="text-[14px] font-semibold text-card-foreground">{item.title}</p>
                      <p className="text-[12px] text-muted-foreground">{item.hint}</p>
                    </div>
                    <Toggle
                      label={item.title}
                      checked={value}
                      disabled={required}
                      onChange={(next) =>
                        setPerms((prev) => ({
                          ...prev,
                          [item.key as keyof RequestedPermissions]: next,
                        }))
                      }
                    />
                  </div>
                );
              })}
            </div>

            {!perms.installedApps && (
              <p className="mt-3 rounded-xl bg-secondary px-3 py-2 text-[12px] text-muted-foreground">
                App Blocking requires Installed Apps monitoring.
              </p>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() => void generate()}
              className="mt-5 h-14 w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Generating…" : "Generate"}
            </button>
            <button
              type="button"
              onClick={() => setStep("form")}
              className="mt-2 h-11 w-full text-[13px] font-medium text-muted-foreground"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
