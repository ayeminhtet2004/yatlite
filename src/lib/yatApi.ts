import { supabase } from "@/integrations/supabase/client";

/**
 * Phase 4 tables/RPCs are not in the generated types.ts (that file mirrors a
 * different project), so we go through a loosely-typed handle and keep the
 * real shapes in the types below.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type DeviceRow = {
  id: string;
  device_name: string;
  device_identifier: string | null;
  status: string;
  battery_level: number;
  installed_apps_count: number;
  paired: boolean;
  last_seen_at: string | null;
  created_at: string;
};

export type PermissionsRow = {
  device_id: string;
  risk_activity: boolean;
  recent_apps: boolean;
  visited_websites: boolean;
  installed_apps: boolean;
  usage_access_enabled: boolean;
  accessibility_enabled: boolean;
};

export type VirtualAppRow = {
  id: string;
  app_key: string;
  app_name: string;
  icon_key: string | null;
  category: string | null;
  risk_level: string;
  installed: boolean;
  blocked?: boolean;
};

export type DeviceState = {
  /** Server clock at the moment the state was produced (clock-skew safe countdowns). */
  now?: string;
  device: DeviceRow;
  permissions: PermissionsRow | null;
  apps: VirtualAppRow[];
  rules?: ControlledRule[];
  points?: number;
  notifications?: NotificationRow[];
};

export type PairingCodeRow = {
  id: string;
  guardian_id: string;
  device_id: string | null;
  device_name: string;
  code: string;
  status: "waiting" | "paired" | "expired" | "cancelled";
  expires_at: string;
  paired_at: string | null;
};

export type RequestedPermissions = {
  recentApps: boolean;
  visitedWebsites: boolean;
  installedApps: boolean;
};

/** Unambiguous alphabet: no O/0, I/1. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length = 6) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join("");
}

export function formatCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export function normalizeCode(input: string) {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Safe payload only: the pair code + a marker. No ids, no tokens. */
export function qrPayload(code: string) {
  return `yatlite://pair?code=${code}`;
}

export async function createPairingCode(
  guardianId: string,
  deviceName: string,
  perms: RequestedPermissions,
): Promise<PairingCodeRow> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomCode();
    const { data, error } = await db
      .from("pairing_codes")
      .insert({
        guardian_id: guardianId,
        device_name: deviceName,
        code,
        status: "waiting",
        perm_risk_activity: true,
        perm_recent_apps: perms.recentApps,
        perm_visited_websites: perms.visitedWebsites,
        perm_installed_apps: perms.installedApps,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    if (!error) return data as PairingCodeRow;
    lastError = error;
    if (error.code !== "23505") break; // only retry unique-code collisions
  }
  throw lastError;
}

export async function cancelPairingCode(id: string) {
  await db.from("pairing_codes").update({ status: "cancelled" }).eq("id", id);
}

export async function fetchPairingCode(id: string): Promise<PairingCodeRow | null> {
  const { data } = await db.from("pairing_codes").select("*").eq("id", id).maybeSingle();
  return (data as PairingCodeRow) ?? null;
}

export async function fetchDevices(guardianId: string): Promise<DeviceRow[]> {
  const { data, error } = await db
    .from("devices")
    .select("*")
    .eq("guardian_id", guardianId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DeviceRow[];
}

export async function deleteDevice(deviceId: string) {
  const { error } = await db.from("devices").delete().eq("id", deviceId);
  if (error) throw error;
}

export const ONLINE_WINDOW_MS = 60_000;

export function isOnline(device: Pick<DeviceRow, "last_seen_at">) {
  if (!device.last_seen_at) return false;
  return Date.now() - new Date(device.last_seen_at).getTime() < ONLINE_WINDOW_MS;
}

/* ------------------------------------------------ controlled device RPCs */

function unwrapState(data: unknown): DeviceState | null {
  const state = data as DeviceState | null;
  return state && state.device ? state : null;
}

export async function pairDevice(code: string, deviceToken: string): Promise<DeviceState> {
  const { data, error } = await db.rpc("yat_pair_device", {
    p_code: normalizeCode(code),
    p_device_token: deviceToken,
  });
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, "") || "Pairing failed.");
  const state = unwrapState(data);
  if (!state) throw new Error("Pairing failed.");
  return state;
}

export async function deviceHeartbeat(deviceToken: string): Promise<DeviceState | null> {
  const { data, error } = await db.rpc("yat_heartbeat", { p_device_token: deviceToken });
  if (error) throw error;
  return unwrapState(data);
}

export async function setDevicePermissions(
  deviceToken: string,
  usage: boolean,
  accessibility: boolean,
): Promise<DeviceState | null> {
  const { data, error } = await db.rpc("yat_set_device_permissions", {
    p_device_token: deviceToken,
    p_usage: usage,
    p_accessibility: accessibility,
  });
  if (error) throw error;
  return unwrapState(data);
}

/* =====================================================================
 * Phase 5 — activity, blocking, rules, points, notifications, billing
 * ===================================================================== */

