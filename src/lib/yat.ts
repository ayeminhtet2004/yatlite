export type YatRole = "guardian" | "controlled";

const ROLE_KEY = "yat.role";
const SCREEN_KEY = "yat.screen";
const DEVICE_TOKEN_KEY = "yat.deviceToken";

/**
 * Controlled-device identity. Random per browser, never a Guardian credential.
 * Created lazily and kept until the device is disconnected.
 */
export function loadDeviceToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(DEVICE_TOKEN_KEY);
}

export function ensureDeviceToken(): string {
  const existing = loadDeviceToken();
  if (existing) return existing;
  const token = `dev_${crypto.randomUUID()}`;
  window.localStorage.setItem(DEVICE_TOKEN_KEY, token);
  return token;
}

export function clearDeviceToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DEVICE_TOKEN_KEY);
}


/** Role is DEVICE-LOCAL only — never synced to Supabase. */
export function loadRole(): YatRole | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(ROLE_KEY);
  return value === "guardian" || value === "controlled" ? value : null;
}

export function saveRole(role: YatRole | null) {
  if (typeof window === "undefined") return;
  if (role) window.localStorage.setItem(ROLE_KEY, role);
  else window.localStorage.removeItem(ROLE_KEY);
}

export function loadScreen(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SCREEN_KEY);
}

export function saveScreen(screen: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SCREEN_KEY, screen);
}

export function clearScreen() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SCREEN_KEY);
}

export type VirtualApp = {
  id: string;
  name: string;
  color: string;
  glyph: string;
};

export const VIRTUAL_APPS: VirtualApp[] = [
  { id: "yat_lite", name: "Yat Lite", color: "#0056D2", glyph: "Y" },
  { id: "youtube", name: "YouTube", color: "#FF0033", glyph: "▶" },
  { id: "tiktok", name: "TikTok", color: "#111111", glyph: "♪" },
  { id: "roblox", name: "Roblox", color: "#E2231A", glyph: "▣" },
  { id: "mobile_legends", name: "Mobile Legends", color: "#1B3C8B", glyph: "⚔" },
  { id: "chrome", name: "Chrome", color: "#1A73E8", glyph: "◎" },
  { id: "facebook", name: "Facebook", color: "#1877F2", glyph: "f" },
  { id: "messages", name: "Messages", color: "#00C853", glyph: "✉" },
  { id: "camera", name: "Camera", color: "#4B5563", glyph: "◉" },
  { id: "settings", name: "Settings", color: "#6B7280", glyph: "⚙" },
  { id: "lucky_slots", name: "Lucky Slots", color: "#B7791F", glyph: "🎰" },
];
