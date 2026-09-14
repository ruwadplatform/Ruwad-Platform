"use client";

import { useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { EntityCard } from "@/components/shared/EntityCard";
import { ScoreCard } from "@/components/shared/ScoreCard";
import { Sparkline } from "@/components/shared/Sparkline";
import { ProvenanceStrip } from "@/components/shared/ProvenanceStrip";
import { ContactLock } from "@/components/shared/ContactLock";
import { LockedTeaser } from "@/components/shared/LockedTeaser";
import { DataRoomButton } from "@/components/shared/DataRoomButton";
import { DataRoomTab } from "@/components/shared/DataRoomTab";
import { CompareModal } from "@/components/shared/CompareModal";
import { ClaimModal } from "@/components/shared/ClaimModal";
import { RequestIntroModal } from "@/components/shared/RequestIntroModal";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession, useIsSaved, useToggleSaved } from "@/hooks/use-store";
import { requireAuth, getClaimForStartup, getMyClaim } from "@/lib/store";
import { regBadgeClass, synthesizeQuarterlyTrend } from "@/lib/widgets";
import { initials } from "@/lib/scoring";
import { useStartups, useInvestors } from "@/hooks/use-directory-data";
import type { Startup } from "@/types/entities";

const TABS = ["Overview", "Company", "Product", "Clinical", "Regulatory", "Market", "Funding", "Team", "Investors", "Traction", "News", "Data Room"] as const;
type Tab = (typeof TABS)[number];
const tabSlug = (t: string) => t.toLowerCase().replace(/\s+/g, "");

