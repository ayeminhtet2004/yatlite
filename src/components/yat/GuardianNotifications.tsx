import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchGuardianNotifications,
  markGuardianNotificationRead,
  type NotificationRow,
} from "@/lib/yatApi";

export function GuardianNotifications({
  guardianId,
  onClose,
}: {
  guardianId: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await fetchGuardianNotifications(guardianId));
    } catch (e) {
      console.error("[notifications] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [guardianId]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`notifications-${guardianId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `guardian_id=eq.${guardianId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [guardianId, load]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-semibold text-foreground">Notifications</h2>
        <button type="button" onClick={onClose} className="text-[13px] font-medium text-primary">
          Close
        </button>
      </div>

      <button
        type="button"
        disabled={busy || items.every((n) => n.is_read)}
        onClick={async () => {
          setBusy(true);
          try {
            await markGuardianNotificationRead(guardianId);
            await load();
          } finally {
            setBusy(false);
          }
        }}
        className="mt-3 h-10 w-full rounded-2xl border border-border text-[13px] font-semibold text-primary disabled:opacity-50"
      >
        {busy ? "Updating…" : "Mark All Read"}
      </button>

      <div className="mt-3 space-y-2">
        {loading && <p className="py-6 text-center text-[13px] text-muted-foreground">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            No notifications yet.
          </p>
        )}
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={async () => {
              if (item.is_read) return;
              await markGuardianNotificationRead(guardianId, item.id);
              void load();
            }}
            className={`block w-full rounded-2xl border px-4 py-3 text-left ${
              item.is_read ? "border-border bg-card" : "border-primary/30 bg-primary/5"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-semibold text-card-foreground">{item.title}</p>
              {!item.is_read && <span className="h-2 w-2 rounded-full bg-primary" />}
            </div>
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
