"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession } from "@/hooks/use-store";
import { fetchHistoricalConflicts, resolveHistoricalConflict, leaveHistoricalConflictUnresolved, type HistoricalEvidence } from "@/lib/api/ml-data";
import { ApiError } from "@/lib/api/client";

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");

function displayValue(e: HistoricalEvidence): string {
  if (e.valueNumeric != null) return `${e.valueNumeric.toLocaleString()}${e.currency ? ` ${e.currency}` : ""}`;
  if (e.valueBoolean != null) return e.valueBoolean ? "Yes" : "No";
  return e.valueText ?? "—";
}

function ConflictCompareModal({ a, b, onPrefer, onLeave, onCancel }: { a: HistoricalEvidence; b: HistoricalEvidence; onPrefer: (id: string, reason: string) => void; onLeave: (id: string, reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const rows: [string, (e: HistoricalEvidence) => string][] = [
    ["Value", displayValue],
    ["Source", (e) => e.sourceName ?? e.sourceType],
    ["Source Type", (e) => e.sourceType.replace(/_/g, " ")],
    ["Reliability", (e) => e.reliability],
    ["Verified", (e) => (e.verified ? "Yes" : "No")],
    ["Effective Date", (e) => e.effectiveDate],
  ];
  return (
    <div className="modal-box modal-box-pad">
      <h3 className="fs-14 mb-12">Evidence Conflict — {a.fieldKey}</h3>
      <div className="scroll-x">
        <div style={{ minWidth: 420 }}>
          <div className="cmp-head mb-8" style={{ gridTemplateColumns: "150px 1fr 1fr" }}>
            <div /><b>Source A</b><b>Source B</b>
          </div>
          <dl className="kv-grid cmp-grid" style={{ gridTemplateColumns: "150px 1fr 1fr" }}>
            {rows.map(([label, get]) => (
              <Fragment key={label}><dt>{label}</dt><dd>{get(a)}</dd><dd>{get(b)}</dd></Fragment>
            ))}
          </dl>
        </div>
      </div>
      <div className="field mt-12"><label>Reason</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this one?" /></div>
      <div className="flex gap-8 mt-16" style={{ flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-sm" disabled={!reason} onClick={() => onPrefer(a.id, reason)}>Prefer A</button>
        <button className="btn btn-primary btn-sm" disabled={!reason} onClick={() => onPrefer(b.id, reason)}>Prefer B</button>
        <button className="btn btn-outline btn-sm" disabled={!reason} onClick={() => onLeave(a.id, reason)}>Leave Unresolved</button>
        <button className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function AdminHistoricalConflictsPage() {
  const { loggedIn, isAdmin, hydrated } = useSession();
  const toast = useToast();
  const { openModal, closeModal } = useModal();

  const [evidence, setEvidence] = useState<HistoricalEvidence[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!isAdmin) return;
    fetchHistoricalConflicts().then(setEvidence).catch((e) => setError(errText(e)));
  }, [isAdmin]);
  useEffect(load, [load]);

  if (!hydrated) return <div className="mt-20"><EmptyState icon="reports" title="Loading…" body="" /></div>;
  if (!loggedIn) return <WorkspaceGate title="Sign in as an administrator" body="Sign in with an administrator account to review evidence conflicts." />;
  if (!isAdmin) return <EmptyState icon="lock" title="Administrator access required" body="This area is limited to RUWĀD platform administrators." />;
  if (error) return <div className="mt-20"><EmptyState icon="help" title="Couldn't load conflicts" body={error} /></div>;

  // Group conflicting rows by startup + field + effectiveDate — exactly
  // the key HistoricalEvidenceService uses to detect them.
  const groups = new Map<string, HistoricalEvidence[]>();
  for (const e of evidence ?? []) {
    const key = `${e.startupId}|${e.fieldKey}|${e.effectiveDate}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  return (
    <div>
      <IntelligencePageHeader
        title="Evidence Conflicts"
        description="Two sources disagree about the same fact on the same date. Both are preserved — choose which to prefer, or leave it unresolved."
        action={<Link className="btn btn-outline btn-sm" href="/admin/ml-data/historical">Back to Historical Data</Link>}
      />

      <div className="panel panel-pad mt-16">
        {evidence === null ? (
          <p className="small muted">Loading…</p>
        ) : groups.size === 0 ? (
          <p className="small muted">No unresolved evidence conflicts.</p>
        ) : (
          <div className="scroll-x">
            <table className="data-table">
              <thead><tr><th>Field</th><th>Effective Date</th><th>Values in Conflict</th><th></th></tr></thead>
              <tbody>
                {[...groups.entries()].map(([key, rows]) => {
                  const [, field, date] = key.split("|");
                  const [a, b] = rows;
                  return (
                    <tr key={key}>
                      <td className="small">{field}</td>
                      <td className="small">{date}</td>
                      <td className="small">{rows.map(displayValue).join(" vs. ")}</td>
                      <td>
                        {b ? (
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => openModal(
                              <ConflictCompareModal
                                a={a} b={b}
                                onCancel={closeModal}
                                onPrefer={async (id, reason) => { closeModal(); try { await resolveHistoricalConflict(id, reason); toast("Conflict resolved"); load(); } catch (e) { toast(errText(e)); } }}
                                onLeave={async (id, reason) => { closeModal(); try { await leaveHistoricalConflictUnresolved(id, reason); toast("Left unresolved"); load(); } catch (e) { toast(errText(e)); } }}
                              />,
                              "wide",
                            )}
                          >
                            Review
                          </button>
                        ) : <span className="small muted">1 source only</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
