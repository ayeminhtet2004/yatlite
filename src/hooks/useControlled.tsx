import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { clearDeviceToken, ensureDeviceToken, loadDeviceToken } from "@/lib/yat";
import {
  closeAppRpc,
  deviceHeartbeat,
  markControlledNotificationsRead,
  openAppRpc,
  pairDevice,
  setDevicePermissions,
  visitSiteRpc,
  type DeviceState,
} from "@/lib/yatApi";

const HEARTBEAT_MS = 20000;
const POLL_MS = 4000;

type ControlledValue = {
  ready: boolean;
  token: string | null;
  state: DeviceState | null;
  paired: boolean;
  disconnected: boolean;
  refresh: () => Promise<DeviceState | null>;
  pair: (code: string) => Promise<void>;
  disconnect: () => void;
  grantPermissions: (usage: boolean, accessibility: boolean) => Promise<void>;
  markRead: (id?: string) => Promise<void>;
  /** Returns true when the app is blocked and must show the Block Screen. */
  requestOpenApp: (appKey: string) => Promise<{ blocked: boolean; appName: string | null }>;
  closeApp: () => Promise<void>;
  visitSite: (url: string, title: string, domain: string, risk: string) => Promise<void>;
  /** Active time-limit warning (60s grace) for the app currently open. */
  warning: { ruleId: string; appName: string; secondsLeft: number } | null;
};

const GRACE_SECONDS = 60;

const ControlledContext = createContext<ControlledValue | null>(null);

export function ControlledProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<DeviceState | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const dropIdentity = useCallback((wasDisconnected: boolean) => {
    clearDeviceToken();
    tokenRef.current = null;
    setToken(null);
    setState(null);
    setDisconnected(wasDisconnected);
  }, []);

  const refresh = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return null;
    try {
      const next = await deviceHeartbeat(t);
      if (!next) {
        dropIdentity(true);
        return null;
      }
      setState(next);
      return next;
    } catch (e) {
      console.error("[controlled] refresh failed", e);
      return null;
    }
  }, [dropIdentity]);

  // Restore identity on mount.
  useEffect(() => {
    const t = loadDeviceToken();
    tokenRef.current = t;
    setToken(t);
    if (!t) {
      setReady(true);
      return;
    }
    void refresh().finally(() => setReady(true));
  }, [refresh]);

  // Heartbeat + light polling while paired (the anon device cannot use
  // postgres_changes, so a guardian broadcast + short poll keeps it live).
  // A pending schedule rule inside its grace window polls every second so the
  // block lands the moment grace_expires_at passes, even mid-app.
  const graceAt = state?.rules?.find(
    (r) => r.status === "pending" && r.grace_expires_at,
  )?.grace_expires_at;

  useEffect(() => {
    if (!token) return;
    const poll = window.setInterval(() => void refresh(), graceAt ? 1000 : POLL_MS);
    const beat = window.setInterval(() => void refresh(), HEARTBEAT_MS);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(beat);
    };
  }, [token, refresh, graceAt]);


  // Instant nudges from the guardian (block/unblock, new rule, delete).
  const deviceId = state?.device.id ?? null;
  useEffect(() => {
    if (!deviceId) return;
    const channel = supabase
      .channel(`yat-device-${deviceId}`)
      .on("broadcast", { event: "refresh" }, () => void refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId, refresh]);

  const pair = useCallback(async (code: string) => {
    const t = ensureDeviceToken();
    tokenRef.current = t;
    try {
      const next = await pairDevice(code, t);
      setToken(t);
      setState(next);
      setDisconnected(false);
    } catch (e) {
      clearDeviceToken();
      tokenRef.current = null;
      throw e;
    }
  }, []);

  const grantPermissions = useCallback(async (usage: boolean, accessibility: boolean) => {
    const t = tokenRef.current;
    if (!t) return;
    const next = await setDevicePermissions(t, usage, accessibility);
    if (next) setState(next);
  }, []);

  const markRead = useCallback(async (id?: string) => {
    const t = tokenRef.current;
    if (!t) return;
    const next = await markControlledNotificationsRead(t, id);
    if (next) setState(next);
  }, []);

  const requestOpenApp = useCallback(async (appKey: string) => {
    const t = tokenRef.current;
    if (!t) return { blocked: false, appName: null };
    try {
      const result = await openAppRpc(t, appKey);
      if (!result.paired) {
        dropIdentity(true);
        return { blocked: false, appName: null };
      }
      if (result.state) setState(result.state);
      return { blocked: Boolean(result.blocked), appName: result.app_name ?? null };
    } catch (e) {
      console.error("[controlled] open app failed", e);
      return { blocked: false, appName: null };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropIdentity]);

  const closeApp = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    try {
      const next = await closeAppRpc(t);
      if (next) setState(next);
    } catch (e) {
      console.error("[controlled] close app failed", e);
    }
  }, []);

  const visitSite = useCallback(
    async (url: string, title: string, domain: string, risk: string) => {
      const t = tokenRef.current;
      if (!t) return;
      try {
        const next = await visitSiteRpc(t, url, title, domain, risk);
        if (next) setState(next);
      } catch (e) {
        console.error("[controlled] visit failed", e);
      }
    },
    [],
  );

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!warnedAt) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [warnedAt]);

  const warning = useMemo(() => {
    const rule = state?.rules?.find((r) => r.status === "pending" && r.warned_at);
    if (!rule?.warned_at) return null;
    const elapsed = (Date.now() - new Date(rule.warned_at).getTime()) / 1000;
    return {
      ruleId: rule.id,
      appName: rule.app_name,
      secondsLeft: Math.max(0, Math.ceil(GRACE_SECONDS - elapsed)),
    };
    // `tick` intentionally re-runs the countdown every second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, warnedAt, tick]);


  const value = useMemo<ControlledValue>(
    () => ({
      ready,
      token,
      state,
      paired: Boolean(state?.device),
      disconnected,
      refresh,
      pair,
      disconnect: () => dropIdentity(false),
      grantPermissions,
      markRead,
      requestOpenApp,
      closeApp,
      visitSite,
      warning,
    }),
    [
      warning,
      ready,
      token,
      state,
      disconnected,
      refresh,
      pair,
      dropIdentity,
      grantPermissions,
      markRead,
      requestOpenApp,
      closeApp,
      visitSite,
    ],
  );

  return <ControlledContext.Provider value={value}>{children}</ControlledContext.Provider>;
}

export function useControlled() {
  const ctx = useContext(ControlledContext);
  if (!ctx) throw new Error("useControlled must be used inside ControlledProvider");
  return ctx;
}
