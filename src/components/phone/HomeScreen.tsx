import { useEffect, useMemo, useState } from "react";
import { Mic, Search } from "lucide-react";
import { DOCK_APP_IDS, VIRTUAL_APPS, type VirtualApp } from "@/lib/yat";

function AppIcon({
  app,
  onOpen,
  busy,
  compact,
}: {
  app: VirtualApp;
  onOpen: (id: string) => void;
  busy?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(app.id)}
      disabled={busy}
      className="flex flex-col items-center gap-1.5 focus:outline-none disabled:opacity-60"
    >
      <span
        className="flex h-[56px] w-[56px] items-center justify-center rounded-[18px] text-2xl font-semibold text-white shadow-[0_6px_14px_rgba(16,24,40,0.22)] transition-transform active:scale-95"
        style={{ backgroundColor: app.color }}
        aria-hidden
      >
        {app.glyph}
      </span>
      {compact ? null : (
        <span className="max-w-[76px] truncate text-[11px] font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
          {app.name}
        </span>
      )}
    </button>
  );
}

export function HomeScreen({
  onOpenApp,
  busyApp,
}: {
  onOpenApp: (id: string) => void;
  busyApp?: string | null;
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const dockApps = useMemo(
    () =>
      DOCK_APP_IDS.map((id) => VIRTUAL_APPS.find((a) => a.id === id)).filter(
        (a): a is VirtualApp => Boolean(a),
      ),
    [],
  );

  const gridApps = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) return VIRTUAL_APPS.filter((a) => a.name.toLowerCase().includes(q));
    return VIRTUAL_APPS.filter((a) => !DOCK_APP_IDS.includes(a.id));
  }, [query]);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Decorative Android-style wallpaper (CSS only) */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 15% 0%, #6EA8FF 0%, rgba(110,168,255,0) 55%)," +
            "radial-gradient(100% 70% at 100% 15%, #8FE3F0 0%, rgba(143,227,240,0) 60%)," +
            "radial-gradient(120% 90% at 80% 100%, #B7A9FF 0%, rgba(183,169,255,0) 55%)," +
            "linear-gradient(160deg, #0B2A6B 0%, #12439E 45%, #0056D2 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute -left-16 top-24 h-56 w-56 rounded-full bg-white/15 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -right-12 bottom-28 h-52 w-52 rounded-full bg-cyan-200/20 blur-3xl"
      />

      <div className="relative flex min-h-0 flex-1 flex-col px-4 pb-3 pt-3">
        <div className="mb-4 text-center text-white">
          <p className="text-[40px] font-semibold leading-none tracking-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.3)]">
            {now
              ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
              : "--:--"}
          </p>
          <p className="mt-1 text-[13px] text-white/80">
            {now
              ? now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })
              : "\u00a0"}
          </p>
        </div>

        <div className="mb-5 flex h-[54px] shrink-0 items-center gap-3 rounded-full bg-white/90 px-5 shadow-[0_6px_18px_rgba(16,24,40,0.18)] backdrop-blur">
          <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search apps"
            aria-label="Search apps"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <Mic className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-4 gap-x-2 gap-y-5">
            {gridApps.map((app) => (
              <AppIcon key={app.id} app={app} onOpen={onOpenApp} busy={busyApp === app.id} />
            ))}
          </div>
          {gridApps.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-white/80">No apps found</p>
          ) : null}
        </div>

        <p className="py-2 text-center text-[11px] text-white/75">
          Tap Yat Lite to set up this device
        </p>

        <div className="mt-1 flex shrink-0 items-center justify-around rounded-[26px] border border-white/30 bg-white/25 px-4 py-3 shadow-[0_8px_24px_rgba(16,24,40,0.22)] backdrop-blur-md">
          {dockApps.map((app) => (
            <AppIcon key={app.id} app={app} onOpen={onOpenApp} busy={busyApp === app.id} compact />
          ))}
        </div>
      </div>
    </div>
  );
}
