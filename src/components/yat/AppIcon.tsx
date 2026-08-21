import { cn } from "@/lib/utils";

/**
 * Presentational-only app icon: solid brand-blue rounded square with the
 * app name's first letter in white. No data, no state, no handlers.
 */
export function AppIcon({
  appName,
  className,
}: {
  appName?: string | null | undefined;
  className?: string;
}) {
  const initial = (appName ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-primary text-[20px] font-bold leading-none text-primary-foreground",
        className,
      )}
    >
      {initial}
    </span>
  );
}
