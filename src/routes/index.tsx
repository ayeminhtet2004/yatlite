import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { PhoneShell } from "@/components/phone/PhoneShell";
import { HomeScreen } from "@/components/phone/HomeScreen";
import { SimulatedApp } from "@/components/phone/SimulatedApp";
import { YatLiteApp } from "@/components/yat/YatLiteApp";
import { AuthProvider } from "@/hooks/useAuth";
import { loadRole, saveRole, loadScreen, saveScreen, clearScreen, type YatRole } from "@/lib/yat";

const TITLE = "Yat Lite — Guardian & Controlled Device Simulator";
const DESCRIPTION =
  "Yat Lite simulates a mobile Guardian and Controlled Device ecosystem in one web app, with realtime pairing, activity and app control.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: Index,
});

function Index() {
  // Restore the last open app + role so a refresh doesn't dump the user back
  // onto the phone home screen while they're inside the Yat Lite app.
  const [foregroundApp, setForegroundApp] = useState<string | null>(null);
  const [role, setRole] = useState<YatRole | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setRole(loadRole());
    setForegroundApp(loadScreen());
    setHydrated(true);
  }, []);

  function openApp(appId: string) {
    saveScreen(appId);
    setForegroundApp(appId);
  }

  function goHome() {
    clearScreen();
    setForegroundApp(null);
  }

  function selectRole(next: YatRole | null) {
    saveRole(next);
    setRole(next);
    // Leaving role selection returns to the phone home screen.
    if (next === null) goHome();
  }

  return (
    <AuthProvider>
      <PhoneShell>
        {!hydrated ? (
          <div className="flex flex-1 items-center justify-center bg-background" aria-label="Loading Yat Lite">
            <div className="h-8 w-8 animate-pulse rounded-lg bg-primary" />
          </div>
        ) : (
          <>
            {foregroundApp === null && <HomeScreen onOpenApp={openApp} />}
            {foregroundApp === "yat_lite" && (
              <YatLiteApp role={role} onSelectRole={selectRole} onHome={goHome} />
            )}
            {foregroundApp !== null && foregroundApp !== "yat_lite" && (
              <SimulatedApp appId={foregroundApp} onHome={goHome} />
            )}
          </>
        )}
      </PhoneShell>
    </AuthProvider>
  );
}