export type ActivitySessionRow = {
  id: string;
  device_id: string;
  app_id: string;
  opened_at: string;
  closed_at: string | null;
  duration_seconds: number;
  status: "active" | "closed";
  virtual_apps?: { app_key: string; app_name: string; risk_level: string } | null;
};

export type WebHistoryRow = {
  id: string;
  device_id: string;
  url: string;
  title: string | null;
  domain: string | null;
  risk_level: string;
  visited_at: string;
};

export type RiskEventRow = {
  id: string;
  device_id: string;
  app_id: string | null;
  url: string | null;
  event_type: string;
  title: string | null;
  description: string | null;
  created_at: string;
  virtual_apps?: { app_key: string; app_name: string } | null;
};

export type RuleRow = {
  id: string;
  guardian_id: string;
  device_id: string;
  app_id: string;
  rule_type: "schedule" | "streak";
  duration_minutes: number | null;
  start_date: string | null;
  end_date: string | null;
  reward_points: number;
  status: "pending" | "success" | "fail";
  accumulated_seconds: number;
  created_at: string;
  virtual_apps?: { app_key: string; app_name: string } | null;
};

export type NotificationRow = {
  id: string;
  guardian_id: string | null;
  device_id: string | null;
  recipient_type: "guardian" | "controlled";
  notification_type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export type PointTransactionRow = {
  id: string;
  device_id: string;
  rule_id: string | null;
  points: number;
  source: string;
  description: string | null;
  created_at: string;
};

export type SubscriptionRow = {
  id: string;
  guardian_id: string;
  plan: "monthly" | "yearly";
  status: "active" | "expired" | "cancelled";
  activated_at: string;
  expires_at: string;
};

export type ControlledRule = {
  id: string;
  app_id: string;
  app_key: string;
  app_name: string;
  rule_type: "schedule" | "streak";
  duration_minutes: number | null;
  start_date: string | null;
  end_date: string | null;
  reward_points: number;
  status: "pending" | "success" | "fail";
  accumulated_seconds: number;
  effective_seconds?: number;
  warned_at?: string | null;
  limit_reached_at?: string | null;
  grace_expires_at?: string | null;
  created_at: string;
};

/** Formats a duration exactly as the Activity spec requires. */
export function formatDuration(seconds: number) {
  if (seconds < 5) return "Opened Only";
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

export function dayRange(kind: "today" | "yesterday" | "custom", custom?: string) {
  const base = new Date();
  if (kind === "yesterday") base.setDate(base.getDate() - 1);
  if (kind === "custom" && custom) {
    const [y, m, d] = custom.split("-").map(Number);
    base.setFullYear(y ?? base.getFullYear(), (m ?? 1) - 1, d ?? 1);
  }
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/* ------------------------------------------------------------- guardian */

export async function fetchDeviceApps(deviceId: string) {
  const [{ data: apps, error }, { data: blocks }] = await Promise.all([
    db.from("virtual_apps").select("*").eq("device_id", deviceId).order("app_name"),
    db.from("blocked_apps").select("app_id, blocked").eq("device_id", deviceId),
  ]);
  if (error) throw error;
  const blockedSet = new Map<string, boolean>(
    ((blocks ?? []) as { app_id: string; blocked: boolean }[]).map((b) => [b.app_id, b.blocked]),
  );
  return ((apps ?? []) as VirtualAppRow[]).map((app) => ({
    ...app,
    blocked: blockedSet.get(app.id) ?? false,
  }));
}

export async function fetchDevicePermissions(deviceId: string): Promise<PermissionsRow | null> {
  const { data } = await db
    .from("device_permissions")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();
  return (data as PermissionsRow) ?? null;
}

export async function setAppBlocked(deviceId: string, appId: string, blocked: boolean) {
  const { error } = await db
    .from("blocked_apps")
    .upsert({ device_id: deviceId, app_id: appId, blocked }, { onConflict: "device_id,app_id" });
  if (error) throw error;
}

export async function fetchActivity(deviceId: string, startISO: string, endISO: string) {
  const { data, error } = await db
    .from("activity_sessions")
    .select("*, virtual_apps(app_key, app_name, risk_level)")
    .eq("device_id", deviceId)
    .gte("opened_at", startISO)
    .lt("opened_at", endISO)
    .order("opened_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as ActivitySessionRow[];
}

export async function fetchWebHistory(deviceId: string, startISO: string, endISO: string) {
  const { data, error } = await db
    .from("web_history")
    .select("*")
    .eq("device_id", deviceId)
    .gte("visited_at", startISO)
    .lt("visited_at", endISO)
    .order("visited_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as WebHistoryRow[];
}

export async function fetchRiskEvents(deviceId: string, startISO: string, endISO: string) {
  const { data, error } = await db
    .from("risk_events")
    .select("*, virtual_apps(app_key, app_name)")
    .eq("device_id", deviceId)
    .gte("created_at", startISO)
    .lt("created_at", endISO)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as RiskEventRow[];
}

export async function fetchRules(deviceId: string) {
  const { data, error } = await db
    .from("rules")
    .select("*, virtual_apps(app_key, app_name)")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RuleRow[];
}

export async function createRule(input: {
  guardianId: string;
  deviceId: string;
  appId: string;
  ruleType: "schedule" | "streak";
  durationMinutes?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  rewardPoints: number;
}) {
  const { data, error } = await db
    .from("rules")
    .insert({
      guardian_id: input.guardianId,
      device_id: input.deviceId,
      app_id: input.appId,
      rule_type: input.ruleType,
      duration_minutes: input.durationMinutes ?? null,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      reward_points: input.rewardPoints,
      status: "pending",
    })
    .select("*, virtual_apps(app_key, app_name)")
    .single();
  if (error) throw error;
  return data as RuleRow;
}

export async function deleteRule(ruleId: string) {
  const { error } = await db.from("rules").delete().eq("id", ruleId);
  if (error) throw error;
}

export async function fetchPointTransactions(deviceId: string) {
  const { data, error } = await db
    .from("point_transactions")
    .select("*")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PointTransactionRow[];
}

export async function fetchGuardianNotifications(guardianId: string) {
  const { data, error } = await db
    .from("notifications")
    .select("*")
    .eq("guardian_id", guardianId)
    .eq("recipient_type", "guardian")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

export async function markGuardianNotificationRead(guardianId: string, id?: string) {
  let query = db
    .from("notifications")
    .update({ is_read: true })
    .eq("guardian_id", guardianId)
    .eq("recipient_type", "guardian");
  if (id) query = query.eq("id", id);
  else query = query.eq("is_read", false);
  const { error } = await query;
  if (error) throw error;
}

export async function notify(input: {
  guardianId: string;
  deviceId: string;
  recipient: "guardian" | "controlled";
  type: string;
  title: string;
  message: string;
}) {
  await db.from("notifications").insert({
    guardian_id: input.guardianId,
    device_id: input.deviceId,
    recipient_type: input.recipient,
    notification_type: input.type,
    title: input.title,
    message: input.message,
  });
}

/* --------------------------------------------------------- subscription */

export async function fetchSubscription(guardianId: string): Promise<SubscriptionRow | null> {
  const { data } = await db
    .from("subscriptions")
    .select("*")
    .eq("guardian_id", guardianId)
    .eq("status", "active")
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SubscriptionRow) ?? null;
}

export function isPremiumActive(sub: SubscriptionRow | null) {
  if (!sub) return false;
  return sub.status === "active" && new Date(sub.expires_at).getTime() > Date.now();
}

export async function activateSubscription(guardianId: string, plan: "monthly" | "yearly") {
  const activated = new Date();
  const expires = new Date(activated);
  if (plan === "monthly") expires.setMonth(expires.getMonth() + 1);
  else expires.setFullYear(expires.getFullYear() + 1);
  const { data, error } = await db
    .from("subscriptions")
    .insert({
      guardian_id: guardianId,
      plan,
      status: "active",
      activated_at: activated.toISOString(),
      expires_at: expires.toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data as SubscriptionRow;
}

/* ----------------------------------------------- controlled device RPCs */

export type OpenAppResult = {
  paired: boolean;
  blocked?: boolean;
  tracked?: boolean;
  session_id?: string;
  app_name?: string;
  state?: DeviceState | null;
};

export async function openAppRpc(token: string, appKey: string): Promise<OpenAppResult> {
  const { data, error } = await db.rpc("yat_open_app", {
    p_device_token: token,
    p_app_key: appKey,
  });
  if (error) throw error;
  return (data ?? { paired: false }) as OpenAppResult;
}

export async function closeAppRpc(token: string): Promise<DeviceState | null> {
  const { data, error } = await db.rpc("yat_close_app", { p_device_token: token });
  if (error) throw error;
  return unwrapState(data);
}

export async function visitSiteRpc(
  token: string,
  url: string,
  title: string,
  domain: string,
  risk: string,
): Promise<DeviceState | null> {
  const { data, error } = await db.rpc("yat_visit_site", {
    p_device_token: token,
    p_url: url,
    p_title: title,
    p_domain: domain,
    p_risk: risk,
  });
  if (error) throw error;
  return unwrapState(data);
}

export async function markControlledNotificationsRead(token: string, id?: string) {
  const { data, error } = await db.rpc("yat_mark_notifications_read", {
    p_device_token: token,
    p_notification_id: id ?? null,
  });
  if (error) throw error;
  return unwrapState(data);
}

/** Guardian-side idempotent rule enforcement (safe, RLS-checked, no service key). */
export async function guardianEnforce(deviceId: string) {
  const { error } = await db.rpc("yat_guardian_enforce", { p_device_id: deviceId });
  if (error) console.error("[guardian] enforce", error);
}

/** Instant cross-device nudge: the controlled device is anonymous and cannot
 *  subscribe to postgres_changes, so guardians broadcast on a public channel. */
export async function pingDevice(deviceId: string) {
  const channel = supabase.channel(`yat-device-${deviceId}`);
  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    });
    setTimeout(resolve, 1200);
  });
  await channel.send({ type: "broadcast", event: "refresh", payload: {} });
  supabase.removeChannel(channel);
}
