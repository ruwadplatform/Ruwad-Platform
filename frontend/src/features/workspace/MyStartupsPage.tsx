"use client";

import Link from "next/link";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { SessionLoading } from "@/components/workspace/SessionLoading";
import { EmptyState } from "@/components/shared/EmptyState";
import { OrganizationLogo } from "@/components/shared/OrganizationLogo";
import { ListingStatusBadge } from "@/components/workspace/ListingStatusBadge";
import { useSession, useOwnedListings, useOwnedListingsLoaded } from "@/hooks/use-store";
import { useKeyedResource } from "@/hooks/use-async-resource";
import { fetchStartupBySlug } from "@/lib/api/startups";
import type { Listing } from "@/lib/store";

function StartupCard({ listing }: { listing: Listing }) {
  const { data: s, loading } = useKeyedResource(listing.id, fetchStartupBySlug);
  const href = `/workspace/startup/${listing.id}`;
  const scored = s?.scoreStatus === "CALCULATED" && s.ruwadScore != null;

  return (
    <article className="ms-startup">
      <Link href={href} className="ms-startup-main" aria-label={`Open ${s?.name ?? "startup"}`}>
        <div className="ms-startup-top">
          {s ? <OrganizationLogo logo={s.logo} logoUrl={s.logoUrl} className="plogo ms-startup-logo" /> : <div className="plogo ms-startup-logo" aria-hidden />}
          <ListingStatusBadge status={listing.status} />
        </div>
        <h3>{s?.name ?? (loading ? "Loading…" : "Startup")}</h3>
        <p className="ms-startup-tagline">{s?.tagline ?? ""}</p>
        <div className="ms-startup-meta">
          {s && <span>{s.category}</span>}
          {s && <span>{s.stage}</span>}
          {s && <span>{s.city}</span>}
        </div>
        <div className="ms-startup-stats">
          <div>
            <span className="ms-eyebrow">RUWĀD Score</span>
            <b>{scored ? <>{s!.ruwadScore!.toFixed(1)}<small> / 10</small></> : <span className="ms-empty">Pending</span>}</b>
          </div>
          <div>
            <span className="ms-eyebrow">Views</span>
            <b>{listing.views.toLocaleString()}</b>
          </div>
          <div>
            <span className="ms-eyebrow">Updated</span>
            <b>{listing.lastUpdated}</b>
          </div>
        </div>
      </Link>
      <footer className="ms-startup-foot">
        <Link href={href} className="btn btn-primary btn-sm">Open</Link>
        <Link href={`${href}/data-room`} className="btn btn-outline btn-sm"><RuwadIcon name="doc" size={13} /> Manage Data Room</Link>
        <Link href={`${href}/edit`} className="btn btn-outline btn-sm"><RuwadIcon name="edit" size={13} /> Edit</Link>
      </footer>
    </article>
  );
}

/** Every startup the signed-in user manages, as cards. A card opens that startup's management view; each also links straight to its
 * Data Room and its editor. */
export function MyStartupsPage() {
  const { loggedIn, hydrated } = useSession();
  const listings = useOwnedListings();
  const loaded = useOwnedListingsLoaded();

  if (!hydrated) return <SessionLoading />;
  if (!loggedIn) return <WorkspaceGate />;

  const startups = listings.filter((l) => l.type === "startups");
  const header = (
    <IntelligencePageHeader
      title="My Startups"
      description="The startups you manage. Open one to see its RUWĀD assessment, edit its profile or manage its Data Room."
      action={<Link className="btn btn-outline" href="/submit/startup"><RuwadIcon name="plus" size={13} /> Submit another startup</Link>}
    />
  );

  return (
    <div className="mystartup-page">
      {header}
      {!loaded ? (
        <EmptyState icon="mystartup" title="Loading your startups…" body="" />
      ) : startups.length === 0 ? (
        <EmptyState
          icon="mystartup"
          title="No startup linked to your account yet"
          body="Once a startup you submit is approved, it appears here with its RUWĀD assessment and Data Room."
          action={<Link className="btn btn-primary" href="/submit/startup">Submit your startup</Link>}
        />
      ) : (
        <div className="ms-startups">
          {startups.map((l) => <StartupCard key={l.id} listing={l} />)}
        </div>
      )}
    </div>
  );
}