export function StartupProfilePage({ startup }: { startup: Startup }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const { loggedIn } = useSession();
  const saved = useIsSaved("startups", startup.id);
  const toggleSaved = useToggleSaved();
  const { openModal } = useModal();
  const toast = useToast();

  function shareLink() {
    const url = `${location.origin}/startups/${startup.id}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => toast("Profile link copied to clipboard"), () => toast(url));
    } else {
      toast(url);
    }
  }

  return (
    <div className="entity-profile-page">
      <div className="profile-head">
        <div className="plogo">{startup.logo}</div>
        <div className="profile-head-main">
          <h1>{startup.name} <span style={{ verticalAlign: "middle" }}><VerifiedBadge status={startup.verified} /></span></h1>
          <div className="ptagline">{startup.tagline}</div>
          <div className="profile-meta">
            <span><RuwadIcon name="map" size={13} /> {startup.city}, {startup.country}</span>
            <span><RuwadIcon name="startups" size={13} /> {startup.category}</span>
            <span><RuwadIcon name="bi" size={13} /> {startup.stage}</span>
            <span><RuwadIcon name="dashboard" size={13} /> Founded {startup.founded}</span>
          </div>
          <ProvenanceStrip provenance={startup.provenance} />
        </div>
        <div className="profile-actions">
          <button className="btn btn-outline" onClick={() => toggleSaved("startups", startup.id)}><RuwadIcon name="star" size={14} /> {saved ? "Saved" : "Save"}</button>
          <button className="btn btn-outline" onClick={() => toast(`Now following ${startup.name}`)}>Follow</button>
          <button className="btn btn-primary" onClick={() => { if (requireAuth("intro", { startupName: startup.name })) openModal(<RequestIntroModal startupName={startup.name} />); }}>Request Introduction</button>
          <DataRoomButton companyId={startup.id} />
          <button className="btn btn-outline" onClick={() => { if (requireAuth("compare", { id: startup.id })) openModal(<CompareModal initialId={startup.id} />, "xwide"); }}>Compare</button>
          <button className="btn btn-outline" onClick={shareLink}>Share</button>
          <ClaimCta startupId={startup.id} startupName={startup.name} verified={startup.verified} loggedIn={loggedIn} />
        </div>
      </div>
      <div className="profile-tabs-wrap">
        <div className="tabs sticky">
          {TABS.map((t) => (
            <button key={t} className={tabSlug(t) === tabSlug(tab) ? "active" : ""} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
      </div>
      <div className="mt-24">
        {tab === "Overview" ? (
          <Overview s={startup} loggedIn={loggedIn} />
        ) : (
          <div className="profile-body" style={{ gridTemplateColumns: "1fr" }}>
            <div><TabBody tab={tab} s={startup} loggedIn={loggedIn} /></div>
          </div>
        )}
      </div>
    </div>
  );
}

function VerifiedBadge({ status }: { status: Startup["verified"] }) {
  if (status === "verified") return <span className="badge badge-good" title="Regulatory and clinical documentation reviewed by RUWĀD"><RuwadIcon name="check" size={10} /> Verified</span>;
  if (status === "self-reported") return <span className="badge badge-warn" title="Submitted by the company; not independently reviewed"><RuwadIcon name="help" size={10} /> Self-Reported</span>;
  return <span className="badge badge-neutral" title="This profile has not been claimed or reviewed"><RuwadIcon name="help" size={10} /> Unclaimed Profile</span>;
}

function ClaimCta({ startupId, startupName, verified, loggedIn }: { startupId: string; startupName: string; verified: Startup["verified"]; loggedIn: boolean }) {
  const { openModal } = useModal();
  const toast = useToast();
  if (verified !== "unclaimed") return null;
  const claim = getClaimForStartup(startupId);
  if (!claim) {
    return (
      <button
        className="btn btn-outline"
        onClick={() => {
          if (!requireAuth("claim-company", { startupId })) return;
          if (getClaimForStartup(startupId)) { toast("This listing already has a claim under review"); return; }
          if (getMyClaim()) { toast("You already have a claim under review — one company claim per account"); return; }
          openModal(<ClaimModal startupId={startupId} startupName={startupName} />);
        }}
      >
        <RuwadIcon name="check" size={14} /> Claim This Listing
      </button>
    );
  }
  const mine = loggedIn && getMyClaim()?.id === claim.id;
  return (
    <button className="btn btn-outline" disabled title={mine ? "Your claim is under review" : "A claim for this listing is already under review"}>
      <RuwadIcon name="clock" size={14} /> {mine ? "Your Claim: Pending Review" : "Claim Pending Review"}
    </button>
  );
}

function Overview({ s, loggedIn }: { s: Startup; loggedIn: boolean }) {
  const { data: allStartups } = useStartups();
  return (
    <div className="profile-body">
      <div>
        <div className="stat-mini-row">
          {loggedIn && <div className="stat-mini"><div className="sm-label">Total Funding</div><div className="sm-val">SAR {s.fundingTotal}M</div></div>}
          <div className="stat-mini"><div className="sm-label">Employees</div><div className="sm-val">{s.employees}</div></div>
          <div className="stat-mini"><div className="sm-label">Founded</div><div className="sm-val">{s.founded}</div></div>
        </div>
        <div className="panel panel-pad mb-16">
          <h3 className="fs-13 mb-12">About</h3>
          <p className="db-text">{s.desc}</p>
        </div>
        <div className="panel panel-pad">
          <h3 className="fs-13 mb-12">Key Information</h3>
          <div className="stat-mini-row">
            <div className="stat-mini"><div className="sm-label">Legal Name</div><div className="sm-val fs-15">{s.legalName}</div></div>
            <div className="stat-mini"><div className="sm-label">Headquarters</div><div className="sm-val fs-15">{s.hq}</div></div>
            <div className="stat-mini"><div className="sm-label">Founded</div><div className="sm-val fs-15">{s.founded}</div></div>
            <div className="stat-mini"><div className="sm-label">Website</div><div className="sm-val fs-15">{s.website}</div></div>
            <div className="stat-mini"><div className="sm-label">Business Model</div><div className="sm-val fs-15">{s.businessModel}</div></div>
            <div className="stat-mini"><div className="sm-label">Healthcare Category</div><div className="sm-val fs-15">{s.category}</div></div>
          </div>
        </div>
      </div>
      <div><ScoreCard score={s.score} sub={s.sub} category={s.category} peers={allStartups} loggedIn={loggedIn} /></div>
    </div>
  );
}

function Stat({ label, val, small }: { label: string; val: React.ReactNode; small?: boolean }) {
  return <div className="stat-mini"><div className="sm-label">{label}</div><div className={`sm-val ${small ? "fs-13" : "fs-15"}`}>{val}</div></div>;
}

function TabBody({ tab, s, loggedIn }: { tab: Tab; s: Startup; loggedIn: boolean }) {
  switch (tab) {
    case "Company":
      return (
        <div className="panel panel-pad">
          <div className="stat-mini-row">
            <Stat label="Legal Name" val={s.legalName} />
            <Stat label="Former Name" val={s.formerName} />
            <Stat label="Registration No." val={<span className="mono">{s.registrationNumber}</span>} />
            <Stat label="Business Model" val={s.businessModel} />
            <Stat label="Status" val={<span className="badge badge-good">{s.status}</span>} />
            <Stat label="Employees" val={s.employees} />
            <Stat label="Country" val={s.country} />
            <Stat label="City" val={s.city} />
            <Stat label="Email" val={loggedIn ? s.email : <ContactLock />} />
            <Stat label="Phone" val={loggedIn ? s.phone : <ContactLock />} />
            <Stat label="Website" val={s.website} />
            <Stat label="LinkedIn" val={s.linkedin} />
          </div>
        </div>
      );
    case "Product":
      return (
        <div className="panel panel-pad">
          <div className="stat-mini-row" style={{ gridTemplateColumns: "1fr" }}>
            <div className="stat-mini"><div className="sm-label">Subsector</div><div className="sm-val fs-15 sm-val-wrap">{s.subsector}</div></div>
            <div className="stat-mini"><div className="sm-label">Problem</div><div className="sm-val fs-15 sm-val-wrap">{s.problem}</div></div>
            <div className="stat-mini"><div className="sm-label">Solution</div><div className="sm-val fs-15 sm-val-wrap">{s.solution}</div></div>
            <div className="stat-mini"><div className="sm-label">Competitive Advantage</div><div className="sm-val fs-15 sm-val-wrap">{s.advantage}</div></div>
          </div>
        </div>
      );
    case "Clinical":
      if (!loggedIn) return <div className="panel panel-pad"><LockedTeaser title="Unlock Clinical & Regulatory Intelligence" body="Clinical validation status, IP/patent detail and target market sizing are available to RUWĀD members." blurLines={3} cta="Unlock Clinical Intelligence" /></div>;
      return (
        <div className="panel panel-pad">
          <div className="stat-mini-row">
            <Stat label="Clinical Validation" val={s.regulatory.clinical} />
            <Stat label="Patents / IP" val={s.regulatory.patent} />
            <Stat label="Target Market Size" val={s.market.tam} small />
          </div>
        </div>
      );
    case "Regulatory": {
      const sfda = <Stat label="SFDA Status" val={<span className={`badge ${regBadgeClass(s.regulatory.sfda)}`}>{s.regulatory.sfda}</span>} />;
      if (!loggedIn) {
        return (
          <div className="panel panel-pad">
            <div className="stat-mini-row mb-16" style={{ gridTemplateColumns: "minmax(160px,240px)" }}>{sfda}</div>
            <LockedTeaser title="Unlock Detailed Regulatory Intelligence" body="FDA/CE status, clinical validation and patent detail are available to RUWĀD members." blurLines={3} cta="Unlock Regulatory Intelligence" />
          </div>
        );
      }
      return (
        <div className="panel panel-pad">
          <div className="stat-mini-row">
            {sfda}
            <Stat label="FDA Status" val={s.regulatory.fda} />
            <Stat label="CE Mark" val={s.regulatory.ce} />
            <Stat label="Clinical Validation" val={s.regulatory.clinical} />
            <Stat label="Patent Status" val={s.regulatory.patent} />
          </div>
        </div>
      );
    }
    case "Market":
      if (!loggedIn) return <div className="panel panel-pad"><LockedTeaser title="Unlock Market Intelligence" body="TAM/SAM/SOM sizing and competitor analysis are available to RUWĀD members." blurLines={3} cta="Unlock Market Intelligence" /></div>;
      return (
        <>
          <div className="panel panel-pad mb-16">
            <div className="stat-mini-row">
              <div className="stat-mini"><div className="sm-label">TAM</div><div className="sm-val">{s.market.tam}</div></div>
              <div className="stat-mini"><div className="sm-label">SAM</div><div className="sm-val">{s.market.sam}</div></div>
              <div className="stat-mini"><div className="sm-label">SOM</div><div className="sm-val">{s.market.som}</div></div>
            </div>
          </div>
          <div className="panel panel-pad">
            <h4 className="eyebrow mb-8">Competitors</h4>
            <ul className="fs-12" style={{ paddingLeft: 18, lineHeight: "var(--line-height-relaxed)" }}>{s.market.competitors.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        </>
      );
    case "Funding": {
      const overview = (
        <div className="panel panel-pad mb-16">
          <div className="stat-mini-row">
            <div className="stat-mini"><div className="sm-label">Total Raised</div><div className="sm-val">SAR {s.fundingTotal}M</div></div>
            <div className="stat-mini"><div className="sm-label">Funding Stage</div><div className="sm-val fs-15">{s.stage}</div></div>
            <div className="stat-mini"><div className="sm-label">Last Round</div><div className="sm-val fs-15">{s.rounds[s.rounds.length - 1]?.round || "—"}</div></div>
          </div>
        </div>
      );
      if (!loggedIn) {
        return (
          <>
            {overview}
            <div className="panel panel-pad">
              <h3 className="fs-13 mb-16">Funding History</h3>
              <LockedTeaser title="Unlock Funding Intelligence" body="See round-by-round amounts, valuation, investor participation and complete funding history." blurLines={Math.min(5, Math.max(2, s.rounds.length))} cta="Unlock Funding Intelligence" />
            </div>
          </>
        );
      }
      return (
        <>
          {overview}
          <div className="panel panel-pad mb-16">
            <div className="stat-mini-row">
              <div className="stat-mini"><div className="sm-label">Valuation</div><div className="sm-val">SAR {s.valuation}M</div></div>
              <div className="stat-mini"><div className="sm-label">Fundraising</div><div className="sm-val fs-15">{s.fundraising ? `Yes — ${s.targetRaise || ""}` : "Not currently"}</div></div>
            </div>
          </div>
          <div className="panel panel-pad">
            <h3 className="fs-13 mb-16">Funding Timeline</h3>
            <div className="funding-timeline">
              {s.rounds.map((r, i) => (
                <div className="ft-item" key={i}>
                  <div className="ft-top"><span className="ft-round">{r.round}</span><span className="ft-amt mono">SAR {r.amount}M</span></div>
                  <div className="ft-meta">{r.date} · Lead: {r.lead}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      );
    }
    case "Team":
      return (
        <div className="team-grid">
          {s.team.map((t) => (
            <div className="team-card" key={t.name}>
              <div className="tavatar">{initials(t.name)}</div><b>{t.name}</b>
              <div className="trole">{t.title}{t.founder ? " · Founder" : ""}</div>
              <TeamLinkedInButton />
            </div>
          ))}
        </div>
      );
    case "Investors": {
      const investorIds = s.investorIds ?? [];
      if (!loggedIn) {
        return (
          <div className="panel panel-pad">
            <LockedTeaser preview={`${investorIds.length} investor${investorIds.length === 1 ? "" : "s"} on record`} title="Unlock Investor Intelligence" body="See which investors backed this company, co-investment patterns and participation history." blurLines={3} cta="Unlock Investor Intelligence" />
          </div>
        );
      }
      return <InvestorsTabBody investorIds={investorIds} />;
    }
    case "Traction": {
      if (!loggedIn) return <div className="panel panel-pad"><LockedTeaser title="Unlock Traction & Growth Intelligence" body="Revenue, growth trend, customer and partnership metrics are available to RUWĀD members." blurLines={4} cta="Unlock Traction Intelligence" /></div>;
      const t = s.traction;
      const items: [string, React.ReactNode][] = [["Revenue", t.revenue], ["Growth", t.growth], ["Customers", t.customers], ["Users", t.users], ["Partnerships", t.partnerships], ["Pilots", t.pilots], ["Markets", t.markets], ["Awards", t.awards]];
      const revenueNum = parseFloat(String(t.revenue).replace(/[^0-9.]/g, ""));
      const growthPct = parseFloat(String(t.growth).replace(/[^0-9.-]/g, "")) / 100;
      const showTrend = revenueNum && !isNaN(growthPct);
      return (
        <>
          {showTrend && (
            <div className="panel panel-pad mb-16">
              <div className="flex" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div className="eyebrow">Revenue Trend</div>
                  <b className="fs-15">{t.revenue}</b> <span className="small" style={{ fontWeight: 600, color: growthPct >= 0 ? "var(--good)" : "var(--crit)" }}>{t.growth}</span>
                </div>
                <Sparkline values={synthesizeQuarterlyTrend(revenueNum, growthPct, 6, s.id)} w={180} h={44} />
              </div>
              <div className="small muted mt-8">Last 6 quarters, reconstructed from reported YoY growth — illustrative, not a filed time series.</div>
            </div>
          )}
          <div className="traction-grid">
            {items.map(([l, v]) => <div className="kpi" key={l}><div className="k-label">{l}</div><div className="k-val fs-16">{v}</div></div>)}
          </div>
        </>
      );
    }
    case "News":
      return (
        <div className="panel panel-pad">
          {s.newsItems.map((n, i) => (
            <div className="news-item" key={i}><div className="n-date">{n.date.slice(5)}</div><div><h5>{n.headline}</h5><div className="n-src">{n.source}</div></div></div>
          ))}
        </div>
      );
    case "Data Room":
      return <DataRoomTab kind="startup" />;
    default:
      return null;
  }
}

function TeamLinkedInButton() {
  const toast = useToast();
  return <button className="icon-btn" style={{ margin: "0 auto" }} onClick={() => toast("LinkedIn — demo only")}><RuwadIcon name="linkedin" size={14} /></button>;
}

function InvestorsTabBody({ investorIds }: { investorIds: string[] }) {
  const { data: investors } = useInvestors();
  return (
    <div className="entity-grid">
      {investorIds.map((id) => {
        const v = investors.find((x) => x.id === id);
        if (!v) return <div className="entity-card" key={id}><b>Undisclosed investor</b></div>;
        return (
          <EntityCard
            key={v.id} href={`/investors/${v.id}`} logo={v.logo} logoUrl={v.logoUrl} logoStyle={{ background: "var(--navy-900)", color: "#fff" }}
            name={v.name} subtitle={`${v.city} · ${v.type}`} desc={v.desc} kind="investors" id={v.id}
            meta={<><span className="tag">{v.ticket}</span><span className="tag">{v.hcFocus.length} focus areas</span></>}
            foot={<span className="small muted">{v.portfolio.length} in portfolio</span>}
          />
        );
      })}
    </div>
  );
}
