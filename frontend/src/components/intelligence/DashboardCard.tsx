"use client";

import { useRouter } from "next/navigation";
import { RuwadIcon, type RuwadIconName } from "@/components/icons/ruwad-icon";
import type { DashboardMeta } from "@/types/intelligence";

/** Ported from `renderAnalyticsHub()`'s `.category-card` (js/analytics.js:
 * 14-26, css/directories.css:8-14) — extended with a KPI preview and
 * last-updated label per the Phase 3 spec. */
export function DashboardCard({ dashboard: d, icon }: { dashboard: DashboardMeta; icon: RuwadIconName }) {
  const router = useRouter();
  return (
    <button className="category-card" onClick={() => router.push(`/analytics/${d.id}`)}>
      <div className="cc-icon"><RuwadIcon name={icon} size={17} /></div>
      <b>{d.title}</b>
      <span>{d.description}</span>
      <div className="flex gap-6 mt-12" style={{ flexWrap: "wrap" }}>
        <span className="tag">{d.geography}</span>
        <span className="tag">{d.sector}</span>
      </div>
      <div className="stat-mini mt-12" style={{ padding: 0, border: "none", background: "none" }}>
        <div className="sm-label">{d.kpiPreview.label}</div>
        <div className="sm-val">{d.kpiPreview.value}</div>
      </div>
      <div className="small muted mt-8">Updated {d.lastUpdated}</div>
    </button>
  );
}
