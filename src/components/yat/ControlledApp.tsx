import { useCallback, useEffect, useRef, useState } from "react";
import {
  deviceHeartbeat,
  normalizeCode,
  pairDevice,
  setDevicePermissions,
  type DeviceState,
} from "@/lib/yatApi";
import { clearDeviceToken, ensureDeviceToken, loadDeviceToken } from "@/lib/yat";

type Screen = "restoring" | "connect" | "success" | "permissions" | "dashboard";

const HEARTBEAT_MS = 15000;

export function ControlledApp({
  onHome,
  onChangeRole,
}: {
  onHome: () => void;
  onChangeRole: () => void;
}) {
  const [screen, setScreen] = useState<Screen>("restoring");
  const [state, setState] = useState<DeviceState | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsPane, setSettingsPane] = useState<null | "usage" | "accessibility">(null);
  const [disconnected, setDisconnected] = useState(false);
  const tokenRef = useRef<string | null>(null);

  const goToConnect = useCallback((wasDisconnected: boolean) => {
    clearDeviceToken();
    tokenRef.current = null;
    setState(null);
    setDisconnected(wasDisconnected);
    setScreen("connect");
  }, []);

  // Restore this browser's controlled identity from Supabase.
  useEffect(() => {
    const token = loadDeviceToken();
    tokenRef.current = token;
    if (!token) {
      setScreen("connect");
      return;
    }
    void (async () => {
      try {
        const next = await deviceHeartbeat(token);
        if (!next) {
          goToConnect(true);
          return;
        }
        setState(next);
        const perms = next.permissions;
        setScreen(
          perms?.usage_access_enabled && perms?.accessibility_enabled ? "dashboard" : "permissions",
        );
      } catch (e) {
        console.error("[controlled] restore failed", e);
        setScreen("connect");
      }
    })();
  }, [goToConnect]);

  // Heartbeat + disconnect detection while the device is active.
  useEffect(() => {
    if (screen !== "dashboard" && screen !== "permissions") return;
    const id = window.setInterval(async () => {
      const token = tokenRef.current;
      if (!token) return;
      try {
        const next = await deviceHeartbeat(token);
        if (!next) {
          goToConnect(true);
          return;
        }
        setState(next);
      } catch (e) {
        console.error("[controlled] heartbeat failed", e);
      }
    }, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [screen, goToConnect]);

  async function connect() {
    setBusy(true);
    setError(null);
    setDisconnected(false);
    try {
      const token = ensureDeviceToken();
      tokenRef.current = token;
      const next = await pairDevice(code, token);
      setState(next);
      setScreen("success");
    } catch (e) {
      clearDeviceToken();
      tokenRef.current = null;
      setError(e instanceof Error ? e.message : "Pairing failed.");
    } finally {
      setBusy(false);
    }
  }

  async function grant(kind: "usage" | "accessibility") {
    const token = tokenRef.current;
    if (!token) return;
    const perms = state?.permissions;
    const next = await setDevicePermissions(
      token,
      kind === "usage" ? true : Boolean(perms?.usage_access_enabled),
      kind === "accessibility" ? true : Boolean(perms?.accessibility_enabled),
    );
    if (next) setState(next);
    setSettingsPane(null);
  }

  /* ------------------------------------------------------------ screens */

  if (screen === "restoring") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Restoring device…</p>
      </div>
    );
  }

  if (screen === "success" && state) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="flex h-20 w-20 animate-[pulse_1.2s_ease-in-out_2] items-center justify-center rounded-full bg-primary text-3xl text-primary-foreground">
          ✓
        </div>
        <h1 className="mt-5 text-[22px] font-semibold text-foreground">Paired Successfully!</h1>
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          {state.device.device_name} is now connected to Yat Lite.
        </p>
        <button
          type="button"
          onClick={() => setScreen("permissions")}
          className="mt-8 h-14 w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground"
        >
          Continue
        </button>
      </div>
    );
  }

  if (screen === "permissions" && state) {
    const perms = state.permissions;
    const usage = Boolean(perms?.usage_access_enabled);
    const accessibility = Boolean(perms?.accessibility_enabled);
    const ready = usage && accessibility;

    if (settingsPane) {
      const isUsage = settingsPane === "usage";
      return (
        <div className="flex flex-1 flex-col bg-secondary">
          <div className="bg-card px-5 py-4">
            <p className="text-[12px] uppercase tracking-wide text-muted-foreground">Settings</p>
            <p className="text-[17px] font-semibold text-card-foreground">
              {isUsage ? "Usage access" : "Accessibility"}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="rounded-2xl bg-card p-4">
              <p className="text-[15px] font-semibold text-card-foreground">Yat Lite</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {isUsage
                  ? "Allow Yat Lite to see which apps are being used and for how long."
                  : "Allow the Yat Lite accessibility service to apply blocking rules."}
              </p>
              <button
                type="button"
                onClick={() => void grant(settingsPane)}
                className="mt-4 h-12 w-full rounded-2xl bg-primary text-[14px] font-semibold text-primary-foreground"
              >
                {isUsage ? "Allow" : "Turn on"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setSettingsPane(null)}
              className="mt-4 w-full text-center text-[13px] font-medium text-muted-foreground"
            >
              ← Back
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-8 pt-4">
        <h1 className="text-[22px] font-semibold text-foreground">Required Permissions</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Yat Lite needs these to monitor {state.device.device_name}.
        </p>

        <div className="mt-6 space-y-3">
          {[
            { label: "Usage Access", ok: usage },
            { label: "Accessibility Service", ok: accessibility },
          ].map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3"
            >
              <p className="text-[14px] font-semibold text-card-foreground">{row.label}</p>
              <span
                className={`text-[13px] font-semibold ${row.ok ? "text-primary" : "text-destructive"}`}
              >
                {row.ok ? "Allowed" : "Not Allowed"}
              </span>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={usage}
          onClick={() => setSettingsPane("usage")}
          className="mt-6 h-14 w-full rounded-2xl border border-border text-[15px] font-semibold text-primary disabled:opacity-50"
        >
          Allow Usage Access
        </button>
        <button
          type="button"
          disabled={accessibility}
          onClick={() => setSettingsPane("accessibility")}
          className="mt-3 h-14 w-full rounded-2xl border border-border text-[15px] font-semibold text-primary disabled:opacity-50"
        >
          Enable Yat Lite Accessibility
        </button>

        <button
          type="button"
          disabled={!ready}
          onClick={() => setScreen("dashboard")}
          className="mt-8 h-14 w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    );
  }

  if (screen === "dashboard" && state) {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-8 pt-4">
        <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
          Controlled Device
        </p>
        <h1 className="text-[22px] font-semibold text-foreground">{state.device.device_name}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-primary" />
          Connected · monitoring active
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-card p-4">
          <p className="text-[14px] font-semibold text-card-foreground">Monitored apps</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {state.apps.map((app) => (
              <div key={app.id} className="rounded-xl bg-secondary px-3 py-2">
                <p className="text-[13px] font-medium text-foreground">{app.app_name}</p>
                <p className="text-[11px] text-muted-foreground">{app.risk_level}</p>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            goToConnect(false);
            onChangeRole();
          }}
          className="mt-6 h-14 w-full rounded-2xl border border-destructive text-[15px] font-semibold text-destructive"
        >
          Log out & switch role
        </button>

        <button
          type="button"
          onClick={onHome}
          className="mt-3 w-full text-center text-[13px] font-medium text-muted-foreground"
        >
          Close Yat Lite
        </button>

      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-8 pt-4">
      <button
        type="button"
        onClick={onHome}
        className="mb-8 self-start text-[13px] font-medium text-muted-foreground"
      >
        ← Home
      </button>
      <h1 className="text-[24px] font-semibold tracking-tight text-foreground">Connect Device</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Enter the code shown on the Guardian's device.
      </p>

      {disconnected && (
        <p className="mt-4 rounded-xl bg-secondary px-3 py-2 text-[13px] text-muted-foreground">
          This device was disconnected by its Guardian. Pair again to reconnect.
        </p>
      )}

      <input
        value={code}
        onChange={(e) => setCode(normalizeCode(e.target.value).slice(0, 6))}
        placeholder="P3Y9X7"
        autoCapitalize="characters"
        className="mt-6 h-16 w-full rounded-2xl border border-border bg-card text-center text-[26px] font-bold tracking-[0.3em] text-foreground outline-none focus:border-primary"
      />

      <button
        type="button"
        onClick={() => setCode("")}
        className="mt-3 self-center text-[13px] font-medium text-primary"
      >
        Scan QR instead (enter code manually)
      </button>

      {error && <p className="mt-4 text-[13px] text-destructive">{error}</p>}

      <button
        type="button"
        disabled={code.length < 6 || busy}
        onClick={() => void connect()}
        className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
      >
        {busy && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
        )}
        {busy ? "Connecting…" : "Connect Device"}
      </button>

      <button
        type="button"
        onClick={onChangeRole}
        className="mt-6 text-center text-[13px] font-medium text-primary"
      >
        Change device role
      </button>
    </div>
  );
}
