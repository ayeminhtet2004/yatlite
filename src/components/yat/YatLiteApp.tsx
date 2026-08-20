import { ControlledApp } from "./ControlledApp";
import { GuardianAuth } from "./GuardianAuth";
import { GuardianHome } from "./GuardianHome";
import { RoleSelect } from "./RoleSelect";
import { useAuth } from "@/hooks/useAuth";
import type { YatRole } from "@/lib/yat";


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
