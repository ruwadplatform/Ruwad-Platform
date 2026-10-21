import type { ReactNode } from "react";

/** The compact label + value card (`.stat-mini`) used for key facts on profiles, account pages and admin panels.
 * One component so every page renders it identically; `size` picks the value's font size where a long value
 * (an email, a date range) needs to be smaller than the default. */
export function StatCard({ label, value, size }: { label: ReactNode; value: ReactNode; size?: 13 | 15 | 16 }) {
  return (
    <div className="stat-mini">
      <div className="sm-label">{label}</div>
      <div className={`sm-val${size ? ` fs-${size}` : ""}`}>{value}</div>
    </div>
  );
}
