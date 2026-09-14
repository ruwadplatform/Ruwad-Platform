import type { ReactNode } from "react";

/** Small eyebrow + heading used to introduce a group of cards within an
 * Intelligence page (e.g. "Featured Report", "Latest Intelligence",
 * "Sector Reports") — encodes actual grouping, not decoration. */
export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex mb-16" style={{ justifyContent: "space-between", alignItems: "center" }}>
      <h3 className="fs-15" style={{ margin: 0 }}>{title}</h3>
      {action}
    </div>
  );
}
