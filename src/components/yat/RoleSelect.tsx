import type { YatRole } from "@/lib/yat";

const OPTIONS: { role: YatRole; title: string; description: string; glyph: string }[] = [
  {
    role: "guardian",
    title: "Guardian",
    description: "Monitor and manage a connected Controlled Device.",
    glyph: "🛡",
  },
  {
    role: "controlled",
    title: "Controlled Device",
    description: "This device will be connected to a Guardian.",
    glyph: "📱",
  },
];

export function RoleSelect({
  onSelect,
  onHome,
}: {
  onSelect: (role: YatRole) => void;
  onHome: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-8 pt-4">
      <button
        type="button"
        onClick={onHome}
        className="mb-8 self-start text-[13px] font-medium text-muted-foreground"
      >
        ← Home
      </button>

      <div className="mb-8">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-3xl font-bold text-primary-foreground">
          Y
        </div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Yat Lite</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          How will this device be used? You can change this later.
        </p>
      </div>

      <div className="space-y-3">
        {OPTIONS.map((option) => (
          <button
            key={option.role}
            type="button"
            onClick={() => onSelect(option.role)}
            className="flex w-full items-center gap-4 rounded-2xl border border-border bg-card px-4 py-4 text-left transition-colors active:bg-accent"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent text-xl">
              {option.glyph}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-card-foreground">
                {option.title}
              </span>
              <span className="block text-[13px] leading-snug text-muted-foreground">
                {option.description}
              </span>
            </span>
          </button>
        ))}
      </div>

      <p className="mt-6 text-[12px] leading-relaxed text-muted-foreground">
        This choice is stored on this device only, so another phone opening the same link can pick
        the other role.
      </p>
    </div>
  );
}
