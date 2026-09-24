"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/EmptyState";
import { ApiError } from "@/lib/api/client";
import { acceptReview, fetchReviewInfo, rejectReview, reviewFileUrl, type ReviewInfo } from "@/lib/api/report-submissions";

const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const safeHref = (url?: string | null) => { if (!url) return null; try { const u = new URL(url); return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null; } catch { return null; } };

type Mode = "accept" | "reject" | undefined;
type Outcome = { kind: "accepted"; slug: string | null; title: string } | { kind: "rejected"; title: string };

/** Where the Accept / Reject buttons in the review email land. Opening this page only READS the request: nothing is
 * published or rejected until the reviewer presses the Confirm button, which sends an explicit POST. */
export function ReportReviewPage({ token, action }: { token: string; action?: "accept" | "reject" }) {
  const [info, setInfo] = useState<ReviewInfo | null>(null);
  const [problem, setProblem] = useState<{ status: number; message: string } | null>(null);
  const [mode, setMode] = useState<Mode>(action);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    let live = true;
    fetchReviewInfo(token).then((i) => live && setInfo(i)).catch((e) => live && setProblem({ status: e instanceof ApiError ? e.status : 0, message: e instanceof Error ? e.message : "Couldn't load this request." }));
    return () => { live = false; };
  }, [token]);

  async function confirm() {
    if (busy || !mode) return;
    setBusy(true); setError("");
    try {
      if (mode === "accept") { const r = await acceptReview(token); setOutcome({ kind: "accepted", slug: r.reportSlug, title: r.title }); }
      else { const r = await rejectReview(token, reason); setOutcome({ kind: "rejected", title: r.title }); }
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 404 || status === 409 || status === 410) setProblem({ status, message: e instanceof Error ? e.message : "" });
      else { setError(e instanceof Error ? e.message : "Something went wrong. Nothing was changed. Please try again."); setBusy(false); }
    }
  }

  if (outcome) {
    return (
      <div className="content-in" style={{ maxWidth: 560 }}>
        <div className="panel panel-pad" style={{ textAlign: "center", padding: 32 }}>
          <h2 className="fs-19" style={{ fontWeight: 700 }}>{outcome.kind === "accepted" ? "Report published" : "Report rejected"}</h2>
          <p className="muted fs-14 mt-8">
            {outcome.kind === "accepted" ? `“${outcome.title}” is now visible on RUWĀD, and the author has been notified.` : `“${outcome.title}” stays private, and the author has been notified.`}
          </p>
          {outcome.kind === "accepted" && outcome.slug && <Link className="btn btn-primary mt-16" href={`/reports/${outcome.slug}`}>View the published report</Link>}
        </div>
      </div>
    );
  }

  if (problem) {
    const title = problem.status === 410 ? "This link has expired" : problem.status === 409 ? "Nothing to review here" : problem.status === 404 ? "This link isn't valid" : "Couldn't load this request";
    return <div className="content-in wide"><EmptyState icon="help" title={title} body={problem.message || "Please check the link in your email, or ask an admin to send a new one."} /></div>;
  }
  if (!info) return <div className="content-in wide"><EmptyState icon="search" title="Loading…" body="" /></div>;

  const reportHref = safeHref(info.reportUrl);
  return (
    <div className="content-in" style={{ maxWidth: 820 }}>
      <div className="page-head mb-16">
        <h2>Review Report</h2>
        <p className="muted small">A user has asked RUWĀD to publish this report. Read it below, then confirm your decision. Nothing changes until you confirm.</p>
      </div>

      <section className="panel panel-pad mb-16">
        <h1 className="fs-19" style={{ fontWeight: 800, marginTop: 0 }}>{info.title}</h1>
        <dl style={{ display: "grid", gridTemplateColumns: "minmax(110px,180px) 1fr", gap: "8px 12px", margin: "12px 0 0", fontSize: 13 }}>
          <dt className="muted">Author</dt><dd style={{ margin: 0 }}>{info.authorName}</dd>
          <dt className="muted">Organization</dt><dd style={{ margin: 0 }}>{info.organizationName}</dd>
          <dt className="muted">Report type</dt><dd style={{ margin: 0 }}>{info.reportType}</dd>
          <dt className="muted">Sector</dt><dd style={{ margin: 0 }}>{info.sector}</dd>
          <dt className="muted">Geography</dt><dd style={{ margin: 0 }}>{info.geography}</dd>
          {info.publicationDate && <><dt className="muted">Publication date</dt><dd style={{ margin: 0 }}>{fmtDate(info.publicationDate)}</dd></>}
          <dt className="muted">Submitted</dt><dd style={{ margin: 0 }}>{fmtDate(info.submittedAt)}</dd>
        </dl>
      </section>

      <section className="panel panel-pad mb-16"><h3 className="fs-15 mb-8" style={{ fontWeight: 700 }}>Description</h3><p className="fs-14" style={{ whiteSpace: "pre-line", margin: 0 }}>{info.description}</p></section>
      <section className="panel panel-pad mb-16"><h3 className="fs-15 mb-8" style={{ fontWeight: 700 }}>Executive summary</h3><p className="fs-14" style={{ whiteSpace: "pre-line", margin: 0 }}>{info.executiveSummary}</p></section>

      <section className="panel panel-pad mb-16" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <h3 className="fs-15" style={{ fontWeight: 700, margin: 0, width: "100%" }}>The report</h3>
        {info.hasFile && <a className="btn btn-primary" href={reviewFileUrl(token)} target="_blank" rel="noopener noreferrer">Open uploaded PDF</a>}
        {reportHref && <a className="btn btn-outline" href={reportHref} target="_blank" rel="noopener noreferrer">Open report link</a>}
        {!info.hasFile && !reportHref && <span className="muted fs-13">No file or link was provided.</span>}
      </section>

      {info.sources.length > 0 && (
        <section className="panel panel-pad mb-16">
          <h3 className="fs-15 mb-8" style={{ fontWeight: 700 }}>Sources</h3>
          <ul style={{ paddingLeft: 18, display: "grid", gap: 6, margin: 0 }}>
            {info.sources.map((s, i) => { const href = safeHref(s.url); return <li key={i} className="fs-13">{href ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: "anywhere" }}>{s.title}</a> : s.title}{href ? <span className="muted"> — {href}</span> : null}</li>; })}
          </ul>
        </section>
      )}

      <section className="panel panel-pad mb-16" aria-label="Decision">
        {error && <div className="field err" role="alert" style={{ display: "flex", marginBottom: 12 }}>{error}</div>}
        {!mode && (
          <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-lg" onClick={() => setMode("accept")}>Accept Report</button>
            <button className="btn btn-lg" style={{ background: "var(--crit)", color: "#fff" }} onClick={() => setMode("reject")}>Reject Report</button>
          </div>
        )}
        {mode === "accept" && (
          <>
            <p className="fs-14 mb-12"><b>Accept this report?</b> It will be published immediately and shown to everyone on the Reports page. The author will be emailed.</p>
            <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
              <button className="btn btn-primary btn-lg" onClick={confirm} disabled={busy}>{busy ? "Publishing…" : "Confirm Accept"}</button>
              <button className="btn btn-ghost btn-lg" onClick={() => setMode(undefined)} disabled={busy}>Back</button>
            </div>
          </>
        )}
        {mode === "reject" && (
          <>
            <p className="fs-14 mb-12"><b>Reject this report?</b> It stays private and the author will be emailed.</p>
            <div className="field">
              <label htmlFor="reject-reason">Rejection reason (optional, shown to the author)</label>
              <textarea id="reject-reason" className="textarea" rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
              <button className="btn btn-lg" style={{ background: "var(--crit)", color: "#fff" }} onClick={confirm} disabled={busy}>{busy ? "Rejecting…" : "Confirm Reject"}</button>
              <button className="btn btn-ghost btn-lg" onClick={() => setMode(undefined)} disabled={busy}>Back</button>
            </div>
          </>
        )}
        <p className="fs-11 muted mt-12" style={{ marginBottom: 0 }}>This link works once and expires on {fmtDate(info.expiresAt)}.</p>
      </section>
    </div>
  );
}
