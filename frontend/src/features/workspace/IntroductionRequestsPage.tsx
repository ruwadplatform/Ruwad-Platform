"use client";

import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { IntroductionRequestRow } from "@/components/workspace/IntroductionRequestRow";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { SessionLoading } from "@/components/workspace/SessionLoading";
import { EmptyState } from "@/components/shared/EmptyState";
import { useSession, useIntros } from "@/hooks/use-store";

export function IntroductionRequestsPage() {
  const { loggedIn, hydrated } = useSession();
  const intros = useIntros();

  if (!hydrated) return <SessionLoading />;
  if (!loggedIn) return <WorkspaceGate />;

  return (
    <div>
      <IntelligencePageHeader title="Introduction Requests" description="Requests you've submitted from Startup and Investor profiles. Click a row for the full detail." />
      <div className="mt-20">
        {!intros.length ? (
          <EmptyState icon="intros" title="No introduction requests yet." body="Use Request Introduction on any Startup or Investor profile to reach out — your requests will be tracked here." />
        ) : (
          <div className="panel scroll-x">
            <table className="data-table">
              <thead><tr><th>Target</th><th>Type</th><th>Purpose</th><th>Submitted</th><th>Last Update</th><th>Status</th></tr></thead>
              <tbody>{intros.map((r) => <IntroductionRequestRow key={r.id} request={r} />)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
