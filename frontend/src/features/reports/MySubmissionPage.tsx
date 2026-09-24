"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/EmptyState";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { SessionLoading } from "@/components/workspace/SessionLoading";
import { useSession } from "@/hooks/use-store";
import { ApiError } from "@/lib/api/client";
import { fetchMySubmission, mySubmissionFileUrl, type MySubmission } from "@/lib/api/report-submissions";
import { StatusBadge, fmtDate } from "./MyReportsPage";

const safeHref = (url?: string | null) => { if (!url) return null; try { const u = new URL(url); return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null; } catch { return null; } };

/** One of the user's own submissions, read-only (a submission is locked once sent, so the reviewer sees exactly what was reviewed). */
export function MySubmissionPage({ id }: { id: string }) {
  const { loggedIn, hydrated } = useSession();
  const [sub, setSub] = useState<MySubmission | null>(null);
  const [error, setError] = useState<{ missing: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!hydrated || !loggedIn) return;
    let live = true;
    fetchMySubmission(id).then((s) => live && setSub(s)).catch((e) => live && setError({ missing: e instanceof ApiError && e.status === 404, message: e instanceof Error ? e.message : "Couldn't load this report." }));
    return () => { live = false; };
  }, [hydrated, loggedIn, id]);

  if (!hydrated) return <SessionLoading />;
  if (!loggedIn) return <WorkspaceGate title="Sign in to see your report" body="Sign in to see this report submission." />;
  if (error) return <EmptyState icon="help" title={error.missing ? "Report not found" : "Couldn't load this report"} body={error.missing ? "This submission doesn't exist or isn't yours." : error.message} action={<Link className="btn btn-outline" href="/my-reports">Back to My Reports</Link>} />;
  if (!sub) return <EmptyState icon="search" title="Loading…" body="" />;

  const reportHref = safeHref(sub.reportUrl);
  return (
    <div className="content-in" style={{ maxWidth: 820 }}>
      <nav className="fs-12 muted mb-16"><Link href="/my-reports">My Reports</Link> / {sub.title}</nav>
      <header className="mb-24">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
          <StatusBadge status={sub.status} />
          <span className="badge">{sub.reportType}</span><span className="badge">{sub.sector}</span><span className="badge">{sub.geography}</span>
        </div>
        <h1 className="fs-28" style={{ fontWeight: 800 }}>{sub.title}</h1>
        <p className="muted fs-13 mt-8">Submitted {fmtDate(sub.submittedAt)}{sub.reviewedAt ? ` · Reviewed ${fmtDate(sub.reviewedAt)}` : ""}</p>
      </header>

      {sub.status === "PENDING_REVIEW" && <div className="panel panel-pad mb-24"><p className="fs-13" style={{ margin: 0 }}>This report is waiting for review and is not visible to the public. We&apos;ll email you once it has been reviewed. It can&apos;t be edited while it is under review.</p></div>}
      {sub.status === "PUBLISHED" && sub.reportSlug && <div className="panel panel-pad mb-24"><p className="fs-13" style={{ margin: 0 }}>Approved and published. <Link href={`/reports/${sub.reportSlug}`} style={{ fontWeight: 600 }}>View it on RUWĀD</Link></p></div>}
      {sub.status === "REJECTED" && (
        <div className="panel panel-pad mb-24" style={{ borderColor: "var(--crit)" }}>
          <p className="fs-13" style={{ margin: 0 }}><b>This report was not approved for publication.</b></p>
          {sub.rejectionReason && <p className="fs-13 mt-8" style={{ whiteSpace: "pre-line", marginBottom: 0 }}><b>Reason:</b> {sub.rejectionReason}</p>}
        </div>
      )}

      {(sub.hasFile || reportHref) && (
        <div className="panel panel-pad mb-24" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          {sub.hasFile && <a className="btn btn-primary" href={mySubmissionFileUrl(sub.id)} target="_blank" rel="noopener noreferrer">Open my PDF</a>}
          {reportHref && <a className="btn btn-outline" href={reportHref} target="_blank" rel="noopener noreferrer">Visit report link</a>}
        </div>
      )}

      <section className="mb-24"><h2 className="fs-19 mb-8" style={{ fontWeight: 700 }}>Description</h2><p className="fs-14" style={{ whiteSpace: "pre-line" }}>{sub.description}</p></section>
      <section className="mb-24"><h2 className="fs-19 mb-8" style={{ fontWeight: 700 }}>Executive summary</h2><div className="panel panel-pad"><p className="fs-14" style={{ whiteSpace: "pre-line", margin: 0 }}>{sub.executiveSummary}</p></div></section>
      <p className="fs-13 muted mb-16">By {sub.authorName} · {sub.organizationName}</p>
      {sub.sources.length > 0 && (
        <section className="mb-24">
          <h2 className="fs-19 mb-8" style={{ fontWeight: 700 }}>Sources</h2>
          <ul style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
            {sub.sources.map((s, i) => { const href = safeHref(s.url); return <li key={i} className="fs-13">{href ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: "anywhere" }}>{s.title}</a> : s.title}</li>; })}
          </ul>
        </section>
      )}
    </div>
  );
}
