import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { deleteDevice, fetchDevices, isOnline, type DeviceRow } from "@/lib/yatApi";

export function GuardianDevices({
  guardianId,
  onPair,
}: {
  guardianId: string;
  onPair: () => void;
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
    <div className="space-y-3">
      {devices.map((device) => {
        const online = isOnline(device);
        return (
          <div key={device.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-lg">
                  📱
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-card-foreground">
                    {device.device_name}
                  </p>
                  <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <span
                      className={`h-2 w-2 rounded-full ${online ? "bg-primary" : "bg-muted-foreground/50"}`}
                    />
                    {online ? "Online" : "Offline"} · {device.installed_apps_count} apps
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label={`Disconnect ${device.device_name}`}
                onClick={() => setConfirming(device)}
                className="rounded-xl border border-border px-3 py-2 text-[14px] text-destructive"
              >
                🗑
              </button>
            </div>
            <div className="mt-3 flex gap-2 text-[12px] text-muted-foreground">
              <span className="rounded-lg bg-secondary px-2 py-1">
                Battery {device.battery_level}%
              </span>
              <span className="rounded-lg bg-secondary px-2 py-1">
                {device.last_seen_at
                  ? `Last seen ${new Date(device.last_seen_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : "Never seen"}
              </span>
            </div>
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
