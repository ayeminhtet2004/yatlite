import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { PhoneShell } from "@/components/phone/PhoneShell";
import { HomeScreen } from "@/components/phone/HomeScreen";
import { SimulatedApp } from "@/components/phone/SimulatedApp";
import { YatLiteApp } from "@/components/yat/YatLiteApp";
import { AuthProvider } from "@/hooks/useAuth";
import { loadRole, saveRole, type YatRole } from "@/lib/yat";

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
  const [foregroundApp, setForegroundApp] = useState<string | null>(null);
  const [role, setRole] = useState<YatRole | null>(null);

  useEffect(() => {
    setRole(loadRole());
  }, []);

  function selectRole(next: YatRole | null) {
    saveRole(next);
    setRole(next);
  }

  return (
    <AuthProvider>
      <PhoneShell>
        {foregroundApp === null && <HomeScreen onOpenApp={setForegroundApp} />}
        {foregroundApp === "yat_lite" && (
          <YatLiteApp role={role} onSelectRole={selectRole} onHome={() => setForegroundApp(null)} />
        )}
        {foregroundApp !== null && foregroundApp !== "yat_lite" && (
          <SimulatedApp appId={foregroundApp} onHome={() => setForegroundApp(null)} />
        )}
      </PhoneShell>
    </AuthProvider>
  );
}
