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

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-11 flex-1 items-center justify-center text-foreground/70 transition-transform active:scale-90 active:text-primary"
    >
      {children}
    </button>
  );
}

export function PhoneShell({
  children,
  onBack,
  onHome,
  onRecents,
}: {
  children: ReactNode;
  onBack: () => void;
  onHome: () => void;
  onRecents: () => void;
}) {
  return (
    <div className="flex min-h-screen w-full justify-center bg-secondary">
      <div className="relative flex h-[100dvh] w-full max-w-[420px] flex-col overflow-hidden bg-background shadow-[0_0_60px_rgba(16,24,40,0.12)] sm:my-4 sm:h-[calc(100dvh-2rem)] sm:rounded-[2.25rem] sm:border sm:border-border">
        <StatusBar />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-8 py-1.5">
          <NavButton label="Back" onClick={onBack}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path d="M17 3 L6 12 L17 21 Z" fill="currentColor" />
            </svg>
          </NavButton>
          <NavButton label="Home" onClick={onHome}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.2" />
            </svg>
          </NavButton>
          <NavButton label="Recent apps" onClick={onRecents}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <rect
                x="4"
                y="4"
                width="16"
                height="16"
                rx="3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              />
            </svg>
          </NavButton>
        </div>
      </div>
    </div>
  );
}

