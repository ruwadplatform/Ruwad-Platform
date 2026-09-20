"use client";

import { useRouter } from "next/navigation";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { SubmissionStatusBadge } from "@/components/workspace/SubmissionStatusBadge";
import { useSession, useOwnedListings } from "@/hooks/use-store";
import { useKeyedResource } from "@/hooks/use-async-resource";
import { fetchSubmission, fetchSubmissionHistory } from "@/lib/api/submissions";
import { schemaFor } from "./schemas";
import { PayloadSummary } from "./PayloadSummary";
import { ReviewHistory } from "./ReviewHistory";

/** Read-only view for a submission that is no longer editable (SUBMITTED,
 * UNDER_REVIEW, APPROVED or REJECTED) — DRAFT/CHANGES_REQUESTED submissions
 * route to the wizard instead, since only those two states are editable. */
export function SubmissionDetailPage({ id }: { id: string }) {
  const { loggedIn, hydrated } = useSession();
  const router = useRouter();
  const listings = useOwnedListings();
  const { data: submission, loading, error } = useKeyedResource(loggedIn ? id : null, fetchSubmission);
  const { data: events } = useKeyedResource(loggedIn ? id : null, fetchSubmissionHistory);

  if (!hydrated) return null;
  if (!loggedIn) return <WorkspaceGate title="Sign in to view this submission" />;
  if (loading) return <div className="mt-20"><EmptyState icon="doc" title="Loading submission…" body="" /></div>;
  if (error || !submission) return <div className="mt-20"><EmptyState icon="help" title="Couldn't load this submission" body={error ?? "It may not exist, or you may not have access to it."} /></div>;

  const schema = schemaFor(submission.kind, submission.payload);
  const publishedListing = submission.publishedEntityId ? listings.find((l) => l.entityId === submission.publishedEntityId) : undefined;

  return (
    <div>
      <IntelligencePageHeader
        title={submission.title || `Untitled ${schema.label}`}
        description={`${schema.label} submission · Reference ${submission.id.slice(0, 8).toUpperCase()}`}
        action={<SubmissionStatusBadge status={submission.status} />}
      />

      {submission.status === "REJECTED" && submission.reviewerNote && (
        <div className="panel panel-pad mt-16" style={{ borderColor: "var(--crit)", background: "var(--crit-tint)" }}>
          <b className="small">Decision</b>
          <p className="small mt-4">{submission.reviewerNote}</p>
        </div>
      )}
      {submission.status === "APPROVED" && publishedListing && (
        <div className="panel panel-pad mt-16" style={{ borderColor: "var(--good)", background: "var(--good-tint)" }}>
          <div className="flex" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <span className="small">This listing is live in the RUWĀD directory.</span>
            <button className="btn btn-primary btn-sm" onClick={() => router.push(`/${schema.route}s/${publishedListing.id}`)}>View Public Profile</button>
          </div>
        </div>
      )}

      <div className="insight-row mt-20" style={{ gridTemplateColumns: "1fr 320px" }}>
        <div className="panel panel-pad">
          <PayloadSummary schema={schema} payload={submission.payload} hideEmpty={submission.kind === "HUB"} />
        </div>
        <div className="panel panel-pad">
          <h3 className="fs-13 mb-12">Review History</h3>
          <ReviewHistory events={events ?? []} />
        </div>
      </div>
    </div>
  );
}
