"use client";

import { useRouter } from "next/navigation";
import { ReportBadges } from "./ReportBadges";
import type { Report } from "@/types/intelligence";

/** Ported from reportCard() (js/widgets.js:133-138) — `.report-card` with
 * `.rthumb`/`.rtag`/`.rbody`/`.rmeta` — extended with badges + compact
 * metadata (geography/sector/reading time/pages) per the Phase 3 spec,
 * without introducing new CSS beyond the existing card/tag/badge classes.
 * A community (user-submitted) report uses the same card: it shows the
 * author's organization instead of reading time/pages, plus a subtle tag. */
export function ReportCard({ report: r }: { report: Report }) {
  const router = useRouter();
  const community = r.origin === "USER_SUBMITTED";
  return (
    <div className="report-card" style={{ cursor: "pointer" }} onClick={() => router.push(`/reports/${r.id}`)}>
      <div className="rthumb"><span className="rtag">{r.reportType}</span></div>
      <div className="rbody">
        {r.badges.length > 0 && <div className="mb-8"><ReportBadges badges={r.badges} /></div>}
        <h4>{r.title}</h4>
        <p className="small muted mt-4" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.description}</p>
        {community && (r.organizationName || r.authors[0]) && (
          <div className="small muted mt-4">By {[r.authors[0], r.organizationName].filter(Boolean).join(" · ")}</div>
        )}
        <div className="rmeta">{r.geography} · {r.publicationDate}</div>
        <div className="flex gap-6 mt-8" style={{ flexWrap: "wrap" }}>
          <span className="tag">{community ? r.sector : r.category}</span>
          {community ? <span className="tag">Community Report</span> : (
            <>
              {r.readingTime && <span className="tag">{r.readingTime}</span>}
              {r.pages > 0 && <span className="tag">{r.pages} pages</span>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
