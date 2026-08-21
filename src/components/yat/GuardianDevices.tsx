import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { deleteDevice, fetchDevices, isOnline, type DeviceRow } from "@/lib/yatApi";

export function GuardianDevices({
  guardianId,
  onPair,
  onViewActivity,
}: {
  guardianId: string;
  onPair: () => void;
  onViewActivity: (deviceId: string) => void;
}) {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<DeviceRow | null>(null);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      setDevices(await fetchDevices(guardianId));
    } catch (e) {
      console.error("[devices] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [guardianId]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`devices-${guardianId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "devices",
          filter: `guardian_id=eq.${guardianId}`,
        },
        () => void load(),
      )
      .subscribe();

    // Re-render for online/offline freshness + catch heartbeats.
    const timer = window.setInterval(() => {
      setTick((t) => t + 1);
      void load();
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(timer);
    };
  }, [guardianId, load]);

  if (loading) {
    return <p className="py-10 text-center text-[13px] text-muted-foreground">Loading devices…</p>;
  }

  if (devices.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center">
        <p className="text-[15px] font-semibold text-card-foreground">No devices connected yet.</p>
        <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
          Tap the + button to generate a pair code.
        </p>
        <button
          type="button"
          onClick={onPair}
          className="mt-5 h-12 w-full rounded-2xl bg-primary text-[14px] font-semibold text-primary-foreground"
        >
          Pair a device
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {devices.map((device) => {
        const online = isOnline(device);
        return (
          <div
            key={device.id}
            className="rounded-[26px] border border-border/70 bg-card p-5 shadow-[0_8px_24px_-18px_hsl(var(--foreground)/0.5)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <rect x="6" y="2.5" width="12" height="19" rx="3" />
                    <path d="M10.5 18.5h3" strokeLinecap="round" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-semibold text-card-foreground">
                    {device.device_name}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    Yat Lite Web Simulator
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    online
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${online ? "bg-primary" : "bg-muted-foreground/60"}`}
                  />
                  {online ? "Online" : "Offline"}
                </span>
                <button
                  type="button"
                  aria-label={`Disconnect ${device.device_name}`}
                  onClick={() => setConfirming(device)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-[14px] text-destructive"
                >
                  🗑
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <span className="text-[13px] font-medium text-card-foreground">
                🔋 {device.battery_level}%
              </span>
              <span className="shrink-0 text-[13px] text-muted-foreground">
                {device.installed_apps_count} apps
              </span>
            </div>

            <button
              type="button"
              onClick={() => onViewActivity(device.id)}
              className="mt-4 h-[52px] w-full rounded-2xl border border-primary bg-transparent text-[15px] font-semibold text-primary"
            >
              View Activity
            </button>
          </div>
        );
      })}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-6">
          <div className="w-full max-w-[340px] rounded-3xl bg-card p-5 text-center">
            <p className="text-[16px] font-semibold text-card-foreground">
              Disconnect {confirming.device_name}?
            </p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              This device will stop reporting to Yat Lite and must be paired again.
            </p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await deleteDevice(confirming.id);
                } catch (e) {
                  console.error("[devices] delete failed", e);
                }
                setConfirming(null);
                void load();
              }}
              className="mt-5 h-12 w-full rounded-2xl bg-destructive text-[14px] font-semibold text-destructive-foreground"
            >
              Disconnect
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
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
