"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { SubmissionStatusBadge } from "@/components/workspace/SubmissionStatusBadge";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession } from "@/hooks/use-store";
import {
  fetchAdminSubmission, fetchAdminSubmissionHistory, startReview, requestChanges, approveSubmission, rejectSubmission,
} from "@/lib/api/submissions";
import { resolveEntitySlug } from "@/lib/api/entity-lookup";
import { ApiError } from "@/lib/api/client";
import type { ApiSubmission, ApiSubmissionReviewEvent } from "@/lib/api/types";
import { SCHEMAS, schemaFor } from "@/features/submissions/schemas";
import { PayloadSummary } from "@/features/submissions/PayloadSummary";
import { ReviewHistory } from "@/features/submissions/ReviewHistory";

export function AdminSubmissionDetailPage({ id }: { id: string }) {
  const { loggedIn, isAdmin } = useSession();
  const router = useRouter();
  const toast = useToast();
  const { openModal, closeModal } = useModal();

  const [submission, setSubmission] = useState<ApiSubmission | null>(null);
  const [events, setEvents] = useState<ApiSubmissionReviewEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);

  const reload = useCallback(() => {
    return Promise.all([fetchAdminSubmission(id), fetchAdminSubmissionHistory(id)])
      .then(([s, h]) => { setSubmission(s); setEvents(h); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load this submission"));
  }, [id]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    Promise.all([fetchAdminSubmission(id), fetchAdminSubmissionHistory(id)])
      .then(([s, h]) => { if (!cancelled) { setSubmission(s); setEvents(h); } })
      .catch((e) => { if (!cancelled) setError(e instanceof ApiError ? e.message : "Couldn't load this submission"); });
    return () => { cancelled = true; };
  }, [isAdmin, id]);

  // Submission.publishedEntityId is the entity's raw database id, but the
  // public profile route resolves by slug — look the slug up once approved.
  useEffect(() => {
    if (!submission?.publishedEntityId || !submission.title) return;
    let cancelled = false;
    resolveEntitySlug(SCHEMAS[submission.kind].route, submission.publishedEntityId, submission.title)
      .then((slug) => { if (!cancelled) setPublishedSlug(slug); });
    return () => { cancelled = true; };
  }, [submission?.publishedEntityId, submission?.title, submission?.kind]);

  if (!loggedIn) return <WorkspaceGate title="Sign in as an administrator" body="Sign in with an administrator account to review submissions." />;
  if (!isAdmin) return <EmptyState icon="lock" title="Administrator access required" body="This area is limited to RUWĀD platform administrators." />;
  if (error) return <div className="mt-20"><EmptyState icon="help" title="Couldn't load this submission" body={error} /></div>;
  if (!submission) return <div className="mt-20"><EmptyState icon="reports" title="Loading submission…" body="" /></div>;

  const schema = schemaFor(submission.kind, submission.payload);

  async function handleStartReview() {
    setBusy(true);
    try { await startReview(id); await reload(); toast("Review started"); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Couldn't start review"); }
    finally { setBusy(false); }
  }

  function openRequestChanges() {
    openModal(
      <RequestChangesModal
        onCancel={closeModal}
        onConfirm={async (message, section) => {
          setBusy(true);
          try { await requestChanges(id, message, section); await reload(); closeModal(); toast("Changes requested"); }
          catch (e) { toast(e instanceof ApiError ? e.message : "Couldn't request changes"); }
          finally { setBusy(false); }
        }}
      />,
    );
  }

  function openReject() {
    openModal(
      <RejectModal
        onCancel={closeModal}
        onConfirm={async (reason, internalNote) => {
          setBusy(true);
          try { await rejectSubmission(id, reason, internalNote); await reload(); closeModal(); toast("Submission rejected"); }
          catch (e) { toast(e instanceof ApiError ? e.message : "Couldn't reject submission"); }
          finally { setBusy(false); }
        }}
      />,
    );
  }

  function openApprove() {
    openModal(
      <ApproveModal
        submission={submission!}
        schema={schema}
        onCancel={closeModal}
        onConfirm={async () => {
          setBusy(true);
          try {
            await approveSubmission(id);
            closeModal();
            toast("Approved and published");
            await reload();
          } catch (e) {
            toast(e instanceof ApiError ? e.message : "Couldn't approve — the payload may have changed since submission");
          } finally {
            setBusy(false);
          }
        }}
      />,
      "wide",
    );
  }

  return (
    <div>
      <IntelligencePageHeader
        title={submission.title || `Untitled ${schema.label}`}
        description={`${schema.label} · Reference ${submission.id.slice(0, 8).toUpperCase()} · Submitted by user ${submission.userId.slice(0, 8)}`}
        action={<SubmissionStatusBadge status={submission.status} />}
      />

      <div className="admin-review-grid mt-20">
        <div>
          <div className="panel panel-pad">
            <PayloadSummary schema={schema} payload={submission.payload} />
          </div>
        </div>

        <div className="flex" style={{ flexDirection: "column", gap: 16 }}>
          <div className="panel panel-pad">
            <h3 className="fs-13 mb-12">Actions</h3>
            <div className="flex" style={{ flexDirection: "column", gap: 8 }}>
              {submission.status === "SUBMITTED" && (
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={handleStartReview}>Start Review</button>
              )}
              {submission.status === "UNDER_REVIEW" && (
                <>
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={openApprove}>Approve &amp; Publish</button>
                  <button className="btn btn-outline btn-sm" disabled={busy} onClick={openRequestChanges}>Request Changes</button>
                  <button className="btn btn-outline btn-sm" disabled={busy} onClick={openReject}><RuwadIcon name="x" size={13} /> Reject</button>
                </>
              )}
              {(submission.status === "DRAFT" || submission.status === "CHANGES_REQUESTED") && (
                <p className="small muted">Waiting on the submitter — no admin action available yet.</p>
              )}
              {submission.status === "APPROVED" && submission.publishedEntityId && (
                <button className="btn btn-outline btn-sm" disabled={!publishedSlug} onClick={() => publishedSlug && router.push(`/${schema.route}s/${publishedSlug}`)}>
                  {publishedSlug ? "View Published Entity" : "Resolving link…"}
                </button>
              )}
              {submission.status === "REJECTED" && <p className="small muted">This submission was not approved.</p>}
            </div>
          </div>

          <div className="panel panel-pad">
            <h3 className="fs-13 mb-12">Review History</h3>
            <ReviewHistory events={events} />
          </div>
        </div>
      </div>
    </div>
  );
}

function RequestChangesModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (message: string, section?: string) => void }) {
  const [message, setMessage] = useState("");
  const [section, setSection] = useState("");
  return (
    <div className="modal-box-pad">
      <h3 className="fs-15">Request Changes</h3>
      <p className="muted small mt-8">This feedback is visible to the submitter. They&apos;ll be able to edit and resubmit.</p>
      <div className="field mt-16">
        <label>Section (optional)</label>
        <input className="input" value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. Clinical & Regulatory" />
      </div>
      <div className="field">
        <label>Message<span className="req">*</span></label>
        <textarea className="textarea" rows={4} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Explain what needs to change before this can be approved." />
      </div>
      <div className="flex gap-8 mt-16">
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={!message.trim()} onClick={() => onConfirm(message.trim(), section.trim() || undefined)}>Send to Submitter</button>
      </div>
    </div>
  );
}

function RejectModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (reason: string, internalNote?: string) => void }) {
  const [reason, setReason] = useState("");
  const [internalNote, setInternalNote] = useState("");
  return (
    <div className="modal-box-pad">
      <h3 className="fs-15">Reject Submission</h3>
      <p className="muted small mt-8">The reason below is shown to the submitter. The internal note (if any) is for the RUWĀD team only.</p>
      <div className="field mt-16">
        <label>Reason<span className="req">*</span></label>
        <textarea className="textarea" rows={4} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why this submission was not approved." />
      </div>
      <div className="field">
        <label>Internal Note (optional)</label>
        <textarea className="textarea" rows={2} maxLength={2000} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} placeholder="Not shown to the submitter." />
      </div>
      <div className="flex gap-8 mt-16">
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={!reason.trim()} onClick={() => onConfirm(reason.trim(), internalNote.trim() || undefined)}>Confirm Rejection</button>
      </div>
    </div>
  );
}

function ApproveModal({ submission, schema, onCancel, onConfirm }: {
  submission: ApiSubmission;
  schema: (typeof SCHEMAS)[keyof typeof SCHEMAS];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-box-pad">
      <h3 className="fs-15">Approve &amp; Publish</h3>
      <p className="muted small mt-8">This will immediately:</p>
      <ul className="small mt-8" style={{ paddingLeft: 18 }}>
        <li>Publish <b>{submission.title || "this listing"}</b> as a live {schema.label} in the RUWĀD directory</li>
        <li>Create the submitter&apos;s ownership of the new listing</li>
        <li>Mark this submission as Approved — this cannot be undone from here</li>
      </ul>
      <div className="flex gap-8 mt-16">
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={onConfirm}>Approve &amp; Publish</button>
      </div>
    </div>
  );
}
