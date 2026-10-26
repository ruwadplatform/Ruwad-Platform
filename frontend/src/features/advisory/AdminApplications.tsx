"use client";

import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/EmptyState";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { downloadApplicationDocument, fetchAdminApplication, fetchAdminApplications, reviewAdvisor } from "@/lib/api/advisory";
import { formatBytes } from "@/lib/api/data-room-files";
import { errText, formatWhen } from "./booking-format";
import type { AdvisorReviewStatus, ApplicationDetail, ApplicationFilter } from "./advisory-types";
import { useAsync } from "./use-async";

export const MIN_REJECTION_REASON = 10;
const STATUS: Record<AdvisorReviewStatus, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "adv-badge-muted" },
  PENDING_REVIEW: { label: "Pending review", cls: "adv-badge-warn" },
  APPROVED: { label: "Approved", cls: "adv-badge-good" },
  REJECTED: { label: "Rejected", cls: "adv-badge-crit" },
  SUSPENDED: { label: "Suspended", cls: "adv-badge-crit" },
};
const FILTERS: { id: ApplicationFilter; label: string }[] = [
  { id: "PENDING_REVIEW", label: "Pending Review" },
  { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
  { id: "ALL", label: "All Applications" },
];
const DOC_LABEL = { CV: "CV or resume", CERTIFICATE: "Professional certificate", PHOTO: "Profile photograph" } as const;

/** Admin → Advisory Management → Applications. Everything applicants submit through "Become an Advisor", filtered by status, with the full
 * application one click away. Decisions are made inside the application so the reviewer always has the details in front of them. */
export function ApplicationsTab({ onChanged }: { onChanged?: () => void }) {
  const { openModal } = useModal();
  const [filter, setFilter] = useState<ApplicationFilter>("PENDING_REVIEW");
  const [tick, setTick] = useState(0);
  const res = useAsync(`admapps|${filter}|${tick}`, () => fetchAdminApplications(filter));
  const counts = useAsync(`admappcounts|${tick}`, () => fetchAdminApplications("ALL"));
  const reload = () => { setTick((t) => t + 1); onChanged?.(); };
  const count = (id: ApplicationFilter) => counts.data?.counts[id];

  return (
    <>
      <div className="adv-chips" role="group" aria-label="Filter applications by status">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={`adv-chip${filter === f.id ? " is-active" : ""}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}{count(f.id) !== undefined && <span className="adv-tab-count">{count(f.id)}</span>}
          </button>
        ))}
      </div>
      <div className="mt-16">
        {res.error ? <ErrorState title="Couldn't load applications" body={res.error} />
          : !res.data ? <LoadingState title="Loading applications…" />
          : res.data.applications.length === 0 ? <EmptyState icon="user" title={filter === "ALL" ? "No applications yet" : "No applications here"} body={filter === "PENDING_REVIEW" ? "New advisor applications waiting for review will appear here." : "Applications with this status will appear here."} />
          : (
            <div className="panel scroll-x">
              <table className="data-table adv-apps-table">
                <thead><tr><th>Applicant</th><th>Institution</th><th>Specialization</th><th>Email</th><th>Applied</th><th>Status</th><th><span className="adv-sr">Actions</span></th></tr></thead>
                <tbody>
                  {res.data.applications.map((a) => (
                    <tr key={a.id}>
                      <td><div className="cell-main">{a.name}</div>{a.reference && <div className="muted small">{a.reference}</div>}{a.resubmissions > 0 && <span className="badge adv-badge-info adv-resub">Resubmitted</span>}</td>
                      <td className="small">{a.institution}</td>
                      <td className="small">{a.specialization}</td>
                      <td className="small adv-breakall">{a.email ?? "—"}</td>
                      <td className="small adv-nowrap">{formatWhen(a.submittedAt).split(" · ")[0]}</td>
                      <td><span className={`badge ${STATUS[a.status].cls}`}>{STATUS[a.status].label}</span></td>
                      <td><button type="button" className="btn btn-outline btn-sm" onClick={() => openModal(<ApplicationModal id={a.id} onChanged={reload} />, "xwide")}>View Application</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="adv-kv"><dt>{label}</dt><dd>{children}</dd></div>;
}

const link = (url: string | null) => (url ? <a href={url} target="_blank" rel="noopener noreferrer nofollow">{url}</a> : "—");

/** What an event in the history reads as, in plain words. Email attempts say plainly whether anything was actually sent. */
export function historyText(e: ApplicationDetail["history"][number]): string {
  if (e.type === "SUBMITTED") return "Application submitted";
  if (e.type === "RESUBMITTED") return `Application updated and resubmitted${(e.details as { attempt?: number } | null)?.attempt ? ` (submission ${(e.details as { attempt: number }).attempt})` : ""}`;
  if (e.type === "APPROVED") return "Approved";
  if (e.type === "REJECTED") return "Rejected";
  if (e.type === "SUSPENDED") return "Suspended";
  if (e.type === "NOTIFICATION") {
    const d = (e.details ?? {}) as { kind?: string; mode?: string; result?: string; subject?: string };
    const who = d.kind === "ADMIN_NEW_APPLICATION" ? "Notification to RUWĀD" : d.kind === "ADMIN_REAPPLICATION" ? "Resubmission notice to RUWĀD" : d.kind === "APPLICANT_APPROVED" ? "Approval email to applicant" : d.kind === "APPLICANT_REJECTED" ? "Rejection email to applicant" : "Email";
    const state = d.result === "sent" ? "sent" : d.result === "failed" ? "could not be sent" : d.result === "skipped" ? "not sent (demonstration profile)" : "not sent (mock mode)";
    return `${who}: ${state}`;
  }
  return e.type;
}

export function ApplicationModal({ id, onChanged }: { id: string; onChanged: () => void }) {
  const toast = useToast();
  const { closeModal } = useModal();
  const [tick, setTick] = useState(0);
  const res = useAsync(`admapp|${id}|${tick}`, () => fetchAdminApplication(id));
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<"approve" | "reject" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (res.error) return <div className="modal-box-pad"><ErrorState title="Couldn't load this application" body={res.error} /><div className="adv-review-actions"><button type="button" className="btn btn-outline" onClick={closeModal}>Close</button></div></div>;
  if (!res.data) return <div className="modal-box-pad"><LoadingState title="Loading application…" /></div>;
  const a = res.data;
  const reason = note.trim();

  function ask(action: "approve" | "reject") {
    setError("");
    if (action === "reject" && reason.length < MIN_REJECTION_REASON) {
      setError(`Write the reason for rejecting this application (at least ${MIN_REJECTION_REASON} characters). The applicant receives it by email.`);
      document.getElementById("adv-decision-note")?.focus();
      return;
    }
    setConfirm(action);
  }

  async function decide(action: "approve" | "reject") {
    setBusy(true);
    setError("");
    try {
      await reviewAdvisor(a.id, action, reason || undefined);
      toast(action === "approve" ? `${a.name} approved. The applicant has been notified.` : `${a.name} rejected. The applicant has been notified.`);
      setConfirm(null);
      setNote("");
      setTick((t) => t + 1);
      onChanged();
    } catch (e) {
      setError(errText(e));
      setConfirm(null);
      setTick((t) => t + 1); // someone else may have decided already: show the current state
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function download(d: ApplicationDetail["documents"][number]) {
    try { await downloadApplicationDocument(a.id, d); } catch (e) { toast(errText(e)); }
  }

  const pending = a.status === "PENDING_REVIEW";
  return (
    <div className="modal-box-pad adv-manage adv-appdetail">
      <div className="adv-manage-head">
        <div>
          <h3 className="fs-16">{a.name}</h3>
          <p className="muted small">{a.designation} · {a.institution}</p>
          <p className="mt-8"><span className={`badge ${STATUS[a.status].cls}`}>{STATUS[a.status].label}</span> <span className="muted small adv-ref-inline">{a.reference ? `Reference ${a.reference} · ` : ""}Submitted {formatWhen(a.submittedAt)}</span></p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={closeModal}>Close</button>
      </div>

      <h4 className="adv-sec-sub">Personal information</h4>
      <dl className="adv-kvs">
        <Row label="Full name">{a.name}</Row>
        <Row label="Email address"><span className="adv-breakall">{a.email ?? "—"}</span></Row>
        <Row label="Phone number">{a.phone ?? "—"}</Row>
        <Row label="Professional designation">{a.designation}</Row>
        <Row label="Institution or organization">{a.institution}</Row>
        <Row label="City and country">{a.location}</Row>
        {a.account && a.account.email !== a.email && <Row label="Signed-in account"><span className="adv-breakall">{a.account.name} · {a.account.email}</span></Row>}
      </dl>

      <h4 className="adv-sec-sub">Professional expertise</h4>
      <dl className="adv-kvs">
        <Row label="Primary specialization">{a.specialization}</Row>
        <Row label="Additional specializations">{a.specializations.length ? a.specializations.join(", ") : "—"}</Row>
        <Row label="Years of experience">{a.yearsExperience ?? "—"}</Row>
        <Row label="Research interests">{a.researchAreas.length ? a.researchAreas.join(", ") : "—"}</Row>
        <Row label="Consultation services">{a.consultationServices ?? "—"}</Row>
        <Row label="Preferred duration">{a.preferredMinutes ? `${a.preferredMinutes} minutes` : "No preference"}</Row>
        <Row label="LinkedIn"><span className="adv-breakall">{link(a.linkedinUrl)}</span></Row>
        <Row label="Scholar or website"><span className="adv-breakall">{link(a.websiteUrl)}</span></Row>
      </dl>
      <p className="adv-sec-sub" style={{ marginBottom: 4 }}>Professional biography</p>
      <p className="adv-about adv-bio">{a.about}</p>

      <h4 className="adv-sec-sub">Supporting documents</h4>
      {a.documents.length === 0 ? <p className="muted small">No documents on file.</p> : (
        <ul className="adv-doclist">
          {a.documents.map((d) => (
            <li key={d.id}>
              <div><span className="adv-filename">{d.fileName}</span><div className="muted small">{DOC_LABEL[d.kind]} · {formatBytes(d.size)}</div></div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => download(d)} aria-label={`Download ${d.fileName}`}>Download</button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small mt-8">Documents download with your administrator session. They are never available through a public link.</p>

      <h4 className="adv-sec-sub">Declaration</h4>
      <p className="small">{a.declarationAcceptedAt ? `Accepted ${formatWhen(a.declarationAcceptedAt)}: the applicant confirmed the information is accurate and understands the application is reviewed before any profile is published.` : "Not recorded (this profile predates the application form)."}</p>

      <h4 className="adv-sec-sub">History</h4>
      <ol className="adv-timeline">
        {a.history.map((e) => (
          <li key={e.id}>
            <span className="adv-timeline-when">{formatWhen(e.at)}</span>
            <span><b>{historyText(e)}</b>{e.actorRole === "ADMIN" ? " · administrator" : e.actorRole === "APPLICANT" ? " · applicant" : ""}{e.note && <span className="adv-timeline-note">{e.type === "REJECTED" ? "Reason: " : "Note: "}{e.note}</span>}</span>
          </li>
        ))}
      </ol>

      {pending ? (
        <div className="adv-decision">
          <h4 className="adv-sec-sub" style={{ marginTop: 0 }}>Decision</h4>
          <label className="adv-note-label" htmlFor="adv-decision-note">Review note <span className="muted">(optional when approving, required when rejecting)</span></label>
          <textarea id="adv-decision-note" className="textarea" rows={3} maxLength={1000} value={note} disabled={busy || confirm !== null} onChange={(e) => setNote(e.target.value)}
            aria-describedby="adv-decision-help" aria-invalid={error && !reason ? true : undefined} />
          <p className="muted small" id="adv-decision-help">On approval the note is kept internally. On rejection it is sent to the applicant as the reason, so write it professionally; it is shown to no one else.</p>
          {error && <p className="adv-review-note adv-review-error" role="alert">{error}</p>}
          {confirm === null ? (
            <div className="adv-review-actions">
              <button type="button" className="btn btn-outline adv-danger" onClick={() => ask("reject")} disabled={busy}>Reject Application</button>
              <button type="button" className="btn btn-primary" onClick={() => ask("approve")} disabled={busy}>Approve Application</button>
            </div>
          ) : (
            <div className="adv-confirm" role="alertdialog" aria-label="Confirm decision">
              <p>{confirm === "approve"
                ? "Approve this application? The advisor profile goes live in the directory, the applicant can open their Advisor Dashboard, and they are emailed."
                : "Reject this application? The profile is not published and the applicant is emailed the reason above."}</p>
              <div className="adv-review-actions">
                <button type="button" className="btn btn-outline" onClick={() => setConfirm(null)} disabled={busy}>Back</button>
                <button type="button" className={`btn btn-primary${confirm === "reject" ? " adv-danger-solid" : ""}`} onClick={() => decide(confirm)} disabled={busy}>{busy ? "Working…" : confirm === "approve" ? "Confirm approval" : "Confirm rejection"}</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="adv-decision is-closed">
          <h4 className="adv-sec-sub" style={{ marginTop: 0 }}>Decision</h4>
          <p className="small">{STATUS[a.status].label}{a.review ? ` on ${formatWhen(a.review.at)}${a.review.by ? ` by ${a.review.by}` : ""}` : ""}.{a.review?.note ? ` ${a.status === "REJECTED" ? "Reason" : "Note"}: ${a.review.note}` : ""}</p>
          {error && <p className="adv-review-note adv-review-error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
