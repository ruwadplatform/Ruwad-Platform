"use client";

import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { useSession } from "@/hooks/use-store";

/** Full Data Room/NDA machinery is out of scope for this build (matches
 * DataRoomTab's own "not available yet" state on entity profiles) — this
 * page exists only so the Workspace nav link resolves to a real, honest
 * screen instead of a 404. */
export function MyNdasPage() {
  const { loggedIn } = useSession();
  if (!loggedIn) return <WorkspaceGate title="Sign in to view your NDAs" body="Sign in to see NDAs and Data Room access tied to your account." />;
  return (
    <div>
      <IntelligencePageHeader title="My NDAs" description="Non-disclosure agreements and Data Room access tied to your account." />
      <div className="mt-20">
        <EmptyState icon="lock" title="Data Room access isn't available yet" body="Full Data Room and NDA workflows are coming in a later release. You'll be able to track signed NDAs and pending access requests here." />
      </div>
    </div>
  );
}
