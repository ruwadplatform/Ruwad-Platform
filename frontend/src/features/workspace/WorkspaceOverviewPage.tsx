"use client";

import { useMemo } from "react";
import Link from "next/link";
import { EntityCard } from "@/components/shared/EntityCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { KpiCard } from "@/components/intelligence/KpiCard";
import { InsightCard } from "@/components/intelligence/InsightCard";
import { ActivityRow } from "@/components/workspace/ActivityRow";
import { IntroductionStatusBadge } from "@/components/workspace/IntroductionStatusBadge";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { SessionLoading } from "@/components/workspace/SessionLoading";
import { useSession, useWatchlist, useSavedSearches, useIntros, useRecentActivity, useOwnedListings } from "@/hooks/use-store";
import { useResolveCollections } from "@/hooks/use-directory-data";
import { resolveEntity, RESOLVABLE_KINDS, KIND_LOGO_STYLE, type ResolvableKind } from "@/lib/entity-resolve";

export function WorkspaceOverviewPage() {
  const { loggedIn, user, hydrated } = useSession();
  const listings = useOwnedListings();
  const watchlist = useWatchlist();
  const savedSearches = useSavedSearches();
  const intros = useIntros();
  const activity = useRecentActivity();
  const collections = useResolveCollections();

  const watchlistCount = RESOLVABLE_KINDS.reduce((a, k) => a + (watchlist[k]?.length ?? 0), 0);

  const watchlistPreview = useMemo(() => {
    const refs: { kind: ResolvableKind; id: string }[] = [];
    RESOLVABLE_KINDS.forEach((k) => (watchlist[k] ?? []).forEach((id) => refs.push({ kind: k, id })));
    return refs.slice(0, 4).map(({ kind, id }) => resolveEntity(kind, id, collections)).filter((e): e is NonNullable<typeof e> => !!e);
  }, [watchlist, collections]);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = { Pending: 0, "In Review": 0, Accepted: 0, Declined: 0, Completed: 0 };
    intros.forEach((r) => { m[r.status] = (m[r.status] ?? 0) + 1; });
    return m;
  }, [intros]);

  if (!hydrated) return <SessionLoading />;
  if (!loggedIn) return <WorkspaceGate />;

  return (
    <div>
      <IntelligencePageHeader title="Workspace" description={`Welcome back${user?.firstName ? `, ${user.firstName}` : ""} — here's what's happening across your account.`} />

      <div className="kpi-row mt-20 mb-24">
        <KpiCard label="Active Listings" value={listings.filter((l) => l.status === "Published").length} />
        <KpiCard label="Watchlist Items" value={watchlistCount} />
        <KpiCard label="Saved Searches" value={savedSearches.length} />
        <KpiCard label="Introduction Requests" value={intros.length} />
      </div>

      <div className="insight-row" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <InsightCard title="Recent Activity" action={<Link href="/watchlist" className="small">View Watchlist →</Link>}>
          {!activity.length ? (
            <EmptyState icon="clock" title="No activity yet" body="Actions like saving a company or requesting an introduction will show up here." />
          ) : (
            <div>{activity.slice(0, 6).map((a) => <ActivityRow key={a.id} item={a} />)}</div>
          )}
        </InsightCard>

        <InsightCard title="Introduction Requests">
          {!intros.length ? (
            <EmptyState icon="intros" title="No introduction requests yet" body="Requests you submit from a Startup or Investor profile will appear here." />
          ) : (
            <div>
              {Object.entries(statusCounts).filter(([, n]) => n > 0).map(([status, n]) => (
                <div key={status} className="flex mb-8" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <IntroductionStatusBadge status={status} />
                  <b className="mono">{n}</b>
                </div>
              ))}
              <Link href="/introductions" className="btn btn-outline btn-sm btn-block mt-12">View All Requests</Link>
            </div>
          )}
        </InsightCard>
      </div>

      <div className="mt-20">
        <InsightCard title="Watchlist Preview" action={<Link href="/watchlist" className="small">View All →</Link>}>
          {!watchlistPreview.length ? (
            <EmptyState icon="star" title="You haven't added anything to your watchlist yet." body="Save startups, investors, hubs, research institutions or multinationals from any directory to track them here." />
          ) : (
            <div className="entity-grid">
              {watchlistPreview.map((e) => (
                <EntityCard key={`${e.kind}-${e.id}`} href={e.href} logo={e.logo} logoUrl={e.logoUrl} logoStyle={KIND_LOGO_STYLE[e.kind]} name={e.name} subtitle={e.subtitle} desc={e.desc} kind={e.kind} id={e.id}
                  meta={<span className="tag">{e.sector}</span>} foot={<span className="small muted">{e.kind}</span>} />
              ))}
            </div>
          )}
        </InsightCard>
      </div>

      <div className="mt-20">
        <InsightCard title="Saved Search Preview" action={<Link href="/saved-searches" className="small">View All →</Link>}>
          {!savedSearches.length ? (
            <EmptyState icon="search" title="You don't have any saved searches." body="Save a search from any directory to quickly re-run it later." />
          ) : (
            <div className="scroll-x">
              <table className="data-table">
                <thead><tr><th>Name</th><th>Entity Type</th><th>Results</th><th>Last Run</th></tr></thead>
                <tbody>
                  {savedSearches.slice(0, 4).map((s) => (
                    <tr key={s.id}>
                      <td className="cell-main">{s.label}</td>
                      <td className="cell-sub" style={{ textTransform: "capitalize" }}>{s.entityType}</td>
                      <td className="mono">{s.resultCountAtSave}</td>
                      <td className="cell-sub">{s.lastRunAt ? new Date(s.lastRunAt).toISOString().slice(0, 10) : "Never"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </InsightCard>
      </div>
    </div>
  );
}
