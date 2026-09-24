"use client";

import Link from "next/link";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { publishedReportFileUrl } from "@/lib/api/report-submissions";
import type { Report } from "@/types/intelligence";
import { ReportAdminBar } from "./ReportAdminPanel";

const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

/** Only http(s) links are ever rendered as links — the server checks too, this is the last line of defence. */
const safeHref = (url?: string | null) => {
  if (!url) return null;
  try { const u = new URL(url); return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null; } catch { return null; }
};

/** A community report approved for publication: what its author supplied, clearly attributed. */
export function UserReportView({ report: r }: { report: Report }) {
  const reportHref = safeHref(r.reportUrl);
  const links = (r.referenceLinks ?? []).map((s) => ({ ...s, href: safeHref(s.url) })).filter((s) => s.href);
  return (
    <div className="content-in wide" style={{ maxWidth: 900 }}>
      <nav className="fs-12 muted mb-16"><Link href="/reports">Reports</Link> / {r.title}</nav>

      <header className="mb-24">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <span className="badge">{r.reportType}</span>
          <span className="badge">{r.sector}</span>
          <span className="badge">{r.geography}</span>
          <span className="badge badge-warn">Community Report</span>
        </div>
        <h1 className="fs-28" style={{ fontWeight: 800 }}>{r.title}</h1>
        <p className="muted fs-13 mt-8">
          By {[r.authors[0], r.organizationName].filter(Boolean).join(" · ")} · Published on RUWĀD {fmtDate(r.publicationDate)}{r.reportDate ? ` · Report dated ${fmtDate(r.reportDate)}` : ""}
        </p>
        <ReportAdminBar report={r} />
      </header>

      <div className="panel panel-pad mb-24" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        {r.reportFileId && (
          <a className="btn btn-primary" href={publishedReportFileUrl(r.reportFileId)} target="_blank" rel="noopener noreferrer"><RuwadIcon name="doc" size={14} /> View / Open Report (PDF)</a>
        )}
        {reportHref && (
          <a className="btn btn-outline" href={reportHref} target="_blank" rel="noopener noreferrer"><RuwadIcon name="globe" size={14} /> Visit Report Source</a>
        )}
        {!r.reportFileId && !reportHref && <span className="muted fs-13">No report file or link is attached.</span>}
      </div>

      <section className="mb-24">
        <h2 className="fs-19 mb-12" style={{ fontWeight: 700 }}>Description</h2>
        <p className="fs-14" style={{ lineHeight: 1.6, whiteSpace: "pre-line" }}>{r.description}</p>
      </section>

      <section className="mb-24">
        <h2 className="fs-19 mb-12" style={{ fontWeight: 700 }}>Executive summary</h2>
        <div className="panel panel-pad"><p className="fs-14" style={{ lineHeight: 1.6, whiteSpace: "pre-line", margin: 0 }}>{r.executiveSummary}</p></div>
      </section>

      {links.length > 0 && (
        <section className="mb-24">
          <h2 className="fs-19 mb-12" style={{ fontWeight: 700 }}>Sources</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {links.map((s, i) => (
              <li key={`${s.url}-${i}`} className="panel panel-pad fs-13">
                <a href={s.href!} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{s.title}</a>
                <div className="muted fs-12" style={{ overflowWrap: "anywhere" }}>{s.href}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="muted fs-12">
        This report was submitted by its author and approved for publication by RUWĀD. RUWĀD has reviewed it for relevance but does not guarantee the accuracy of its content.
      </p>
    </div>
  );
}
