import { useState } from "react";

import { ControlledApp } from "./ControlledApp";
import { GuardianAuth } from "./GuardianAuth";
import { GuardianHome } from "./GuardianHome";
import { RoleSelect } from "./RoleSelect";
import { WelcomeScreen } from "./WelcomeScreen";
import { useAuth } from "@/hooks/useAuth";
import type { YatRole } from "@/lib/yat";

const WELCOME_KEY = "yat_lite_welcome_completed";

function welcomeCompleted() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(WELCOME_KEY) === "true";
}

export function YatLiteApp({
  role,
  onSelectRole,
  onHome,
}: {
  role: YatRole | null;
  onSelectRole: (role: YatRole | null) => void;
  onHome: () => void;
}) {
  const { loading, session } = useAuth();
  const [welcomeDone, setWelcomeDone] = useState(() => welcomeCompleted());

  // Lightweight first-run gate: only shown before the existing role selection.
  if (!role && !welcomeDone) {
    return (
      <WelcomeScreen
        onGetStarted={() => {
          window.localStorage.setItem(WELCOME_KEY, "true");
          setWelcomeDone(true);
        }}
      />
    );
  }

  if (!role) return <RoleSelect onSelect={onSelectRole} onHome={onHome} />;

  if (role === "controlled") {
    return <ControlledApp onHome={onHome} onChangeRole={() => onSelectRole(null)} />;
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!session) return <GuardianAuth onBack={() => onSelectRole(null)} />;

  return <GuardianHome onHome={onHome} />;
}
