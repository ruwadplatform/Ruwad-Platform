"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { SessionLoading } from "@/components/workspace/SessionLoading";
import { useSession } from "@/hooks/use-store";
import { fetchMySubmissions, STATUS_LABEL, type MySubmission, type SubmissionStatus } from "@/lib/api/report-submissions";

export const STATUS_CLASS: Record<SubmissionStatus, string> = { PENDING_REVIEW: "badge-warn", PUBLISHED: "badge-good", REJECTED: "badge-crit" };
export const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  return <span className={`badge ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

/** The signed-in user's own report publication requests. */
export function MyReportsPage() {
  const { loggedIn, hydrated } = useSession();
  const [rows, setRows] = useState<MySubmission[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hydrated || !loggedIn) return;
    let live = true;
    fetchMySubmissions().then((r) => live && setRows(r)).catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't load your reports."));
    return () => { live = false; };
  }, [hydrated, loggedIn]);

  if (!hydrated) return <SessionLoading />;
  if (!loggedIn) return <WorkspaceGate title="Sign in to see your reports" body="Sign in to see the reports you've submitted for publication and where each one stands." />;

  return (
    <div>
      <IntelligencePageHeader
        title="My Reports"
        description="Reports you've submitted for publication on RUWĀD, and their review status."
        action={<Link className="btn btn-primary" href="/reports/submit"><RuwadIcon name="plus" size={14} /> Publish Report</Link>}
      />
      <div className="mt-20">
        {error ? <EmptyState icon="help" title="Couldn't load your reports" body={error} />
          : rows === null ? <EmptyState icon="search" title="Loading…" body="" />
          : !rows.length ? <EmptyState icon="reports" title="You haven't submitted any reports yet" body="Submit a report and it will appear here while RUWĀD reviews it." action={<Link className="btn btn-primary" href="/reports/submit">Publish Report</Link>} />
          : (
            <div className="panel" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", minWidth: 480 }}>
                <thead><tr style={{ textAlign: "left" }}><th style={{ padding: 12 }}>Report Title</th><th>Submitted</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: 12 }}><Link href={`/my-reports/${r.id}`} style={{ fontWeight: 600 }}>{r.title}</Link><div className="muted fs-12">{r.reportType} · {r.sector} · {r.geography}</div></td>
                      <td>{fmtDate(r.submittedAt)}</td>
                      <td><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}
