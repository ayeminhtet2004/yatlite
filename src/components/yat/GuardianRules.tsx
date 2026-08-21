import { AppIcon } from "@/components/yat/AppIcon";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  createRule,
  deleteRule,
  fetchDeviceApps,
  fetchRules,
  notify,
  pingDevice,
  type RuleRow,
  type VirtualAppRow,
} from "@/lib/yatApi";

type Tab = "apps" | "active";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function describe(rule: RuleRow) {
  if (rule.rule_type === "schedule") {
    const used = Math.floor(rule.accumulated_seconds / 60);
    return `Time limit ${rule.duration_minutes ?? 0} min · used ${used} min`;
  }
  return `No use from ${rule.start_date ?? "—"} to ${rule.end_date ?? "—"}`;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-secondary text-muted-foreground",
  success: "bg-primary/10 text-primary",
  fail: "bg-destructive/10 text-destructive",
};

export function GuardianRules({
  guardianId,
  deviceId,
  premium,
  onUpgrade,
}: {
  guardianId: string;
  deviceId: string;
  premium: boolean;
  onUpgrade: () => void;
}) {
  const [tab, setTab] = useState<Tab>("apps");
  const [apps, setApps] = useState<VirtualAppRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<VirtualAppRow | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, ruleRows] = await Promise.all([fetchDeviceApps(deviceId), fetchRules(deviceId)]);
      setApps(list);
      setRules(ruleRows);
    } catch (e) {
      console.error("[rules] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    setLoading(true);
    void load();
    const channel = supabase
      .channel(`rules-${deviceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rules", filter: `device_id=eq.${deviceId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId, load]);

  if (editing) {
    return (
      <RuleForm
        app={editing}
        guardianId={guardianId}
        deviceId={deviceId}
        onCancel={() => setEditing(null)}
        onCreated={() => {
          setEditing(null);
          setTab("active");
          void load();
        }}
      />
    );
  }

  return (
    <div>
      <div className="flex rounded-2xl bg-secondary p-1">
        {(
          [
            { id: "apps", label: "All Apps" },
            { id: "active", label: "Active Rules" },
          ] as { id: Tab; label: string }[]
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`flex-1 rounded-xl px-2 py-2 text-[13px] font-semibold ${
              tab === item.id ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading && <p className="py-8 text-center text-[13px] text-muted-foreground">Loading…</p>}

      {!loading && tab === "apps" && (
        <div className="mt-4 space-y-2">
          {apps.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => (premium ? setEditing(app) : onUpgrade())}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left"
            >
              <AppIcon appName={app.app_name} />
              <span>
                <span className="block text-[14px] font-semibold text-card-foreground">
                  {app.app_name}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  Tap to set a rule
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {!loading && tab === "active" && (
        <div className="mt-4 space-y-2">
          {rules.length === 0 && (
            <p className="py-8 text-center text-[13px] text-muted-foreground">No rules yet.</p>
          )}
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-2xl border border-border bg-card px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <AppIcon appName={rule.virtual_apps?.app_name} />
                  <div>
                    <p className="text-[14px] font-semibold text-card-foreground">
                      {rule.virtual_apps?.app_name}
                    </p>
                    <p className="text-[11px] capitalize text-muted-foreground">
                      {rule.rule_type} rule
                    </p>
                  </div>
                </div>
                <span
                  className={`rounded-lg px-2 py-1 text-[11px] font-semibold capitalize ${
                    STATUS_STYLE[rule.status]
                  }`}
                >
                  {rule.status}
                </span>
              </div>
              <p className="mt-2 text-[12px] text-muted-foreground">{describe(rule)}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-primary">
                  {rule.reward_points} points
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await deleteRule(rule.id);
                    void pingDevice(deviceId);
                    void load();
                  }}
                  className="text-[12px] font-medium text-destructive"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RuleForm({
  app,
  guardianId,
  deviceId,
  onCancel,
  onCreated,
}: {
  app: VirtualAppRow;
  guardianId: string;
  deviceId: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [ruleType, setRuleType] = useState<"schedule" | "streak">("schedule");
  const [amount, setAmount] = useState("30");
  const [unit, setUnit] = useState<"minutes" | "hours">("minutes");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [points, setPoints] = useState("50");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const durationMinutes =
        ruleType === "schedule"
          ? Math.max(1, Number(amount) || 0) * (unit === "hours" ? 60 : 1)
          : null;
      await createRule({
        guardianId,
        deviceId,
        appId: app.id,
        ruleType,
        durationMinutes,
        startDate,
        endDate: ruleType === "streak" ? endDate : null,
        rewardPoints: Math.max(0, Number(points) || 0),
      });
      await notify({
        guardianId,
        deviceId,
        recipient: "controlled",
        type: ruleType === "schedule" ? "time_limit" : "rule_success",
        title: "New goal added",
        message:
          ruleType === "schedule"
            ? `A ${durationMinutes} minute limit was set for ${app.app_name}.`
            : `A streak goal was set for ${app.app_name}.`,
      });
      void pingDevice(deviceId);
      onCreated();
    } catch (e) {
      console.error("[rules] create failed", e);
      setError("Could not create this rule. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={onCancel} className="text-[13px] font-medium text-primary">
        ← Back
      </button>
      <h2 className="mt-3 text-[18px] font-semibold text-foreground">{app.app_name} rule</h2>

      <div className="mt-3 flex rounded-2xl bg-secondary p-1">
        {(["schedule", "streak"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setRuleType(kind)}
            className={`flex-1 rounded-xl px-2 py-2 text-[13px] font-semibold capitalize ${
              ruleType === kind ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
            }`}
          >
            {kind === "schedule" ? "Schedule" : "Streak Goal"}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {ruleType === "schedule" ? (
          <>
            <div className="flex gap-2">
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                className="h-12 flex-1 rounded-2xl border border-border bg-card px-4 text-[14px] outline-none focus:border-primary"
                placeholder="Duration"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as "minutes" | "hours")}
                className="h-12 rounded-2xl border border-border bg-card px-3 text-[14px]"
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </select>
            </div>
            <label className="block text-[12px] font-medium text-muted-foreground">
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 h-12 w-full rounded-2xl border border-border bg-card px-4 text-[14px] text-foreground"
              />
            </label>
            <p className="text-[12px] text-muted-foreground">
              The timer only starts when the device opens {app.app_name}.
            </p>
          </>
        ) : (
          <>
            <label className="block text-[12px] font-medium text-muted-foreground">
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 h-12 w-full rounded-2xl border border-border bg-card px-4 text-[14px] text-foreground"
              />
            </label>
            <label className="block text-[12px] font-medium text-muted-foreground">
              End date
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 h-12 w-full rounded-2xl border border-border bg-card px-4 text-[14px] text-foreground"
              />
            </label>
            <p className="text-[12px] text-muted-foreground">
              The goal fails if {app.app_name} is opened before the end date.
            </p>
          </>
        )}

        <label className="block text-[12px] font-medium text-muted-foreground">
          Reward points
          <input
            inputMode="numeric"
            value={points}
            onChange={(e) => setPoints(e.target.value.replace(/\D/g, ""))}
            className="mt-1 h-12 w-full rounded-2xl border border-border bg-card px-4 text-[14px] text-foreground"
          />
        </label>
      </div>

      {error && <p className="mt-3 text-[13px] text-destructive">{error}</p>}

      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="mt-5 h-14 w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy ? "Creating…" : "Create Rule"}
      </button>
    </div>
  );
}
