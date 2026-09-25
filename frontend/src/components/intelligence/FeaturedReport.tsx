"use client";

import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { ReportBadges } from "./ReportBadges";
import type { Report } from "@/types/intelligence";

/** Hero treatment for the Reports directory's top "Featured Report" slot —
 * reuses the `.report-card` gradient thumb at a larger size plus the
 * existing `.panel`/`.btn` primitives, no new visual system. */
export function FeaturedReport({ report: r }: { report: Report }) {
  const router = useRouter();
  return (
    <div className="panel" style={{ display: "flex", flexWrap: "wrap", overflow: "hidden" }}>
      <div style={{ flex: "1 1 220px", background: "linear-gradient(135deg,var(--navy-900),var(--green-dark))", minHeight: 160, position: "relative", display: "flex", alignItems: "flex-end", padding: 16 }}>
        <span className="rtag">{r.reportType}</span>
      </div>
      <div className="panel-pad" style={{ flex: "2 1 320px" }}>
        <ReportBadges badges={r.badges} />
        <h2 className="fs-19" style={{ margin: "10px 0 6px" }}>{r.title}</h2>
        <p className="db-text mb-12">{r.description}</p>
        <div className="flex gap-8 mb-16" style={{ flexWrap: "wrap" }}>
          <span className="tag">{r.origin === "USER_SUBMITTED" ? "Community Report" : "RUWĀD Report"}</span>
          <span className="tag">{r.category}</span>
          <span className="tag">{r.geography}</span>
          <span className="tag">{r.publicationDate}</span>
          <span className="tag">{r.readingTime}</span>
          <span className="tag">{r.pages} pages</span>
        </div>
        <button className="btn btn-primary" onClick={() => router.push(`/reports/${r.id}`)}>
          Read Report <RuwadIcon name="arrow" size={14} />
        </button>
      </div>
    </div>
  );
}
