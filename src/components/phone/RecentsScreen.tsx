import { VIRTUAL_APPS } from "@/lib/yat";

export function RecentsScreen({
  recents,
  onOpen,
  onClear,
  onHome,
}: {
  recents: string[];
  onOpen: (id: string) => void;
  onClear: () => void;
  onHome: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col bg-secondary px-5 pb-4 pt-4">
      <p className="mb-3 text-[13px] font-semibold text-muted-foreground">Recent apps</p>

      {recents.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-[15px] font-semibold text-foreground">No recent apps</p>
          <p className="text-[13px] text-muted-foreground">Apps you open will appear here.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {recents.map((id) => {
            const app = VIRTUAL_APPS.find((item) => item.id === id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onOpen(id)}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-left shadow-sm transition-transform active:scale-[0.99]"
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-semibold text-white"
                  style={{ backgroundColor: app?.color ?? "#101828" }}
                  aria-hidden
                >
                  {app?.glyph ?? "▢"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-card-foreground">
                    {app?.name ?? id}
                  </span>
                  <span className="block text-[12px] text-muted-foreground">Tap to resume</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onClear}
          className="h-[48px] rounded-2xl border border-border bg-card text-[14px] font-semibold text-muted-foreground"
        >
          Clear all
        </button>
        <button
          type="button"
          onClick={onHome}
          className="h-[48px] rounded-2xl bg-primary text-[14px] font-semibold text-primary-foreground"
        >
          Home
        </button>
      </div>
    </div>
  );
}
