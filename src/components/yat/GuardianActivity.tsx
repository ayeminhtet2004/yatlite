import { AppIcon } from "@/components/yat/AppIcon";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  dayRange,
  fetchActivity,
  fetchDevicePermissions,
  fetchRiskEvents,
  fetchWebHistory,
  formatDuration,
  type ActivitySessionRow,
  type PermissionsRow,
  type RiskEventRow,
  type WebHistoryRow,
} from "@/lib/yatApi";

type Tab = "risk" | "apps" | "web";
type DateKind = "today" | "yesterday" | "custom";

const TABS: { id: Tab; label: string }[] = [
  { id: "risk", label: "Risk Activity" },
  { id: "apps", label: "Recent App" },
  { id: "web", label: "Web History" },
];

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function GuardianActivity({ deviceId }: { deviceId: string }) {
  const [tab, setTab] = useState<Tab>("apps");
  const [dateKind, setDateKind] = useState<DateKind>("today");
  const [customDate, setCustomDate] = useState("");
  const [search, setSearch] = useState("");
  const [sessions, setSessions] = useState<ActivitySessionRow[]>([]);
  const [web, setWeb] = useState<WebHistoryRow[]>([]);
  const [risks, setRisks] = useState<RiskEventRow[]>([]);
  const [perms, setPerms] = useState<PermissionsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const range = useMemo(() => dayRange(dateKind, customDate), [dateKind, customDate]);

  const load = useCallback(async () => {
    try {
      const [a, w, r, p] = await Promise.all([
        fetchActivity(deviceId, range.start, range.end),
        fetchWebHistory(deviceId, range.start, range.end),
        fetchRiskEvents(deviceId, range.start, range.end),
        fetchDevicePermissions(deviceId),
      ]);
      setSessions(a);
      setWeb(w);
      setRisks(r);
      setPerms(p);
      setError(null);
    } catch (e) {
      console.error("[activity] load failed", e);
      setError("Could not load activity.");
    } finally {
      setLoading(false);
    }
  }, [deviceId, range.start, range.end]);

  useEffect(() => {
    setLoading(true);
    void load();
    const channel = supabase
      .channel(`activity-${deviceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "activity_sessions",
          filter: `device_id=eq.${deviceId}`,
        },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "web_history", filter: `device_id=eq.${deviceId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "risk_events", filter: `device_id=eq.${deviceId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId, load]);

  // Live tick for active sessions (client-side elapsed, no DB writes).
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const q = search.trim().toLowerCase();
  const visibleSessions = sessions.filter((s) =>
    q ? (s.virtual_apps?.app_name ?? "").toLowerCase().includes(q) : true,
  );
  const visibleWeb = web.filter((w) =>
    q
      ? `${w.title ?? ""} ${w.domain ?? ""} ${w.url}`.toLowerCase().includes(q)
      : true,
  );
  const visibleRisks = risks.filter((r) =>
    q
      ? `${r.title ?? ""} ${r.description ?? ""} ${r.virtual_apps?.app_name ?? ""}`
          .toLowerCase()
          .includes(q)
      : true,
  );

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search activity"
        className="h-11 w-full rounded-2xl border border-border bg-card px-4 text-[14px] text-foreground outline-none focus:border-primary"
      />

      <div className="mt-3 flex items-center gap-2">
        {(["today", "yesterday", "custom"] as DateKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setDateKind(kind)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold capitalize ${
              dateKind === kind
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {kind}
          </button>
        ))}
        {dateKind === "custom" && (
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="h-9 rounded-xl border border-border bg-card px-2 text-[12px] text-foreground"
          />
        )}
      </div>

      <div className="mt-3 flex rounded-2xl bg-secondary p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`flex-1 rounded-xl px-2 py-2 text-[12px] font-semibold ${
              tab === item.id ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-[13px] text-destructive">{error}</p>}

      <div className="mt-4 space-y-2">
        {loading && (
          <p className="py-8 text-center text-[13px] text-muted-foreground">Loading activity…</p>
        )}

        {!loading && tab === "apps" && !perms?.recent_apps && (
          <p className="rounded-2xl bg-secondary px-4 py-3 text-[13px] text-muted-foreground">
            Recent app monitoring was not enabled for this device.
          </p>
        )}

        {!loading &&
          tab === "apps" &&
          perms?.recent_apps &&
          (visibleSessions.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted-foreground">
              No app activity for this day yet.
            </p>
          ) : (
            visibleSessions.map((session) => {
              const active = session.status === "active";
              const seconds = active
                ? Math.max(0, (Date.now() - new Date(session.opened_at).getTime()) / 1000)
                : session.duration_seconds;
              return (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <AppIcon appName={session.virtual_apps?.app_name} />
                    <div>
                      <p className="text-[14px] font-semibold text-card-foreground">
                        {session.virtual_apps?.app_name ?? "App"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Opened {timeOf(session.opened_at)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-semibold text-foreground">
                      {formatDuration(seconds)}
                    </p>
                    {active && (
                      <p className="text-[11px] font-semibold text-primary">Active Now</p>
                    )}
                  </div>
                </div>
              );
            })
          ))}

        {!loading &&
          tab === "web" &&
          (!perms?.visited_websites ? (
            <p className="rounded-2xl bg-secondary px-4 py-3 text-[13px] text-muted-foreground">
              Visited websites monitoring was not enabled for this device.
            </p>
          ) : visibleWeb.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted-foreground">
              No websites visited for this day.
            </p>
          ) : (
            visibleWeb.map((row) => (
              <div key={row.id} className="rounded-2xl border border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-semibold text-card-foreground">
                    {row.title ?? row.domain}
                  </p>
                  {row.risk_level === "risky" && (
                    <span className="rounded-lg bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                      Risky
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-muted-foreground">
                  {row.domain} · {timeOf(row.visited_at)}
                </p>
              </div>
            ))
          ))}

        {!loading &&
          tab === "risk" &&
          (visibleRisks.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted-foreground">
              No risk activity for this day.
            </p>
          ) : (
            visibleRisks.map((row) => (
              <div key={row.id} className="rounded-2xl border border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-semibold text-card-foreground">
                    {row.title ?? row.virtual_apps?.app_name ?? "Risk event"}
                  </p>
                  <span className="rounded-lg bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                    {row.event_type === "risky_app" ? "App" : "Website"}
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground">{row.description}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{timeOf(row.created_at)}</p>
              </div>
            ))
          ))}
      </div>
    </div>
  );
}
