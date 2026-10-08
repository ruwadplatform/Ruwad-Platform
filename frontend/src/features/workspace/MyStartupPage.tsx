"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { ProfileCompleteness } from "@/components/workspace/ProfileCompleteness";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { SessionLoading } from "@/components/workspace/SessionLoading";
import { EmptyState } from "@/components/shared/EmptyState";
import { OrganizationLogo } from "@/components/shared/OrganizationLogo";
import { ListingStatusBadge } from "@/components/workspace/ListingStatusBadge";
import { useSession, useOwnedListings } from "@/hooks/use-store";
import { startupCompleteness } from "@/lib/completeness";
import { initials } from "@/lib/scoring";
import { fetchStartupBySlug } from "@/lib/api/startups";
import { fetchDataRoomStatus, type DataRoomStatusResponse } from "@/lib/api/data-room";
import { useKeyedResource } from "@/hooks/use-async-resource";
import { useEffect, useState } from "react";
import { StartupAssessmentSection } from "./StartupAssessmentSection";

const TITLE = "My Startup";
const SUBTITLE = "Founder/admin management view — not the public profile guests and investors see.";

/** A value that was not provided is shown as an em dash, never as an empty box or a placeholder phrase. */
const show = (v: unknown): ReactNode => (v === undefined || v === null || v === "" || v === "Not publicly disclosed" ? <span className="ms-empty">—</span> : String(v));

function Card({ title, subtitle, children, className, action }: { title: string; subtitle?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`ms-card${className ? ` ${className}` : ""}`}>
      <header className="ms-card-head"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action}</header>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="ms-dl">
      {rows.map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}

/** Unlike the directory-wide useStartups() hook (list summaries, cheap for
 * a grid), the founder/admin view needs full detail — team, rounds,
 * market, traction, documents — for one specific company, so this fetches
 * it directly by slug instead of reading it out of the lighter list cache. */
