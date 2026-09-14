"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { SubmissionStatusBadge, SUBMISSION_STATUS_LABEL } from "@/components/workspace/SubmissionStatusBadge";
import { useSession } from "@/hooks/use-store";
import { fetchAdminSubmissions, fetchAdminSubmissionKpis } from "@/lib/api/submissions";
import { SCHEMAS } from "@/features/submissions/schemas";
import type { ApiSubmission, ApiSubmissionKind, ApiSubmissionKpis, ApiSubmissionStatus } from "@/lib/api/types";

const STATUS_FILTERS: ApiSubmissionStatus[] = ["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "DRAFT"];
const KIND_FILTERS: ApiSubmissionKind[] = ["STARTUP", "INVESTOR", "HUB", "RESEARCH", "MULTINATIONAL"];

export function AdminSubmissionsPage() {
  const { loggedIn, isAdmin } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<ApiSubmission[] | null>(null);
  const [kpis, setKpis] = useState<ApiSubmissionKpis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ApiSubmissionStatus | "">("");
  const [kind, setKind] = useState<ApiSubmissionKind | "">("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetchAdminSubmissionKpis().then((k) => { if (!cancelled) setKpis(k); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetchAdminSubmissions({ status: status || undefined, kind: kind || undefined, search: search || undefined, order: "desc" })
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load submissions"); });
    return () => { cancelled = true; };
  }, [isAdmin, status, kind, search]);

  const kpiCards = useMemo(() => ([
    { label: "Total", value: kpis?.total ?? 0 },
    { label: "Submitted", value: kpis?.SUBMITTED ?? 0 },
    { label: "Under Review", value: kpis?.UNDER_REVIEW ?? 0 },
    { label: "Changes Requested", value: kpis?.CHANGES_REQUESTED ?? 0 },
    { label: "Approved", value: kpis?.APPROVED ?? 0 },
    { label: "Rejected", value: kpis?.REJECTED ?? 0 },
  ]), [kpis]);

  if (!loggedIn) return <WorkspaceGate title="Sign in as an administrator" body="Sign in with an administrator account to review company submissions." />;
  if (!isAdmin) return <EmptyState icon="lock" title="Administrator access required" body="This area is limited to RUWĀD platform administrators." />;

  return (
    <div>
      <IntelligencePageHeader title="Company Submissions" description="Review company, investor, hub, research and multinational listing submissions." />

      <div className="stat-mini-row mt-20">
        {kpiCards.map((c) => (
          <div className="stat-mini" key={c.label}><div className="sm-label">{c.label}</div><div className="sm-val">{c.value}</div></div>
        ))}
      </div>

      <div className="toolbar mt-20">
        <div className="toolbar-search"><RuwadIcon name="search" size={14} /><input placeholder="Search by organization, reference or submitter" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select className="select" style={{ width: "auto" }} value={status} onChange={(e) => setStatus(e.target.value as ApiSubmissionStatus | "")}>
          <option value="">All Statuses</option>
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{SUBMISSION_STATUS_LABEL[s]}</option>)}
        </select>
        <select className="select" style={{ width: "auto" }} value={kind} onChange={(e) => setKind(e.target.value as ApiSubmissionKind | "")}>
          <option value="">All Types</option>
          {KIND_FILTERS.map((k) => <option key={k} value={k}>{SCHEMAS[k].label}</option>)}
        </select>
      </div>

      <div className="mt-16">
        {error ? (
          <EmptyState icon="help" title="Couldn't load submissions" body={error} />
        ) : rows === null ? (
          <EmptyState icon="reports" title="Loading submissions…" body="" />
        ) : !rows.length ? (
          <EmptyState icon="reports" title="No submissions match these filters." body="Try adjusting the status, type or search filters above." />
        ) : (
          <div className="panel scroll-x">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Submission</th><th>Organization</th><th>Type</th><th>Submitted By</th>
                  <th>Submitted Date</th><th>Status</th><th>Reviewer</th><th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} onClick={() => router.push(`/admin/submissions/${s.id}`)} style={{ cursor: "pointer" }}>
                    <td className="mono small">{s.id.slice(0, 8).toUpperCase()}</td>
                    <td><div className="cell-main">{s.title || "Untitled"}</div></td>
                    <td>{SCHEMAS[s.kind].label}</td>
                    <td className="mono small">{s.userId.slice(0, 8)}</td>
                    <td className="small">{s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : "—"}</td>
                    <td><SubmissionStatusBadge status={s.status} /></td>
                    <td className="mono small">{s.reviewedByUserId ? s.reviewedByUserId.slice(0, 8) : "—"}</td>
                    <td className="small">{new Date(s.updatedAt).toLocaleDateString()}</td>
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
