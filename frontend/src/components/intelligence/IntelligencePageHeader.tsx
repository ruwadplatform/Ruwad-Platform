import type { ReactNode } from "react";

/** Shared `.page-head` title/description block used across Reports,
 * Dashboards and News & Events — same shape the directory pages already
 * use, kept as one component since it's identical across all three. */
export function IntelligencePageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
      <div className="page-head"><h2>{title}</h2><p className="muted small">{description}</p></div>
      {action}
    </div>
  );
}
