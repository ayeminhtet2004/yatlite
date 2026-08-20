import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchDeviceApps,
  fetchDevicePermissions,
  notify,
  pingDevice,
  setAppBlocked,
  type PermissionsRow,
  type VirtualAppRow,
} from "@/lib/yatApi";

export function GuardianApps({
  guardianId,
  deviceId,
  deviceName,
  premium,
  onUpgrade,
}: {
  guardianId: string;
  deviceId: string;
  deviceName: string;
  premium: boolean;
  onUpgrade: () => void;
}) {
  const [apps, setApps] = useState<VirtualAppRow[]>([]);
  const [perms, setPerms] = useState<PermissionsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, permissions] = await Promise.all([
        fetchDeviceApps(deviceId),
        fetchDevicePermissions(deviceId),
      ]);
      setApps(list);
      setPerms(permissions);
      setError(null);
    } catch (e) {
      console.error("[apps] load failed", e);
      setError("Could not load installed apps.");
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    setLoading(true);
    void load();
    const channel = supabase
      .channel(`apps-${deviceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blocked_apps", filter: `device_id=eq.${deviceId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId, load]);

  const monitoringOff = perms ? !perms.installed_apps : false;

  async function toggle(app: VirtualAppRow, next: boolean) {
    if (!premium) {
      onUpgrade();
      return;
    }
    if (busy) return;
    setBusy(app.id);
    setError(null);
    setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, blocked: next } : a)));
    try {
      await setAppBlocked(deviceId, app.id, next);
      await notify({
        guardianId,
        deviceId,
        recipient: "controlled",
        type: "block",
        title: next ? "App blocked" : "App unblocked",
        message: next
          ? `${app.app_name} was blocked by your Guardian.`
          : `${app.app_name} is available again.`,
      });
      void pingDevice(deviceId);
    } catch (e) {
      console.error("[apps] toggle failed", e);
      setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, blocked: !next } : a)));
      setError("Could not update this app. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <p className="py-8 text-center text-[13px] text-muted-foreground">Loading apps…</p>;
  }

  return (
    <div>
      <h2 className="text-[16px] font-semibold text-foreground">All Installed Apps</h2>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{deviceName}</p>

      {monitoringOff && (
        <p className="mt-3 rounded-2xl bg-secondary px-4 py-3 text-[13px] text-muted-foreground">
          Installed Apps monitoring was not enabled for this device.
        </p>
      )}

      {error && <p className="mt-3 text-[13px] text-destructive">{error}</p>}

      <div className="mt-4 space-y-2">
        {apps.map((app) => (
          <div
            key={app.id}
            className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-[15px] font-semibold text-foreground">
                {app.app_name.charAt(0)}
              </span>
              <div>
                <p className="text-[14px] font-semibold text-card-foreground">{app.app_name}</p>
                <p className="text-[11px] text-muted-foreground">{app.risk_level} risk</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(app.blocked)}
              aria-label={`Block ${app.app_name}`}
              disabled={monitoringOff || busy === app.id}
              onClick={() => void toggle(app, !app.blocked)}
              className={`h-7 w-12 shrink-0 rounded-full transition-colors ${
                app.blocked ? "bg-destructive" : "bg-muted"
              } ${monitoringOff || busy === app.id ? "opacity-60" : ""}`}
            >
              <span
                className={`block h-6 w-6 rounded-full bg-card shadow transition-transform ${
                  app.blocked ? "translate-x-[22px]" : "translate-x-[2px]"
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
