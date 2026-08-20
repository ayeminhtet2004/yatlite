import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchPointTransactions, type PointTransactionRow } from "@/lib/yatApi";

export function GuardianRewards({
  deviceId,
  deviceName,
  onClose,
}: {
  deviceId: string;
  deviceName: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<PointTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setItems(await fetchPointTransactions(deviceId));
    } catch (e) {
      console.error("[rewards] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`points-${deviceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "point_transactions",
          filter: `device_id=eq.${deviceId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId, load]);

  const total = items.reduce((sum, item) => sum + item.points, 0);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-semibold text-foreground">Reward History</h2>
        <button type="button" onClick={onClose} className="text-[13px] font-medium text-primary">
          Close
        </button>
      </div>

      <div className="mt-3 rounded-2xl bg-primary px-4 py-4 text-primary-foreground">
        <p className="text-[12px] opacity-80">{deviceName} · Total Points</p>
        <p className="text-[28px] font-semibold">{total}</p>
      </div>

      <div className="mt-3 space-y-2">
        {loading && <p className="py-6 text-center text-[13px] text-muted-foreground">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            No rewards earned yet.
          </p>
        )}
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-border bg-card px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-semibold text-card-foreground">
                {item.description ?? item.source}
              </p>
              <span className="text-[14px] font-semibold text-primary">+{item.points}</span>
            </div>
            <p className="text-[11px] capitalize text-muted-foreground">
              {item.source} · {new Date(item.created_at).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
