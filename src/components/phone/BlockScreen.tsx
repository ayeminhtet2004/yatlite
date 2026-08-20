export function BlockScreen({ appName, onHome }: { appName: string; onHome: () => void }) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center px-8 text-center"
      style={{ backgroundColor: "#FFF7F7" }}
    >
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10 text-4xl">
        🚫
      </span>
      <h1 className="mt-6 text-[22px] font-semibold text-destructive">App Blocked</h1>
      <p className="mt-2 text-[16px] font-semibold text-foreground">{appName}</p>
      <p className="mt-2 text-[14px] leading-snug text-muted-foreground">
        This application has been blocked by your Guardian.
      </p>
      <button
        type="button"
        onClick={onHome}
        className="mt-8 h-[56px] w-full max-w-[280px] rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground transition-opacity active:opacity-90"
      >
        Return Home
      </button>
    </div>
  );
}
