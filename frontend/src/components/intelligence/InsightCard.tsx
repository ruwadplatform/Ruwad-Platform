import type { ReactNode } from "react";

/** Wraps one chart/insight in the `.panel.panel-pad` card used throughout
 * `renderAnalyticsDetail()`'s `.insight-row` grid (js/analytics.js:43-54). */
export function InsightCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="panel panel-pad">
      {action ? (
        <div className="flex mb-16" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="fs-13" style={{ margin: 0 }}>{title}</h3>
          {action}
        </div>
      ) : (
        <h3 className="fs-13 mb-16">{title}</h3>
      )}
      {children}
    </div>
  );
}
