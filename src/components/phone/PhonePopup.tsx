export type PhonePopupTone = "warn" | "danger" | "info";

const TONE: Record<PhonePopupTone, { bg: string; icon: string }> = {
  warn: { bg: "bg-amber-500/95", icon: "⏳" },
  danger: { bg: "bg-destructive/95", icon: "⚠️" },
  info: { bg: "bg-primary/95", icon: "🔔" },
};

export function PhonePopup({
  title,
  message,
  tone = "info",
  countdown,
  onDismiss,
}: {
  title: string;
  message: string;
  tone?: PhonePopupTone;
  countdown?: number | null;
  onDismiss?: () => void;
}) {
  const style = TONE[tone];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center px-3 pt-3">
      <div
        role="status"
        className={`pointer-events-auto flex w-full max-w-[380px] items-start gap-3 rounded-2xl ${style.bg} px-4 py-3 text-primary-foreground shadow-lg backdrop-blur animate-fade-in`}
      >
        <span className="text-xl leading-none">{style.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-tight">{title}</p>
          <p className="mt-0.5 text-[12px] leading-snug opacity-90">{message}</p>
          {typeof countdown === "number" && (
            <p className="mt-1 text-[20px] font-bold tabular-nums">{countdown}s</p>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className="text-[16px] leading-none opacity-80 transition-opacity hover:opacity-100"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
