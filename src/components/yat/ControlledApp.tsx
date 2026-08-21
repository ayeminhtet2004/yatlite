import { useState } from "react";
import { normalizeCode } from "@/lib/yatApi";
import { useControlled } from "@/hooks/useControlled";

export function ControlledApp({
  onHome,
  onChangeRole,
  /** Presentational: this screen also offers the Guardian entry point. */
  combined = false,
  onGuardian,
  onPairSuccess,
}: {
  onHome: () => void;
  onChangeRole: () => void;
  combined?: boolean;
  onGuardian?: () => void;
  onPairSuccess?: () => void;
}) {
  const ctl = useControlled();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justPaired, setJustPaired] = useState(false);
  const [settingsPane, setSettingsPane] = useState<null | "usage" | "accessibility">(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [granting, setGranting] = useState(false);

  const state = ctl.state;
  const perms = state?.permissions ?? null;
  const usage = Boolean(perms?.usage_access_enabled);
  const accessibility = Boolean(perms?.accessibility_enabled);
  const notifications = state?.notifications ?? [];
  const unread = notifications.filter((n) => !n.is_read).length;

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await ctl.pair(code);
      setJustPaired(true);
      onPairSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pairing failed.");
    } finally {
      setBusy(false);
    }
  }

  async function grant(kind: "usage" | "accessibility") {
    if (granting) return;
    setGranting(true);
    try {
      await ctl.grantPermissions(
        kind === "usage" ? true : usage,
        kind === "accessibility" ? true : accessibility,
      );
      setSettingsPane(null);
    } catch (e) {
      console.error("[controlled] grant failed", e);
    } finally {
      setGranting(false);
    }
  }

  /* ------------------------------------------------------------ screens */

  if (!ctl.ready) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Restoring device…</p>
      </div>
    );
  }

  if (ctl.paired && state && justPaired) {
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
          onClick={() => setJustPaired(false)}
          className="mt-8 h-14 w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground"
        >
          Continue
        </button>
      </div>
    );
  }

  if (ctl.paired && state && !(usage && accessibility)) {
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
                disabled={granting}
                onClick={() => void grant(settingsPane)}
                className="mt-4 h-12 w-full rounded-2xl bg-primary text-[14px] font-semibold text-primary-foreground disabled:opacity-60"
              >
                {granting ? "Applying…" : isUsage ? "Allow" : "Turn on"}
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
      </div>
    );
  }

  if (ctl.paired && state) {
    if (showNotifications) {
      return (
        <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-8 pt-4">
          <div className="flex items-center justify-between">
            <h1 className="text-[20px] font-semibold text-foreground">Notifications</h1>
            <button
              type="button"
              onClick={() => setShowNotifications(false)}
              className="text-[13px] font-medium text-primary"
            >
              Close
            </button>
          </div>
          <button
            type="button"
            disabled={unread === 0}
            onClick={() => void ctl.markRead()}
            className="mt-3 h-10 w-full rounded-2xl border border-border text-[13px] font-semibold text-primary disabled:opacity-50"
          >
            Mark All Read
          </button>
          <div className="mt-3 space-y-2">
            {notifications.length === 0 && (
              <p className="py-8 text-center text-[13px] text-muted-foreground">
                No notifications yet.
              </p>
            )}
            {notifications.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => !item.is_read && void ctl.markRead(item.id)}
                className={`block w-full rounded-2xl border px-4 py-3 text-left ${
                  item.is_read ? "border-border bg-card" : "border-primary/30 bg-primary/5"
                }`}
              >
                <p className="text-[14px] font-semibold text-card-foreground">{item.title}</p>
                <p className="text-[12px] text-muted-foreground">{item.message}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {new Date(item.created_at).toLocaleString()}
                </p>
              </button>
            ))}
          </div>
        </div>
      );
    }

    const rules = state.rules ?? [];
    const activeGoals = rules.filter((r) => r.status === "pending");

    return (
      <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-8 pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
              Controlled Device
            </p>
            <h1 className="text-[22px] font-semibold text-foreground">
              {state.device.device_name}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Connected · monitoring active
            </p>
          </div>
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => setShowNotifications(true)}
            className="relative text-lg"
          >
            🔔
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                {unread}
              </span>
            )}
          </button>
        </div>

        <div className="mt-5 rounded-2xl bg-primary px-4 py-4 text-primary-foreground">
          <p className="text-[12px] opacity-80">Total Points</p>
          <p className="text-[30px] font-semibold">{state.points ?? 0}</p>
        </div>

        <div className="mt-5">
          <p className="text-[14px] font-semibold text-foreground">Active Goals</p>
          <div className="mt-2 space-y-2">
            {rules.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-5 text-center text-[13px] text-muted-foreground">
                No goals from your Guardian yet.
              </p>
            )}
            {rules.map((rule) => (
              <div key={rule.id} className="rounded-2xl border border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-semibold text-card-foreground">{rule.app_name}</p>
                  <span
                    className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold capitalize ${
                      rule.status === "success"
                        ? "bg-primary/10 text-primary"
                        : rule.status === "fail"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {rule.status}
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  {rule.rule_type === "schedule"
                    ? `Time limit ${rule.duration_minutes ?? 0} min · used ${Math.floor(
                        rule.accumulated_seconds / 60,
                      )} min`
                    : `Avoid until ${rule.end_date ?? "—"}`}
                </p>
                <p className="mt-1 text-[12px] font-semibold text-primary">
                  {rule.reward_points} points
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {activeGoals.length} goal{activeGoals.length === 1 ? "" : "s"} in progress
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-border bg-card p-4">
          <p className="text-[14px] font-semibold text-card-foreground">Privacy & Monitoring</p>
          <div className="mt-2 space-y-1.5 text-[13px]">
            {[
              { label: "Risky apps & websites", on: true },
              { label: "Recent app activity", on: Boolean(perms?.recent_apps) },
              { label: "Visited websites", on: Boolean(perms?.visited_websites) },
              { label: "Installed apps", on: Boolean(perms?.installed_apps) },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-muted-foreground">{row.label}</span>
                <span className={row.on ? "font-semibold text-primary" : "text-muted-foreground"}>
                  {row.on ? "Shared" : "Private"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-border bg-card p-4">
          <p className="text-[14px] font-semibold text-card-foreground">Monitored apps</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {state.apps.map((app) => (
              <div key={app.id} className="rounded-xl bg-secondary px-3 py-2">
                <p className="text-[13px] font-medium text-foreground">{app.app_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {app.blocked ? "Blocked" : app.risk_level}
                </p>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            ctl.disconnect();
            onChangeRole();
          }}
          className="mt-6 h-14 w-full rounded-2xl border border-destructive text-[15px] font-semibold text-destructive"
        >
          Log out & switch role
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

      {ctl.disconnected && (
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
