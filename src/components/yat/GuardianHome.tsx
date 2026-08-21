import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { GuardianDevices } from "./GuardianDevices";
import { GuardianPair } from "./GuardianPair";
import { GuardianActivity } from "./GuardianActivity";
import { GuardianApps } from "./GuardianApps";
import { GuardianRules } from "./GuardianRules";
import { GuardianNotifications } from "./GuardianNotifications";
import { GuardianRewards } from "./GuardianRewards";
import { GuardianSubscription } from "./GuardianSubscription";
import { DeviceSelector } from "./DeviceSelector";
import { PhonePopup, type PhonePopupTone } from "@/components/phone/PhonePopup";
import {
  fetchDevices,
  fetchGuardianNotifications,
  fetchSubscription,
  guardianEnforce,
  isPremiumActive,
  type NotificationRow,
  type DeviceRow,
  type SubscriptionRow,
} from "@/lib/yatApi";

const NAV = [
  { id: "home", label: "Home" },
  { id: "activity", label: "Activity" },
  { id: "pair", label: "Pair" },
  { id: "apps", label: "Apps" },
  { id: "rules", label: "Rules" },
];

type Overlay = "notifications" | "rewards" | "subscription" | null;

export function GuardianHome({ onHome }: { onHome: () => void }) {
  const { user, signOut } = useAuth();
  const [fullName, setFullName] = useState("");
  const [tab, setTab] = useState("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [unread, setUnread] = useState(0);
  // In-app realtime popup (never the OS Notifications API).
  const [popup, setPopup] = useState<{
    id: string;
    title: string;
    message: string;
    tone: PhonePopupTone;
  } | null>(null);
  const seenPopups = useRef<Set<string>>(new Set());

  const guardianId = user?.id ?? null;
  const premium = isPremiumActive(subscription);

  useEffect(() => {
    let active = true;
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("[guardian] profile load", error);
        if (active && data?.full_name) setFullName(data.full_name);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const loadDevices = useCallback(async () => {
    if (!guardianId) return;
    try {
      const list = await fetchDevices(guardianId);
      setDevices(list);
      setSelectedId((current) =>
        current && list.some((d) => d.id === current) ? current : (list[0]?.id ?? null),
      );
    } catch (e) {
      console.error("[guardian] devices load", e);
    }
  }, [guardianId]);

  const loadUnread = useCallback(async () => {
    if (!guardianId) return;
    try {
      const items = await fetchGuardianNotifications(guardianId);
      setUnread(items.filter((n) => !n.is_read).length);
    } catch (e) {
      console.error("[guardian] notifications load", e);
    }
  }, [guardianId]);

  useEffect(() => {
    if (!guardianId) return;
    void loadDevices();
    void loadUnread();
    void fetchSubscription(guardianId).then(setSubscription).catch(console.error);

    const channel = supabase
      .channel(`guardian-${guardianId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "devices",
          filter: `guardian_id=eq.${guardianId}`,
        },
        () => void loadDevices(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `guardian_id=eq.${guardianId}`,
        },
        (payload) => {
          void loadUnread();
          const row = payload.new as NotificationRow | undefined;
          if (payload.eventType !== "INSERT" || !row) return;
          if (row.recipient_type !== "guardian") return;
          if (seenPopups.current.has(row.id)) return;
          seenPopups.current.add(row.id);
          const tone: PhonePopupTone = row.notification_type.startsWith("time_limit_warning")
            ? "warn"
            : row.notification_type === "risk" ||
                row.notification_type === "rule_fail" ||
                row.notification_type === "time_limit_block"
              ? "danger"
              : "info";
          setPopup({ id: row.id, title: row.title, message: row.message, tone });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [guardianId, loadDevices, loadUnread]);

  useEffect(() => {
    if (!popup) return;
    const id = window.setTimeout(() => setPopup(null), 6000);
    return () => window.clearTimeout(id);
  }, [popup]);

  // Backend-reliable enforcement: even with the controlled tab closed, the
  // guardian client ticks the idempotent RPC so grace periods still expire.
  useEffect(() => {
    if (devices.length === 0) return;
    const run = () => devices.forEach((d) => void guardianEnforce(d.id));
    run();
    const id = window.setInterval(run, 3000);
    return () => window.clearInterval(id);
  }, [devices]);

  const initial = (fullName || user?.email || "G").charAt(0).toUpperCase();
  const selectedDevice = devices.find((d) => d.id === selectedId) ?? null;
  const needsDevice = (
    <p className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center text-[13px] text-muted-foreground">
      Pair a controlled device first to use this screen.
    </p>
  );

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {popup && (
        <PhonePopup
          tone={popup.tone}
          title={popup.title}
          message={popup.message}
          onDismiss={() => setPopup(null)}
        />
      )}
      <header className="flex shrink-0 items-center justify-between gap-3 px-6 pb-4 pt-3">
        <h1 className="min-w-0 truncate text-[24px] font-bold tracking-tight text-foreground">
          {(fullName || user?.email?.split("@")[0] || "Guardian") + " !"}
        </h1>
        <div className="flex items-center gap-3 text-muted-foreground">
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => setOverlay(overlay === "notifications" ? null : "notifications")}
            className="relative text-lg"
          >
            🔔
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                {unread}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground"
          >
            {initial}
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="mx-5 mb-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-[15px] font-semibold text-card-foreground">{fullName || "Guardian"}</p>
          <p className="text-[13px] text-muted-foreground">{user?.email}</p>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setOverlay("subscription");
            }}
            className="mt-3 h-11 w-full rounded-xl border border-border text-[14px] font-semibold text-primary"
          >
            Subscription{premium ? " · Premium" : ""}
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setOverlay("rewards");
            }}
            className="mt-2 h-11 w-full rounded-xl border border-border text-[14px] font-semibold text-primary"
          >
            🎁 Rewards
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-2 h-11 w-full rounded-xl border border-border text-[14px] font-semibold text-destructive"
          >
            Logout
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {overlay === "notifications" && guardianId && (
          <GuardianNotifications guardianId={guardianId} onClose={() => setOverlay(null)} />
        )}

        {overlay === "rewards" &&
          (selectedDevice ? (
            <GuardianRewards
              deviceId={selectedDevice.id}
              deviceName={selectedDevice.device_name}
              onClose={() => setOverlay(null)}
            />
          ) : (
            needsDevice
          ))}

        {overlay === "subscription" && guardianId && (
          <GuardianSubscription
            guardianId={guardianId}
            subscription={subscription}
            onChanged={setSubscription}
            onClose={() => setOverlay(null)}
          />
        )}

        {overlay === null && (
          <>
            {tab !== "home" && tab !== "pair" && devices.length > 0 && (
              <div className="mb-3">
                <DeviceSelector
                  devices={devices}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </div>
            )}

            {tab === "home" && guardianId && (
              <GuardianDevices
                guardianId={guardianId}
                onPair={() => setTab("pair")}
                onViewActivity={(id) => {
                  setSelectedId(id);
                  setOverlay(null);
                  setTab("activity");
                }}
              />
            )}

            {tab === "pair" && guardianId && (
              <GuardianPair
                guardianId={guardianId}
                onPaired={() => {
                  setTab("home");
                  void loadDevices();
                }}
                blocked={!premium && devices.length >= 1}
                onUpgrade={() => setOverlay("subscription")}
              />
            )}

            {tab === "activity" &&
              (selectedDevice ? <GuardianActivity deviceId={selectedDevice.id} /> : needsDevice)}

            {tab === "apps" &&
              (selectedDevice && guardianId ? (
                <GuardianApps
                  guardianId={guardianId}
                  deviceId={selectedDevice.id}
                  deviceName={selectedDevice.device_name}
                  premium={premium}
                  onUpgrade={() => setOverlay("subscription")}
                />
              ) : (
                needsDevice
              ))}

            {tab === "rules" &&
              (selectedDevice && guardianId ? (
                <GuardianRules
                  guardianId={guardianId}
                  deviceId={selectedDevice.id}
                  premium={premium}
                  onUpgrade={() => setOverlay("subscription")}
                />
              ) : (
                needsDevice
              ))}
          </>
        )}

        <button
          type="button"
          onClick={onHome}
          className="mt-6 w-full text-center text-[13px] font-medium text-muted-foreground"
        >
          Close Yat Lite
        </button>
      </div>

      <nav className="shrink-0 px-4 pb-3 pt-1">
        <div className="flex items-end justify-between rounded-[28px] bg-secondary px-3 py-2 shadow-[0_10px_30px_-20px_hsl(var(--foreground)/0.6)]">
          {NAV.map((item) =>
            item.id === "pair" ? (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setOverlay(null);
                  setTab(item.id);
                }}
                className="-mt-5 flex flex-col items-center gap-1"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground shadow-[0_10px_20px_-10px_hsl(var(--primary))]">
                  +
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">Pair</span>
              </button>
            ) : (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setOverlay(null);
                  setTab(item.id);
                }}
                className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-1.5 ${
                  tab === item.id ? "bg-card" : ""
                }`}
              >
                <span className={tab === item.id ? "text-primary" : "text-muted-foreground"}>
                  {item.glyph}
                </span>
                <span
                  className={`text-[11px] font-medium ${tab === item.id ? "text-primary" : "text-muted-foreground"}`}
                >
                  {item.label}
                </span>
              </button>
            ),
          )}
        </div>
      </nav>
    </div>
  );
}
