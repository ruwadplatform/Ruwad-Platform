"use client";

import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { ListingCard } from "@/components/workspace/ListingCard";
import { SubmissionCard } from "@/components/workspace/SubmissionCard";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { useSession, useOwnedListings, useSubmissions } from "@/hooks/use-store";
import type { ApiSubmissionStatus } from "@/lib/api/types";

const GROUP_ORDER: ApiSubmissionStatus[] = ["CHANGES_REQUESTED", "DRAFT", "SUBMITTED", "UNDER_REVIEW", "REJECTED", "APPROVED"];
const GROUP_LABEL: Record<ApiSubmissionStatus, string> = {
  CHANGES_REQUESTED: "Needs Your Attention", DRAFT: "Drafts", SUBMITTED: "Submitted", UNDER_REVIEW: "Under Review",
  REJECTED: "Not Approved", APPROVED: "Approved",
};

export function MyListingsPage() {
  const { loggedIn } = useSession();
  const listings = useOwnedListings();
  const submissions = useSubmissions();
  const router = useRouter();

  if (!loggedIn) return <WorkspaceGate />;

  // APPROVED submissions are already represented by the owned-listing cards
  // above — only the still-in-flight ones need a separate submissions list.
  const pending = submissions.filter((s) => s.status !== "APPROVED");

  return (
    <div>
      <IntelligencePageHeader
        title="My Organizations"
        description="Entities you manage on RUWĀD — startups, investor firms, hubs, research institutions or multinational offices."
        action={<button className="btn btn-primary" onClick={() => router.push("/submit")}><RuwadIcon name="plus" size={14} /> Add Organization</button>}
      />
      <div className="mt-20">
        {!listings.length ? (
          <EmptyState icon="listings" title="You don't manage any organizations yet." body="Once you submit a company, investor, hub, research institution or multinational profile and it's approved, it will appear here for management." />
        ) : (
          <div className="entity-grid">
            {listings.map((l) => <ListingCard key={`${l.type}-${l.id}`} listing={l} />)}
          </div>
        )}
      </div>

      <div className="mt-32">
        <h3 className="fs-15 mb-16">My Submissions</h3>
        {!pending.length ? (
          <EmptyState icon="doc" title="You haven't submitted a listing yet." body="Start a submission from the Add Organization button above." />
        ) : (
          <div className="flex" style={{ flexDirection: "column", gap: 12 }}>
            {GROUP_ORDER.filter((status) => status !== "APPROVED").map((status) => {
              const group = pending.filter((s) => s.status === status);
              if (!group.length) return null;
              return (
                <div key={status}>
                  <div className="eyebrow mb-8">{GROUP_LABEL[status]}</div>
                  <div className="flex" style={{ flexDirection: "column", gap: 10 }}>
                    {group.map((s) => <SubmissionCard key={s.id} submission={s} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
