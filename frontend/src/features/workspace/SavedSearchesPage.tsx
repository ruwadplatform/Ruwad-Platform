"use client";

import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { SavedSearchCard } from "@/components/workspace/SavedSearchCard";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { useSession, useSavedSearches } from "@/hooks/use-store";

export function SavedSearchesPage() {
  const { loggedIn } = useSession();
  const searches = useSavedSearches();

  if (!loggedIn) return <WorkspaceGate />;

  return (
    <div>
      <IntelligencePageHeader title="Saved Searches" description="Searches and filters you've saved from the Startups, Investors, Hubs, Research and Multinationals directories." />
      <div className="mt-20">
        {!searches.length ? (
          <EmptyState icon="search" title="You don't have any saved searches." body="Use the Save Search button in any directory to store your current search and filters for quick reuse." />
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {searches.map((s) => <SavedSearchCard key={s.id} search={s} />)}
          </div>
        )}
      </div>
    </div>
  );
}
