import type { SystemStatus } from "../types/status";

export function StatusCard({ label, value, pending }: SystemStatus) {
  return (
    <div className="status-card">
      <span
        className={`status-dot${pending ? " pending" : ""}`}
        aria-hidden="true"
      />
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    </div>
  );
}
