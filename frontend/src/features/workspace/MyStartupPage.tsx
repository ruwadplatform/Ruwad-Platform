"use client";

import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { ProfileCompleteness } from "@/components/workspace/ProfileCompleteness";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/shell/ToastProvider";
import { ListingStatusBadge } from "@/components/workspace/ListingStatusBadge";
import { useSession, useMyStartupId, useOwnedListings } from "@/hooks/use-store";
import { startupCompleteness } from "@/lib/completeness";
import { fetchStartupBySlug } from "@/lib/api/startups";
import { useKeyedResource } from "@/hooks/use-async-resource";

/** Unlike the directory-wide useStartups() hook (list summaries, cheap for
 * a grid), the founder/admin view needs full detail — team, rounds,
 * market, traction, documents — for one specific company, so this fetches
 * it directly by slug instead of reading it out of the lighter list cache. */
export function MyStartupPage() {
  const { loggedIn } = useSession();
  const startupId = useMyStartupId();
  const listings = useOwnedListings();
  const router = useRouter();
  const toast = useToast();

  const { data: s, loading, error } = useKeyedResource(startupId, fetchStartupBySlug);

  if (!loggedIn) return <WorkspaceGate />;

  if (loading) {
    return (
      <div>
        <IntelligencePageHeader title="My Startup" description="Your company's founder/admin management view." />
        <div className="mt-20"><EmptyState icon="mystartup" title="Loading your company profile…" body="" /></div>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <IntelligencePageHeader title="My Startup" description="Your company's founder/admin management view." />
        <div className="mt-20"><EmptyState icon="help" title="Couldn't load your company profile" body={error} /></div>
      </div>
    );
  }
  if (!s) {
    return (
      <div>
        <IntelligencePageHeader title="My Startup" description="Your company's founder/admin management view." />
        <div className="mt-20">
          <EmptyState icon="mystartup" title="No company linked to your account yet" body="Once your company profile is submitted and approved, its management view will appear here." />
        </div>
      </div>
    );
  }

  const listing = listings.find((l) => l.id === s.id);
  const checks = startupCompleteness(s);
  const warnings: string[] = [];
  if (!s.regulatory.clinical || s.regulatory.clinical === "N/A") warnings.push("No clinical validation status on file — this affects investor visibility.");
  if (!s.documents.find((d) => d.n === "Certifications")?.ok) warnings.push("Certifications document is missing.");
  if (s.team.length < 2) warnings.push("Team profile lists fewer than 2 members.");

  return (
    <div>
      <IntelligencePageHeader
        title="My Startup"
        description="Founder/admin management view — not the public profile guests and investors see."
        action={
          <div className="flex gap-8">
            <button className="btn btn-outline" onClick={() => router.push(`/startups/${s.id}`)}><RuwadIcon name="globe" size={13} /> View Public Profile</button>
            <button className="btn btn-primary" onClick={() => toast("Edit Profile — coming in a later release")}><RuwadIcon name="edit" size={13} /> Edit Profile</button>
          </div>
        }
      />

      <div className="profile-head mt-20">
        <div className="plogo">{s.logo}</div>
        <div className="profile-head-main">
          <h1>{s.name}</h1>
          <div className="ptagline">{s.tagline}</div>
          <div className="profile-meta">
            <span><RuwadIcon name="map" size={13} /> {s.city}, {s.country}</span>
            <span><RuwadIcon name="startups" size={13} /> {s.category}</span>
            <span><RuwadIcon name="bi" size={13} /> {s.stage}</span>
            <span className={`badge ${s.status === "Active" ? "badge-good" : "badge-neutral"}`}>{s.status} · {s.verified === "verified" ? "Verified" : s.verified === "self-reported" ? "Self-Reported" : "Unclaimed"}</span>
            {listing && <ListingStatusBadge status={listing.status} />}
          </div>
        </div>
      </div>

      {listing && (
        <div className="stat-mini-row mt-16">
          <div className="stat-mini"><div className="sm-label">Visibility</div><div className="sm-val fs-15">{listing.visibility}</div></div>
          <div className="stat-mini"><div className="sm-label">Last Updated</div><div className="sm-val fs-15">{listing.lastUpdated}</div></div>
          <div className="stat-mini"><div className="sm-label">Profile Views</div><div className="sm-val fs-15">{listing.views.toLocaleString()}</div></div>
        </div>
      )}

      <div className="mt-20"><ProfileCompleteness checks={checks} /></div>

      {warnings.length > 0 && (
        <div className="panel panel-pad mt-20" style={{ borderColor: "var(--warn)", background: "var(--warn-tint)" }}>
          <b className="small">Data quality warnings</b>
          <ul className="fs-12" style={{ paddingLeft: 18, marginTop: 6 }}>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}

      <div className="insight-row mt-20" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="panel panel-pad">
          <h3 className="fs-13 mb-12">Basic Information</h3>
          <div className="stat-mini-row">
            <div className="stat-mini"><div className="sm-label">Legal Name</div><div className="sm-val fs-15">{s.legalName}</div></div>
            <div className="stat-mini"><div className="sm-label">Headquarters</div><div className="sm-val fs-15">{s.hq}</div></div>
            <div className="stat-mini"><div className="sm-label">Founded</div><div className="sm-val fs-15">{s.founded}</div></div>
            <div className="stat-mini"><div className="sm-label">Business Model</div><div className="sm-val fs-15">{s.businessModel}</div></div>
            <div className="stat-mini"><div className="sm-label">Employees</div><div className="sm-val fs-15">{s.employees}</div></div>
            <div className="stat-mini"><div className="sm-label">Website</div><div className="sm-val fs-15">{s.website}</div></div>
          </div>
        </div>
        <div className="panel panel-pad">
          <h3 className="fs-13 mb-12">Funding Summary</h3>
          <div className="stat-mini-row">
            <div className="stat-mini"><div className="sm-label">Total Raised</div><div className="sm-val">SAR {s.fundingTotal}M</div></div>
            <div className="stat-mini"><div className="sm-label">Valuation</div><div className="sm-val">SAR {s.valuation}M</div></div>
            <div className="stat-mini"><div className="sm-label">Rounds</div><div className="sm-val">{s.rounds.length}</div></div>
            <div className="stat-mini"><div className="sm-label">Fundraising</div><div className="sm-val fs-15">{s.fundraising ? `Yes — ${s.targetRaise ?? ""}` : "Not currently"}</div></div>
          </div>
        </div>
      </div>

      <div className="insight-row mt-20" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="panel panel-pad">
          <h3 className="fs-13 mb-12">Team</h3>
          {s.team.map((t) => (
            <div key={t.name} className="flex mb-8" style={{ justifyContent: "space-between" }}>
              <span className="small">{t.name}</span>
              <span className="small muted">{t.title}{t.founder ? " · Founder" : ""}</span>
            </div>
          ))}
        </div>
        <div className="panel panel-pad">
          <h3 className="fs-13 mb-12">Product</h3>
          <p className="small mb-8"><b>Problem — </b>{s.problem}</p>
          <p className="small mb-8"><b>Solution — </b>{s.solution}</p>
          <p className="small"><b>Advantage — </b>{s.advantage}</p>
        </div>
      </div>

      <div className="insight-row mt-20" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="panel panel-pad">
          <h3 className="fs-13 mb-12">Market</h3>
          <div className="stat-mini-row">
            <div className="stat-mini"><div className="sm-label">TAM</div><div className="sm-val">{s.market.tam}</div></div>
            <div className="stat-mini"><div className="sm-label">SAM</div><div className="sm-val">{s.market.sam}</div></div>
            <div className="stat-mini"><div className="sm-label">SOM</div><div className="sm-val">{s.market.som}</div></div>
          </div>
        </div>
        <div className="panel panel-pad">
          <h3 className="fs-13 mb-12">Traction</h3>
          <div className="stat-mini-row">
            <div className="stat-mini"><div className="sm-label">Revenue</div><div className="sm-val fs-15">{s.traction.revenue}</div></div>
            <div className="stat-mini"><div className="sm-label">Growth</div><div className="sm-val fs-15">{s.traction.growth}</div></div>
            <div className="stat-mini"><div className="sm-label">Customers</div><div className="sm-val fs-15">{s.traction.customers}</div></div>
          </div>
        </div>
      </div>

      <div className="panel panel-pad mt-20">
        <h3 className="fs-13 mb-12">Documents Status</h3>
        <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
          {s.documents.map((d) => (
            <div className="doc-card" key={d.n}>
              <div className="doc-icon"><RuwadIcon name="doc" size={16} /></div>
              <b>{d.n}</b>
              <span className="doc-status">{d.ok ? "On file" : "Not provided"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
