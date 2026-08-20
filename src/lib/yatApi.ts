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
};

export type DeviceState = {
  device: DeviceRow;
  permissions: PermissionsRow | null;
  apps: VirtualAppRow[];
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
