import { GuardianAuth } from "./GuardianAuth";
import { GuardianHome } from "./GuardianHome";
import { RoleSelect } from "./RoleSelect";
import { useAuth } from "@/hooks/useAuth";
import type { YatRole } from "@/lib/yat";

function ControlledIntro({ onHome, onChangeRole }: { onHome: () => void; onChangeRole: () => void }) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-8 pt-4">
      <button
        type="button"
        onClick={onHome}
        className="mb-8 self-start text-[13px] font-medium text-muted-foreground"
      >
        ← Home
      </button>
      <h1 className="text-[24px] font-semibold tracking-tight text-foreground">Connect Device</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Enter the code shown on the Guardian's device.
      </p>
      <div className="mt-8 rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center">
        <p className="text-[15px] font-semibold text-card-foreground">Pairing arrives next</p>
        <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
          This device is set as a Controlled Device. Pairing is built in the next phase.
        </p>
      </div>
      <button
        type="button"
        onClick={onChangeRole}
        className="mt-6 text-center text-[13px] font-medium text-primary"
      >
        Change device role
      </button>
    </div>
  );
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

  if (!role) return <RoleSelect onSelect={onSelectRole} onHome={onHome} />;

  if (role === "controlled") {
    return <ControlledIntro onHome={onHome} onChangeRole={() => onSelectRole(null)} />;
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
