import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { PhoneShell } from "@/components/phone/PhoneShell";
import { HomeScreen } from "@/components/phone/HomeScreen";
import { SimulatedApp } from "@/components/phone/SimulatedApp";
import { BlockScreen } from "@/components/phone/BlockScreen";
import { RecentsScreen } from "@/components/phone/RecentsScreen";
import { ChromeApp, type DemoSite } from "@/components/phone/ChromeApp";
import { YatLiteApp } from "@/components/yat/YatLiteApp";
import { AuthProvider } from "@/hooks/useAuth";
import { ControlledProvider, useControlled } from "@/hooks/useControlled";
import {
  loadRole,
  saveRole,
  loadScreen,
  saveScreen,
  clearScreen,
  VIRTUAL_APPS,
  type YatRole,
} from "@/lib/yat";

const TITLE = "Yat Lite — Guardian & Controlled Device Simulator";
const DESCRIPTION =
  "Yat Lite simulates a mobile Guardian and Controlled Device ecosystem in one web app, with realtime pairing, activity, blocking and rules.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <AuthProvider>
      <ControlledProvider>
        <PhoneRuntime />
      </ControlledProvider>
    </AuthProvider>
  );
}

function PhoneRuntime() {
  // Restore the last open app + role so a refresh doesn't dump the user back
  // onto the phone home screen while they're inside the Yat Lite app.
  const [foregroundApp, setForegroundApp] = useState<string | null>(null);
  const [role, setRole] = useState<YatRole | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [blockedApp, setBlockedApp] = useState<string | null>(null);
  const [launching, setLaunching] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const [recentsOpen, setRecentsOpen] = useState(false);
  const controlled = useControlled();

  useEffect(() => {
    setRole(loadRole());
    const last = loadScreen();
    setForegroundApp(last);
    if (last) setRecents([last]);
    setHydrated(true);
  }, []);

  // CASE 1 of realtime blocking: the app is already open when the guardian
  // blocks it. One blocked launch = one block screen.
  useEffect(() => {
    if (!foregroundApp || foregroundApp === "yat_lite" || blockedApp) return;
    const app = controlled.state?.apps.find((item) => item.app_key === foregroundApp);
    if (app?.blocked) {
      clearScreen();
      setForegroundApp(null);
      setBlockedApp(app.app_name);
      void controlled.closeApp();
    }
  }, [controlled, controlled.state, foregroundApp, blockedApp]);

  async function openApp(appId: string) {
    if (launching) return;
    setBlockedApp(null);
    setRecentsOpen(false);

    if (appId !== "yat_lite" && controlled.paired) {
      setLaunching(appId);
      try {
        const result = await controlled.requestOpenApp(appId);
        if (result.blocked) {
          setBlockedApp(
            result.appName ?? VIRTUAL_APPS.find((a) => a.id === appId)?.name ?? "This app",
          );
          return;
        }
      } finally {
        setLaunching(null);
      }
    }

    saveScreen(appId);
    setForegroundApp(appId);
    setRecents((list) => [appId, ...list.filter((id) => id !== appId)].slice(0, 8));
  }

  function goHome() {
    if (foregroundApp && foregroundApp !== "yat_lite" && controlled.paired) {
      void controlled.closeApp();
    }
    setBlockedApp(null);
    setRecentsOpen(false);
    clearScreen();
    setForegroundApp(null);
  }

  function goBack() {
    if (recentsOpen) {
      setRecentsOpen(false);
      return;
    }
    if (blockedApp) {
      setBlockedApp(null);
      return;
    }
    if (foregroundApp) goHome();
  }

  function selectRole(next: YatRole | null) {
    saveRole(next);
    setRole(next);
    if (next === null) goHome();
  }

  function onVisit(site: DemoSite) {
    if (!controlled.paired) return;
    void controlled.visitSite(site.url, site.title, site.domain, site.risk);
  }

  const content = () => {
    if (!hydrated) {
      return (
        <div
          className="flex flex-1 items-center justify-center bg-background"
          aria-label="Loading Yat Lite"
        >
          <div className="h-8 w-8 animate-pulse rounded-lg bg-primary" />
        </div>
      );
    }

    if (recentsOpen) {
      return (
        <RecentsScreen
          recents={recents}
          onOpen={(id) => void openApp(id)}
          onClear={() => setRecents([])}
          onHome={goHome}
        />
      );
    }

    if (blockedApp) {
      return <BlockScreen appName={blockedApp} onHome={() => setBlockedApp(null)} />;
    }

    if (foregroundApp === null) {
      return <HomeScreen onOpenApp={(id) => void openApp(id)} busyApp={launching} />;
    }

    if (foregroundApp === "yat_lite") {
      return <YatLiteApp role={role} onSelectRole={selectRole} onHome={goHome} />;
    }

    if (foregroundApp === "chrome") {
      return <ChromeApp onVisit={onVisit} onHome={goHome} />;
    }

    return <SimulatedApp appId={foregroundApp} onHome={goHome} />;
  };

  return (
    <PhoneShell
      onBack={goBack}
      onHome={goHome}
      onRecents={() => setRecentsOpen((open) => !open)}
    >
      {content()}
    </PhoneShell>
  );
}

