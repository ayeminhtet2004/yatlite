import type { ReactNode } from "react";
import { useEffect, useState } from "react";

function StatusBar() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
      );
    tick();
    const id = window.setInterval(tick, 15000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex shrink-0 items-center justify-between px-6 pt-3 pb-1 text-[12px] font-semibold text-foreground">
      <span>{time || "--:--"}</span>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span>▁▃▅</span>
        <span>◔</span>
        <span className="text-foreground">84%</span>
      </div>
    </div>
  );
}

export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full justify-center bg-secondary">
      <div className="relative flex h-[100dvh] w-full max-w-[420px] flex-col overflow-hidden bg-background shadow-[0_0_60px_rgba(16,24,40,0.12)] sm:my-4 sm:h-[calc(100dvh-2rem)] sm:rounded-[2.25rem] sm:border sm:border-border">
        <StatusBar />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        <div className="flex shrink-0 justify-center pb-2 pt-1">
          <div className="h-1 w-28 rounded-full bg-foreground/20" />
        </div>
      </div>
    </div>
  );
}
