import { VIRTUAL_APPS } from "@/lib/yat";

export function SimulatedApp({ appId, onHome }: { appId: string; onHome: () => void }) {
  const app = VIRTUAL_APPS.find((item) => item.id === appId);

  return (
    <div className="flex flex-1 flex-col">
      <div
        className="flex items-center gap-3 px-5 py-4 text-white"
        style={{ backgroundColor: app?.color ?? "#101828" }}
      >
        <span className="text-xl" aria-hidden>
          {app?.glyph}
        </span>
        <h1 className="text-base font-semibold">{app?.name ?? "App"}</h1>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-base font-semibold text-foreground">{app?.name} is running</p>
        <p className="text-sm text-muted-foreground">
          This simulated app will report activity to Yat Lite in a later phase.
        </p>
      </div>

      <div className="px-5 pb-5">
        <button
          type="button"
          onClick={onHome}
          className="h-[56px] w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground transition-opacity active:opacity-90"
        >
          Return Home
        </button>
      </div>
    </div>
  );
}
