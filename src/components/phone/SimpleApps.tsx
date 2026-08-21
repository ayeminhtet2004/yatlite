import { VIRTUAL_APPS } from "@/lib/yat";

function Frame({
  appId,
  children,
  onHome,
}: {
  appId: string;
  children: React.ReactNode;
  onHome: () => void;
}) {
  const app = VIRTUAL_APPS.find((item) => item.id === appId);
  return (
    <div className="flex flex-1 flex-col bg-background">
      <div
        className="flex items-center gap-3 px-5 py-4 text-white"
        style={{ backgroundColor: app?.color ?? "#0056D2" }}
      >
        <span className="text-xl" aria-hidden>
          {app?.glyph}
        </span>
        <h1 className="text-base font-semibold">{app?.name}</h1>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
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

function Row({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-sm">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
        {title.charAt(0)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        {subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}

export function PhoneApp({ onHome }: { onHome: () => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
  return (
    <Frame appId="phone" onHome={onHome}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Recent
      </p>
      <div className="space-y-2">
        <Row title="Mom" subtitle="Incoming · 2 min" />
        <Row title="Aye" subtitle="Missed · Yesterday" />
      </div>
      <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Keypad
      </p>
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k) => (
          <div
            key={k}
            className="flex h-12 items-center justify-center rounded-xl bg-card text-base font-semibold text-foreground shadow-sm"
          >
            {k}
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function MessagesApp({ onHome }: { onHome: () => void }) {
  return (
    <Frame appId="messages" onHome={onHome}>
      <div className="space-y-2">
        <Row title="Mom" subtitle="See you later" />
        <Row title="Friend" subtitle="Are you free today?" />
        <Row title="Aye" subtitle="Sent the notes 👍" />
      </div>
    </Frame>
  );
}

export function ContactsApp({ onHome }: { onHome: () => void }) {
  return (
    <Frame appId="contacts" onHome={onHome}>
      <div className="space-y-2">
        {["Aye", "Mark", "John", "Sarah"].map((n) => (
          <Row key={n} title={n} subtitle="Mobile" />
        ))}
      </div>
    </Frame>
  );
}
