import type { DeviceRow } from "@/lib/yatApi";

export function DeviceSelector({
  devices,
  selectedId,
  onSelect,
}: {
  devices: DeviceRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (devices.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-3 text-[13px] text-muted-foreground">
        No controlled device paired yet.
      </p>
    );
  }

  return (
    <label className="block">
      <span className="sr-only">Controlled device</span>
      <select
        value={selectedId ?? ""}
        onChange={(e) => onSelect(e.target.value)}
        className="h-11 w-full rounded-2xl border border-border bg-card px-3 text-[14px] font-semibold text-card-foreground outline-none focus:border-primary"
      >
        {devices.map((device) => (
          <option key={device.id} value={device.id}>
            {device.device_name}
          </option>
        ))}
      </select>
    </label>
  );
}
