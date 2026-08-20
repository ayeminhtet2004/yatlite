import { useState } from "react";

export type DemoSite = {
  url: string;
  domain: string;
  title: string;
  risk: "safe" | "risky";
  blurb: string;
};

export const DEMO_SITES: DemoSite[] = [
  {
    url: "https://google.com",
    domain: "google.com",
    title: "Google",
    risk: "safe",
    blurb: "Search the web.",
  },
  {
    url: "https://youtube.com",
    domain: "youtube.com",
    title: "YouTube",
    risk: "safe",
    blurb: "Videos and music.",
  },
  {
    url: "https://news.example",
    domain: "news.example",
    title: "Daily News",
    risk: "safe",
    blurb: "Headlines and world news.",
  },
  {
    url: "https://lucky-spin-slots.example",
    domain: "lucky-spin-slots.example",
    title: "Lucky Spin Slots",
    risk: "risky",
    blurb: "Online slot game site — flagged as risky.",
  },
];

export function ChromeApp({
  onVisit,
  onHome,
}: {
  onVisit: (site: DemoSite) => void;
  onHome: () => void;
}) {
  const [open, setOpen] = useState<DemoSite | null>(null);

  function visit(site: DemoSite) {
    setOpen(site);
    onVisit(site);
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-3 bg-[#1A73E8] px-5 py-4 text-white">
        <span className="text-xl" aria-hidden>
          ◎
        </span>
        <h1 className="text-base font-semibold">Chrome</h1>
      </div>

      <div className="border-b border-border bg-card px-4 py-3">
        <div className="rounded-full bg-secondary px-4 py-2 text-[13px] text-muted-foreground">
          {open ? open.url : "Search or type a URL"}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {open ? (
          <div>
            <h2 className="text-[18px] font-semibold text-foreground">{open.title}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{open.blurb}</p>
            {open.risk === "risky" && (
              <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-[12px] font-medium text-destructive">
                This site was reported to your Guardian as risky.
              </p>
            )}
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="mt-5 text-[13px] font-medium text-primary"
            >
              ← Back to shortcuts
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Shortcuts
            </p>
            {DEMO_SITES.map((site) => (
              <button
                key={site.url}
                type="button"
                onClick={() => visit(site)}
                className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left"
              >
                <span>
                  <span className="block text-[14px] font-semibold text-card-foreground">
                    {site.title}
                  </span>
                  <span className="block text-[12px] text-muted-foreground">{site.domain}</span>
                </span>
                {site.risk === "risky" && (
                  <span className="rounded-lg bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive">
                    Risky
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
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
