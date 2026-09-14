"use client";

import { useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { EntityCard } from "@/components/shared/EntityCard";
import { ProvenanceStrip } from "@/components/shared/ProvenanceStrip";
import { LockedTeaser } from "@/components/shared/LockedTeaser";
import { DataRoomButton } from "@/components/shared/DataRoomButton";
import { DataRoomTab } from "@/components/shared/DataRoomTab";
import { RequestIntroModal } from "@/components/shared/RequestIntroModal";
import { useModal } from "@/components/shell/ModalProvider";
import { useSession, useIsSaved, useToggleSaved } from "@/hooks/use-store";
import { requireAuth } from "@/lib/store";
import { capForGuest } from "@/lib/auth-gate";
import { initials } from "@/lib/scoring";
import type { Investor } from "@/types/entities";

const TABS = ["Overview", "Investment Thesis", "Funds", "Portfolio", "Team", "Recent Investments", "Open Opportunities", "News", "Data Room"] as const;
type Tab = (typeof TABS)[number];
const tabSlug = (t: string) => t.toLowerCase().replace(/\s+/g, "");

export function InvestorProfilePage({ investor: v }: { investor: Investor }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const { loggedIn } = useSession();
  const saved = useIsSaved("investors", v.id);
  const toggleSaved = useToggleSaved();
  const { openModal } = useModal();

  return (
    <div className="entity-profile-page">
      <div className="profile-head">
        <div className="plogo" style={{ background: "var(--navy-900)" }}>{v.logo}</div>
        <div className="profile-head-main">
          <h1>{v.name}</h1>
          <div className="ptagline">{v.type}{v.founded ? ` · Est. ${v.founded}` : ""}</div>
          <div className="profile-meta">
            <span><RuwadIcon name="map" size={13} /> {v.city}</span>
            <span><RuwadIcon name="investors" size={13} /> {v.ticket}</span>
          </div>
          <ProvenanceStrip provenance={v.provenance} />
        </div>
        <div className="profile-actions">
          <button className="btn btn-outline" onClick={() => toggleSaved("investors", v.id)}><RuwadIcon name="star" size={14} /> {saved ? "Saved" : "Save"}</button>
          <button className="btn btn-primary btn-lg" onClick={() => { if (requireAuth("intro", { investorName: v.name })) openModal(<RequestIntroModal investorName={v.name} />); }}>Request Warm Introduction</button>
          <DataRoomButton companyId={v.id} />
        </div>
      </div>
      <div className="profile-tabs-wrap">
        <div className="tabs sticky">
          {TABS.map((t) => <button key={t} className={tabSlug(t) === tabSlug(tab) ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}
        </div>
      </div>
      <div className="mt-24">
        {tab === "Overview" ? (
          <Overview v={v} />
        ) : (
          <div className="profile-body" style={{ gridTemplateColumns: "1fr" }}>
            <div><TabBody tab={tab} v={v} loggedIn={loggedIn} /></div>
          </div>
        )}
      </div>
    </div>
  );
}

function Overview({ v }: { v: Investor }) {
  return (
    <div className="profile-body">
      <div>
        <div className="stat-mini-row">
          <div className="stat-mini"><div className="sm-label">AUM</div><div className="sm-val">{v.aum}</div></div>
          <div className="stat-mini"><div className="sm-label">Available Capital</div><div className="sm-val">{v.available}</div></div>
          <div className="stat-mini"><div className="sm-label">Investments</div><div className="sm-val">{v.investments}</div></div>
        </div>
        <div className="panel panel-pad mb-16"><h3 className="fs-13 mb-12">About</h3><p className="db-text">{v.desc}</p></div>
        <div className="panel panel-pad">
          <h3 className="fs-13 mb-12">Snapshot</h3>
          <div className="stat-mini-row">
            <div className="stat-mini"><div className="sm-label">Type</div><div className="sm-val fs-15">{v.type}</div></div>
            <div className="stat-mini"><div className="sm-label">Exits</div><div className="sm-val">{v.exits}</div></div>
            <div className="stat-mini"><div className="sm-label">Healthcare Deals</div><div className="sm-val">{v.hcDeals}</div></div>
            <div className="stat-mini"><div className="sm-label">Typical Ticket</div><div className="sm-val fs-15">{v.ticket}</div></div>
          </div>
        </div>
      </div>
      <div className="panel panel-pad">
        <div className="eyebrow brand mb-8">Stage Focus</div>
        <div className="chip-select mb-16">{v.stageFocus.map((s) => <span className="chip" key={s}>{s}</span>)}</div>
        <div className="eyebrow brand mb-8">Healthcare Focus</div>
        <div className="chip-select">{v.hcFocus.map((s) => <span className="chip" key={s}>{s}</span>)}</div>
      </div>
    </div>
  );
}

function TabBody({ tab, v, loggedIn }: { tab: Tab; v: Investor; loggedIn: boolean }) {
  switch (tab) {
    case "Investment Thesis":
      return <div className="panel panel-pad"><p className="db-text">{v.thesis || "No investment thesis on file."}</p></div>;
    case "Funds":
      return (
        <div className="panel panel-pad">
          <div className="stat-mini-row">
            <div className="stat-mini"><div className="sm-label">Current Fund</div><div className="sm-val fs-15">{v.name} Fund I (sample)</div></div>
            <div className="stat-mini"><div className="sm-label">AUM</div><div className="sm-val">{v.aum}</div></div>
            <div className="stat-mini"><div className="sm-label">Vintage</div><div className="sm-val">{v.founded || "—"}</div></div>
            <div className="stat-mini"><div className="sm-label">Status</div><div className="sm-val fs-15"><span className="badge badge-good">Actively investing</span></div></div>
          </div>
        </div>
      );
    case "Portfolio": {
      const items = v.portfolioDetailed ?? [];
      if (!items.length) return <div className="panel panel-pad"><span className="muted small">No public portfolio companies listed.</span></div>;
      const { shown, capped } = capForGuest(items, 3, !loggedIn);
      return (
        <>
          <div className="entity-grid">
            {shown.map((s) => (
              <EntityCard
                key={s.id} href={`/startups/${s.slug}`} logo={s.logo} logoUrl={s.logoUrl} name={s.name} subtitle={`${s.city} · ${s.category}`} desc={s.tagline}
                kind="startups" id={s.slug}
                meta={<><span className="tag">{s.stage}</span></>}
                foot={<><span className="escore">{s.score}</span><span className="small muted">RUWĀD Score</span></>}
              />
            ))}
          </div>
          {capped && (
            <div className="panel panel-pad mt-16">
              <LockedTeaser preview={`${items.length} portfolio companies total`} title="Unlock Complete Portfolio" body="See this investor's complete portfolio, not just a preview." blurLines={2} cta="Unlock Complete Portfolio" />
            </div>
          )}
        </>
      );
    }
    case "Team":
      return (
        <div className="team-grid">
          {v.team.map((t) => (
            <div className="team-card" key={t.name}><div className="tavatar">{initials(t.name)}</div><b>{t.name}</b><div className="trole">{t.title}</div></div>
          ))}
        </div>
      );
    case "Recent Investments":
      if (!loggedIn) return <div className="panel panel-pad"><LockedTeaser title="Unlock Deal Activity" body="Recent investments, investment patterns and co-investor intelligence are available to RUWĀD members." blurLines={3} cta="Unlock Deal Activity" /></div>;
      return (
        <div className="panel scroll-x">
          <table className="data-table">
            <thead><tr><th>Startup</th><th>Round</th><th>Date</th></tr></thead>
            <tbody>
              {v.recentDeals.map((d, i) => <tr key={i}><td className="cell-main">{d.startup}</td><td>{d.round}</td><td>{d.date}</td></tr>)}
            </tbody>
          </table>
        </div>
      );
    case "Open Opportunities":
      if (!v.openOpps?.length) return <div className="panel panel-pad"><span className="muted small">No open opportunities listed.</span></div>;
      return (
        <div className="panel panel-pad">
          {v.openOpps.map((o, i) => <div className="event-item" key={i}>{o}</div>)}
        </div>
      );
    case "News":
      return (
        <div className="panel panel-pad">
          {(v.news || []).map((n, i) => <div className="news-item" key={i}><div className="n-date">{n.date.slice(5)}</div><div><h5>{n.headline}</h5><div className="n-src">{n.source}</div></div></div>)}
        </div>
      );
    case "Data Room":
      return <DataRoomTab kind="investor" />;
    default:
      return null;
  }
}
