import { useEffect, useState } from "react";
import { VIRTUAL_APPS, type VirtualApp } from "@/lib/yat";

function AppIcon({ app, onOpen }: { app: VirtualApp; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(app.id)}
      className="flex flex-col items-center gap-2 focus:outline-none"
    >
      <span
        className="flex h-[60px] w-[60px] items-center justify-center rounded-2xl text-2xl font-semibold text-white shadow-sm transition-transform active:scale-95"
        style={{ backgroundColor: app.color }}
        aria-hidden
      >
        {app.glyph}
      </span>
      <span className="max-w-[76px] truncate text-[11px] font-medium text-foreground">
        {app.name}
      </span>
    </button>
  );
}

export function HomeScreen({ onOpenApp }: { onOpenApp: (id: string) => void }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-5 pb-6 pt-4">
      <div className="mb-8 text-center">
        <p className="text-4xl font-semibold tracking-tight text-foreground">
          {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "--:--"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {now ? now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) : "\u00a0"}
        </p>
      </div>


      <div className="grid grid-cols-4 gap-x-3 gap-y-6">
        {VIRTUAL_APPS.map((app) => (
          <AppIcon key={app.id} app={app} onOpen={onOpenApp} />
        ))}
      </div>

      <div className="mt-auto pt-8">
        <p className="text-center text-[11px] text-muted-foreground">
          Tap Yat Lite to set up this device
        </p>
      </div>
    </div>
  );
}
