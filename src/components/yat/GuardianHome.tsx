import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const NAV = [
  { id: "home", label: "Home", glyph: "⌂" },
  { id: "activity", label: "Activity", glyph: "◴" },
  { id: "pair", label: "Pair", glyph: "+" },
  { id: "apps", label: "Apps", glyph: "▦" },
  { id: "rules", label: "Rules", glyph: "☑" },
];

export function GuardianHome({ onHome }: { onHome: () => void }) {
  const { user, signOut } = useAuth();
  const [fullName, setFullName] = useState("");
  const [tab, setTab] = useState("home");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("[guardian] profile load", error);
        if (active && data?.full_name) setFullName(data.full_name);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const initial = (fullName || user?.email || "G").charAt(0).toUpperCase();

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between px-5 pb-3 pt-2">
        <h1 className="text-[20px] font-semibold tracking-tight text-foreground">Yat Lite !</h1>
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="text-lg" aria-hidden>
            🎁
          </span>
          <span className="text-lg" aria-hidden>
            🔔
          </span>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground"
          >
            {initial}
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="mx-5 mb-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-[15px] font-semibold text-card-foreground">{fullName || "Guardian"}</p>
          <p className="text-[13px] text-muted-foreground">{user?.email}</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-3 h-11 w-full rounded-xl border border-border text-[14px] font-semibold text-destructive"
          >
            Logout
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {tab === "home" ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center">
            <p className="text-[15px] font-semibold text-card-foreground">
              No devices connected yet.
            </p>
            <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
              Tap the + button to generate a pair code.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center">
            <p className="text-[15px] font-semibold text-card-foreground">Coming next</p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {NAV.find((item) => item.id === tab)?.label} is part of the next build phase.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onHome}
          className="mt-6 w-full text-center text-[13px] font-medium text-muted-foreground"
        >
          Close Yat Lite
        </button>
      </div>

      <nav className="flex shrink-0 items-end justify-between border-t border-border bg-card px-4 pb-2 pt-2">
        {NAV.map((item) =>
          item.id === "pair" ? (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className="flex flex-col items-center gap-1"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground">
                +
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">Pair</span>
            </button>
          ) : (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className="flex flex-col items-center gap-1 px-2 py-1"
            >
              <span className={tab === item.id ? "text-primary" : "text-muted-foreground"}>
                {item.glyph}
              </span>
              <span
                className={`text-[11px] font-medium ${tab === item.id ? "text-primary" : "text-muted-foreground"}`}
              >
                {item.label}
              </span>
            </button>
          ),
        )}
      </nav>
    </div>
  );
}