export function MyStartupPage({ slug }: { slug: string }) {
  const { loggedIn, hydrated } = useSession();
  const listings = useOwnedListings();
  const router = useRouter();

  const { data: s, loading, error } = useKeyedResource(slug, fetchStartupBySlug);

  // Document metadata is no longer part of the public profile payload — the
  // owner's checklist comes from the protected Data Room endpoint, which the
  // backend only answers with documents for this entity's OWNER (or admin).
  const [room, setRoom] = useState<DataRoomStatusResponse | null>(null);
  const entityId = s?.entityId;
  useEffect(() => {
    if (!entityId) return;
    fetchDataRoomStatus("STARTUP", entityId).then(setRoom).catch(() => setRoom(null));
  }, [entityId]);
  const documents = room?.documents ?? [];

  if (!hydrated) return <SessionLoading />;
  if (!loggedIn) return <WorkspaceGate />;

  const header = (action?: ReactNode) => (
    <>
      <Link href="/workspace/startup" className="ms-back">&larr; All my startups</Link>
      <IntelligencePageHeader title={TITLE} description={SUBTITLE} action={action} />
    </>
  );
  if (loading) return <div className="mystartup-page">{header()}<div className="mt-20"><EmptyState icon="mystartup" title="Loading your company profile…" body="" /></div></div>;
  if (error) return <div className="mystartup-page">{header()}<div className="mt-20"><EmptyState icon="help" title="Couldn't load your company profile" body={error} /></div></div>;
  if (!s) {
    return (
      <div className="mystartup-page">
        {header()}
        <div className="mt-20"><EmptyState icon="mystartup" title="No company linked to your account yet" body="Once your company profile is submitted and approved, its management view and your RUWĀD assessment will appear here." /></div>
      </div>
    );
  }

  const listing = listings.find((l) => l.id === s.id);
  const checks = startupCompleteness(s, documents);
  const completePct = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
  const warnings: string[] = [];
  if (!s.regulatory.clinical || s.regulatory.clinical === "N/A") warnings.push("No clinical validation status on file — this affects investor visibility.");
  if (room && !documents.find((d) => d.name === "Certifications")?.onFile) warnings.push("Certifications document is missing.");
  if (s.team.length < 2) warnings.push("Team profile lists fewer than 2 members.");

  const actions = (
    <div className="ms-actions">
      <button className="btn btn-outline" onClick={() => router.push(`/workspace/startup/${slug}/data-room`)}><RuwadIcon name="upload" size={13} /> Manage Data Room</button>
      <button className="btn btn-outline" onClick={() => router.push(`/workspace/startup/${slug}/historical`)}><RuwadIcon name="doc" size={13} /> Historical Performance</button>
      <button className="btn btn-outline" onClick={() => router.push(`/startups/${s.id}`)}><RuwadIcon name="globe" size={13} /> View Public Profile</button>
      <button className="btn btn-primary" onClick={() => router.push(`/workspace/startup/${slug}/edit`)}><RuwadIcon name="edit" size={13} /> Edit Profile</button>
    </div>
  );

  return (
    <div className="mystartup-page">
      {header(actions)}

      <section className="ms-hero">
        <OrganizationLogo logo={s.logo} logoUrl={s.logoUrl} className="plogo ms-logo" />
        <div className="ms-hero-main">
          <h1>{s.name}</h1>
          <p className="ms-tagline">{s.tagline}</p>
          <div className="ms-meta">
            <span><RuwadIcon name="map" size={13} /> {s.city}, {s.country}</span>
            <span><RuwadIcon name="startups" size={13} /> {s.category}</span>
            <span><RuwadIcon name="bi" size={13} /> {s.stage}</span>
          </div>
        </div>
        <div className="ms-hero-badges">
          <span className={`badge ${s.status === "Active" ? "badge-good" : "badge-neutral"}`}>{s.status} · {s.verified === "verified" ? "Verified" : s.verified === "self-reported" ? "Self-Reported" : "Unclaimed"}</span>
          {listing && <ListingStatusBadge status={listing.status} />}
        </div>
      </section>

      <div className="ms-kpis">
        <div className="ms-kpi"><span className="ms-eyebrow">Visibility</span><b>{listing?.visibility ?? "—"}</b></div>
        <div className="ms-kpi"><span className="ms-eyebrow">Profile Views</span><b>{listing ? listing.views.toLocaleString() : "—"}</b></div>
        <div className="ms-kpi"><span className="ms-eyebrow">Last Updated</span><b>{listing?.lastUpdated ?? "—"}</b></div>
        <div className="ms-kpi">
          <span className="ms-eyebrow">Profile Completeness</span>
          <b>{completePct}%</b>
          <span className="ms-bar" aria-hidden><span style={{ width: `${completePct}%` }} /></span>
        </div>
      </div>

      {s.entityId && <StartupAssessmentSection startupId={s.entityId} slug={slug} />}

      <div className="ms-section-head"><h2>Company Profile</h2><span>The information RUWĀD holds for your company</span></div>

      <div className="ms-grid">
        <ProfileCompleteness checks={checks} />

        {warnings.length > 0 && (
          <section className="ms-card ms-alert ms-wide">
            <header className="ms-card-head"><div><h3>Data quality warnings</h3><p>Fixing these improves how your profile appears to investors.</p></div></header>
            <ul className="ms-list">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </section>
        )}

        <Card title="Basic Information">
          <Rows rows={[["Legal name", show(s.legalName)], ["Headquarters", show(s.hq)], ["Founded", show(s.founded)], ["Business model", show(s.businessModel)], ["Employees", show(s.employees)], ["Website", show(s.website)]]} />
        </Card>

        <Card title="Funding Summary">
          <Rows rows={[
            ["Total raised", `SAR ${s.fundingTotal}M`],
            ["Valuation", `SAR ${s.valuation}M`],
            ["Funding rounds", s.rounds.length],
            ["Fundraising", s.fundraising ? (s.targetRaise ? `Yes — ${s.targetRaise}` : "Yes") : "Not currently"],
          ]} />
        </Card>

        <Card title="Team" subtitle={`${s.team.length} ${s.team.length === 1 ? "member" : "members"}`}>
          <ul className="ms-people">
            {s.team.map((t) => (
              <li key={t.name}>
                <span className="ms-avatar">{initials(t.name)}</span>
                <span className="ms-person"><b>{t.name}</b><span>{t.title}{t.founder ? " · Founder" : ""}</span></span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Product">
          <dl className="ms-prose">
            <div><dt>Problem</dt><dd>{show(s.problem)}</dd></div>
            <div><dt>Solution</dt><dd>{show(s.solution)}</dd></div>
            <div><dt>Competitive advantage</dt><dd>{show(s.advantage)}</dd></div>
          </dl>
        </Card>

        <Card title="Market">
          <Rows rows={[["Total addressable market (TAM)", show(s.market.tam)], ["Serviceable addressable market (SAM)", show(s.market.sam)], ["Serviceable obtainable market (SOM)", show(s.market.som)]]} />
        </Card>

        <Card title="Traction">
          <Rows rows={[["Revenue", show(s.traction.revenue)], ["Growth", show(s.traction.growth)], ["Customers", show(s.traction.customers)]]} />
        </Card>

        <Card title="Documents" subtitle="What is on file in your Data Room" className="ms-wide" action={<Link className="btn btn-outline btn-sm" href={`/workspace/startup/${slug}/data-room`}>Manage Data Room</Link>}>
          <ul className="ms-docs">
            {documents.map((d) => (
              <li key={d.id}>
                <span className="ms-doc-icon"><RuwadIcon name="doc" size={15} /></span>
                <span className="ms-doc-text">
                  <b>{d.name}</b>
                  <span className={`badge ${d.onFile ? "badge-good" : "badge-neutral"}`}>{d.onFile ? "On file" : "Not provided"}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
