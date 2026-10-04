"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession } from "@/hooks/use-store";
import { ApiError } from "@/lib/api/client";
import {
  fetchReviewDetail, fetchReviewQueue, reviewHistoricalEntry,
  type HistoricalReviewStatus, type ReviewAction, type ReviewDetail, type ReviewQueueRow,
} from "@/lib/api/historical-performance";
import { KIND_LABEL, summarizeEntry } from "@/features/workspace/historical-entry-forms";

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");
const STATUSES: HistoricalReviewStatus[] = ["PENDING_REVIEW", "CHANGES_REQUESTED", "VERIFIED", "REJECTED"];
const show = (v: unknown) => (v === undefined || v === null ? "—" : typeof v === "number" ? v.toLocaleString() : String(v));

function ReviewModal({ detail, onDone, onCancel }: { detail: ReviewDetail; onDone: (action: ReviewAction, opts: { notes?: string; documentValidated?: boolean; confirmNotDuplicate?: boolean }) => void; onCancel: () => void }) {
  const [notes, setNotes] = useState("");
  const [documentValidated, setDocumentValidated] = useState(false);
  const [confirmNotDuplicate, setConfirmNotDuplicate] = useState(false);
  const s = detail.submission;
  const pending = s.reviewStatus === "PENDING_REVIEW";
  const hasDoc = !!detail.supportingDocument;
  const flagged = detail.duplicates.length > 0;
  const exact = detail.duplicates.some((d) => d.match === "EXACT");
  const rows: [string, string][] = [
    ["Company", `${detail.startup.name} (${detail.startup.category})`],
    ["Entry", `${KIND_LABEL[s.kind]} — ${summarizeEntry(s.kind, s.payload)}`],
    ["Effective date", s.effectiveDate],
    ["Submitted source", s.source.replace(/_/g, " ").toLowerCase()],
    ["If verified, stored as", detail.provenance.wouldBecome],
    ["Supporting document", detail.supportingDocument ? `${detail.supportingDocument.name}${detail.supportingDocument.type ? ` (${detail.supportingDocument.type.replace(/_/g, " ").toLowerCase()})` : ""} — ${detail.supportingDocument.onFile ? "on file" : "not on file"}` : "None"],
    ["Founder's note", s.founderNote ?? "—"],
  ];
  const planned = detail.plannedWrites;
  return (
    <div className="modal-box modal-box-pad">
      <h3 className="fs-14 mb-12">Review historical entry</h3>
      <dl className="kv-grid" style={{ gridTemplateColumns: "170px 1fr" }}>
        {rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
      </dl>

      <h4 className="fs-12 muted mt-16 mb-8">Approving would write</h4>
      <ul className="small" style={{ paddingLeft: 18 }}>
        {planned.evidence.map((e, i) => <li key={i}>Evidence: {e.fieldKey} = {show(e.valueNumeric ?? e.valueText)}{e.currency ? ` ${e.currency}` : ""} effective {e.effectiveDate}</li>)}
        {planned.event && <li>Outcome event: {planned.event.eventType} on {planned.event.eventDate}{planned.event.valueText ? ` (${planned.event.valueText})` : ""}{planned.event.valueNumeric != null ? `, ${show(planned.event.valueNumeric)} SAR` : ""}</li>}
        {planned.applicability && <li>Applicability: {planned.applicability.featureKey} is {planned.applicability.status.replace(/_/g, " ").toLowerCase()} from {planned.applicability.effectiveDate}{planned.applicability.reason ? ` — ${planned.applicability.reason}` : ""}</li>}
        {planned.career && <li>Founder career anchor: {planned.career.founderName}, from {planned.career.careerStartYear}</li>}
        {planned.coverage && <li>Coverage attestation: {planned.coverage.coverageType} through {planned.coverage.coverageThrough}</li>}
        {!planned.evidence.length && !planned.event && !planned.applicability && !planned.career && !planned.coverage && <li>Nothing feeds a feature (stored for reference only).</li>}
      </ul>
      {planned.notes.length > 0 && <ul className="small muted mt-8" style={{ paddingLeft: 18 }}>{planned.notes.map((n) => <li key={n}>{n}</li>)}</ul>}

      {detail.conflicts.length > 0 && (
        <div className="mt-12" style={{ borderLeft: "3px solid var(--warn)", paddingLeft: 10 }}>
          <b className="small">Conflicts with existing evidence (both sides will be kept)</b>
          <ul className="small" style={{ paddingLeft: 18 }}>
            {detail.conflicts.map((c, i) => <li key={i}>{c.fieldKey} on {c.effectiveDate}: on file {show(c.existingValue)} ({c.existingSource.replace(/_/g, " ").toLowerCase()}{c.existingVerified ? ", verified" : ", unverified"}) vs. this entry {show(c.newValue)}</li>)}
          </ul>
        </div>
      )}
      {flagged && (
        <div className="mt-12" style={{ borderLeft: "3px solid var(--crit)", paddingLeft: 10 }}>
          <b className="small">{exact ? "This round is already on file" : "A similar funding round is already on file"}</b>
          <ul className="small" style={{ paddingLeft: 18 }}>{detail.duplicates.map((d) => <li key={d.id}>{d.match.toLowerCase()} match · {d.source.replace(/_/g, " ").toLowerCase()} · {d.date}{d.round ? ` · ${d.round}` : ""}{d.amount != null ? ` · ${show(d.amount)}` : ""}</li>)}</ul>
        </div>
      )}

      {pending && (
        <>
          <div className="field mt-16"><label>Notes (required to reject or request a correction)</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {hasDoc && (
            <label className="small flex gap-8 mt-8" style={{ alignItems: "center" }}>
              <input type="checkbox" checked={documentValidated} onChange={(e) => setDocumentValidated(e.target.checked)} /> I checked the supporting document against this entry (stores it as Verified document)
            </label>
          )}
          {flagged && !exact && (
            <label className="small flex gap-8 mt-8" style={{ alignItems: "center" }}>
              <input type="checkbox" checked={confirmNotDuplicate} onChange={(e) => setConfirmNotDuplicate(e.target.checked)} /> This is a different round, not a duplicate
            </label>
          )}
        </>
      )}
      <div className="flex gap-8 mt-16" style={{ flexWrap: "wrap" }}>
        {pending && <button className="btn btn-primary btn-sm" disabled={exact || (flagged && !confirmNotDuplicate)} onClick={() => onDone("VERIFY", { notes, documentValidated, confirmNotDuplicate })}>Verify</button>}
        {pending && <button className="btn btn-outline btn-sm" disabled={!notes.trim()} onClick={() => onDone("REQUEST_CORRECTION", { notes })}>Request correction</button>}
        {(pending || s.reviewStatus === "CHANGES_REQUESTED") && <button className="btn btn-outline btn-sm" disabled={!notes.trim()} onClick={() => onDone("REJECT", { notes })}>Reject</button>}
        <button className="btn btn-outline btn-sm" onClick={onCancel}>Close</button>
      </div>
    </div>
  );
}

export function AdminHistoricalReviewPage() {
  const { loggedIn, isAdmin, hydrated } = useSession();
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const [status, setStatus] = useState<HistoricalReviewStatus>("PENDING_REVIEW");
  const [rows, setRows] = useState<ReviewQueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!isAdmin) return;
    fetchReviewQueue(status).then(setRows).catch((e) => setError(errText(e)));
  }, [isAdmin, status]);
  useEffect(load, [load]);

  async function open(id: string) {
    try {
      const detail = await fetchReviewDetail(id);
      openModal(
        <ReviewModal
          detail={detail}
          onCancel={closeModal}
          onDone={async (action, opts) => {
            closeModal();
            try {
              const r = await reviewHistoricalEntry(id, { action, ...opts });
              toast(action === "VERIFY" ? `Verified${r.conflictsCreated ? ` — ${r.conflictsCreated} conflict(s) kept for resolution` : ""}` : action === "REJECT" ? "Rejected" : "Correction requested");
              load();
            } catch (e) { toast(errText(e)); }
          }}
        />,
        "wide",
      );
    } catch (e) { toast(errText(e)); }
  }

  if (!hydrated) return <div className="mt-20"><EmptyState icon="reports" title="Loading…" body="" /></div>;
  if (!loggedIn) return <WorkspaceGate title="Sign in as an administrator" body="Sign in with an administrator account to review historical entries." />;
  if (!isAdmin) return <EmptyState icon="lock" title="Administrator access required" body="This area is limited to RUWĀD platform administrators." />;
  if (error) return <div className="mt-20"><EmptyState icon="help" title="Couldn't load the review queue" body={error} /></div>;

  return (
    <div>
      <IntelligencePageHeader
        title="Historical Entry Review"
        description="Founder-submitted history waits here. Nothing is used for a snapshot or label until you verify it, and conflicting evidence is always kept."
        action={<Link className="btn btn-outline btn-sm" href="/admin/ml-data">Back to ML Data</Link>}
      />
      <div className="panel panel-pad mt-16">
        <div className="flex gap-8 mb-12" style={{ flexWrap: "wrap" }}>
          {STATUSES.map((s) => <button key={s} className={`btn btn-sm ${s === status ? "btn-primary" : "btn-outline"}`} onClick={() => { setRows(null); setStatus(s); }}>{s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</button>)}
        </div>
        {rows === null ? <p className="small muted">Loading…</p> : rows.length === 0 ? <p className="small muted">Nothing here.</p> : (
          <div className="scroll-x">
            <table className="data-table">
              <thead><tr><th>Company</th><th>Type</th><th>Entry</th><th>Effective</th><th>Source</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="small">{r.startupName ?? r.startupId.slice(0, 8)}</td>
                    <td className="small">{KIND_LABEL[r.kind]}</td>
                    <td className="small">{summarizeEntry(r.kind, r.payload)}</td>
                    <td className="small">{r.effectiveDate}</td>
                    <td className="small">{r.source.replace(/_/g, " ").toLowerCase()}{r.supportingDocumentId ? " · document" : ""}</td>
                    <td><button className="btn btn-outline btn-sm" onClick={() => open(r.id)}>{r.reviewStatus === "PENDING_REVIEW" ? "Review" : "View"}</button></td>
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
