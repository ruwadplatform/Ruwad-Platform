"use client";

import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { SubmissionStatusBadge } from "./SubmissionStatusBadge";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { deleteDraftSubmission } from "@/lib/store";
import { useToast } from "@/components/shell/ToastProvider";
import { useModal } from "@/components/shell/ModalProvider";
import { useOwnedListings } from "@/hooks/use-store";
import { SCHEMAS } from "@/features/submissions/schemas";
import type { ApiSubmission } from "@/lib/api/types";

/** One row in the "My Submissions" list — actions change per status per the
 * submission spec: Continue Editing/Delete for DRAFT, View for SUBMITTED/
 * UNDER_REVIEW, Review Changes for CHANGES_REQUESTED, View Public Profile
 * for APPROVED (resolved through the real owned-listing record, not a
 * guessed route), View Decision for REJECTED. */
export function SubmissionCard({ submission }: { submission: ApiSubmission }) {
  const router = useRouter();
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const listings = useOwnedListings();
  const schema = SCHEMAS[submission.kind];
  const route = `/submit/${schema.route}`;

  function handleDelete() {
    openModal(
      <ConfirmModal
        title="Delete this draft?"
        body="This cannot be undone."
        confirmLabel="Delete Draft"
        danger
        onCancel={closeModal}
        onConfirm={async () => {
          await deleteDraftSubmission(submission.id);
          closeModal();
          toast("Draft deleted");
        }}
      />,
    );
  }

  const publishedListing = submission.publishedEntityId ? listings.find((l) => l.entityId === submission.publishedEntityId) : undefined;

  return (
    <div className="panel panel-pad">
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <b className="fs-13">{submission.title || `Untitled ${schema.label}`}</b>
          <div className="small muted mt-4">{schema.label} · Last updated {new Date(submission.updatedAt).toLocaleDateString()}</div>
        </div>
        <SubmissionStatusBadge status={submission.status} />
      </div>

      {submission.status === "CHANGES_REQUESTED" && submission.reviewerNote && (
        <div className="small mt-12" style={{ padding: "8px 10px", borderRadius: "var(--radius-md)", background: "var(--warn-tint)", color: "var(--warn)" }}>
          {submission.reviewerNote}
        </div>
      )}
      {submission.status === "REJECTED" && submission.reviewerNote && (
        <div className="small mt-12" style={{ padding: "8px 10px", borderRadius: "var(--radius-md)", background: "var(--crit-tint)", color: "var(--crit)" }}>
          {submission.reviewerNote}
        </div>
      )}

      <div className="flex gap-8 mt-16" style={{ flexWrap: "wrap" }}>
        {submission.status === "DRAFT" && (
          <>
            <button className="btn btn-outline btn-sm" onClick={() => router.push(route)}><RuwadIcon name="edit" size={13} /> Continue Editing</button>
            <button className="btn btn-outline btn-sm" onClick={handleDelete}><RuwadIcon name="trash" size={13} /> Delete Draft</button>
          </>
        )}
        {(submission.status === "SUBMITTED" || submission.status === "UNDER_REVIEW") && (
          <button className="btn btn-outline btn-sm" onClick={() => router.push(`/submissions/${submission.id}`)}><RuwadIcon name="doc" size={13} /> View Submission</button>
        )}
        {submission.status === "CHANGES_REQUESTED" && (
          <button className="btn btn-primary btn-sm" onClick={() => router.push(route)}><RuwadIcon name="edit" size={13} /> Edit &amp; Resubmit</button>
        )}
        {submission.status === "APPROVED" && (
          <button className="btn btn-outline btn-sm" onClick={() => router.push(publishedListing ? `/${schema.route}s/${publishedListing.id}` : `/submissions/${submission.id}`)}>
            <RuwadIcon name="globe" size={13} /> View Public Profile
          </button>
        )}
        {submission.status === "REJECTED" && (
          <button className="btn btn-outline btn-sm" onClick={() => router.push(`/submissions/${submission.id}`)}><RuwadIcon name="doc" size={13} /> View Decision</button>
        )}
      </div>
    </div>
  );
}
