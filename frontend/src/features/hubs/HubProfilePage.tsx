"use client";

import { useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { EntityCard } from "@/components/shared/EntityCard";
import { ProvenanceStrip } from "@/components/shared/ProvenanceStrip";
import { DataRoomTab } from "@/components/shared/DataRoomTab";
import { ContactLock } from "@/components/shared/ContactLock";
import { useSession, useIsSaved, useToggleSaved } from "@/hooks/use-store";
import { useToast } from "@/components/shell/ToastProvider";
import { requireAuth } from "@/lib/store";
import type { Hub } from "@/types/entities";

const TABS = ["Overview", "Organization", "Programs", "Focus Areas", "Supported Companies", "Partnerships", "Documents", "Analytics", "Contacts"] as const;
type Tab = (typeof TABS)[number];
const tabSlug = (t: string) => t.toLowerCase().replace(/\s+/g, "");

export function HubProfilePage({ hub: h }: { hub: Hub }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const { loggedIn } = useSession();
  const saved = useIsSaved("hubs", h.id);
  const toggleSaved = useToggleSaved();
  const toast = useToast();

  function shareLink() {
    const url = `${location.origin}/hubs/${h.id}`;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => toast("Profile link copied to clipboard"), () => toast(url));
    else toast(url);
  }

  return (
    <div className="entity-profile-page">
      <div className="profile-head">
        <div className="plogo" style={{ background: "var(--navy-800)" }}>{h.logo}</div>
        <div className="profile-head-main">
          <h1>{h.name} <span className={`badge ${h.status === "Open" ? "badge-good" : "badge-neutral"}`} style={{ verticalAlign: "middle" }}>{h.status}</span></h1>
          <div className="ptagline">{h.desc}</div>
          <div className="profile-meta">
            <span><RuwadIcon name="map" size={13} /> {h.city}, {h.country}</span>
            <span><RuwadIcon name="hubs" size={13} /> {h.type}</span>
            <span><RuwadIcon name="dashboard" size={13} /> Founded {h.founded}</span>
          </div>
          <ProvenanceStrip provenance={h.provenance} />
        </div>
        <div className="profile-actions">
          <button className="btn btn-outline" onClick={() => toggleSaved("hubs", h.id)}><RuwadIcon name="star" size={14} /> {saved ? "Saved" : "Save"}</button>
          <button className="btn btn-primary" onClick={() => { if (!requireAuth("route", { label: "apply" })) return; toast("Application flow — demo only"); }}>Apply to Program</button>
          <button className="btn btn-outline" onClick={shareLink}>Share</button>
        </div>
      </div>
      <div className="profile-tabs-wrap">
        <div className="tabs sticky">
          {TABS.map((t) => <button key={t} className={tabSlug(t) === tabSlug(tab) ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}
        </div>
      </div>
      <div className="mt-24">
        {tab === "Overview" ? (
          <Overview h={h} />
        ) : (
          <div className="profile-body" style={{ gridTemplateColumns: "1fr" }}>
            <div><TabBody tab={tab} h={h} loggedIn={loggedIn} /></div>
          </div>
        )}
      </div>
    </div>
  );
}

function Overview({ h }: { h: Hub }) {
  return (
    <div className="profile-body" style={{ gridTemplateColumns: "1fr" }}>
      <div>
        <div className="stat-mini-row">
          <div className="stat-mini"><div className="sm-label">Programs</div><div className="sm-val">{h.programs.length}</div></div>
          <div className="stat-mini"><div className="sm-label">Startups Supported</div><div className="sm-val">{h.portfolio.length}</div></div>
          <div className="stat-mini"><div className="sm-label">Active Cohorts</div><div className="sm-val">{h.programs.filter((p) => p.status === "Open").length}</div></div>
          <div className="stat-mini"><div className="sm-label">Partners</div><div className="sm-val">{h.partnerships.length}</div></div>
          <div className="stat-mini"><div className="sm-label">Focus Sectors</div><div className="sm-val">{h.healthcareFocus.length}</div></div>
        </div>
        <div className="panel panel-pad">
          <h3 className="fs-13 mb-12">About</h3>
          <p className="db-text">{h.about}</p>
        </div>
      </div>
    </div>
  );
}

function TabBody({ tab, h, loggedIn }: { tab: Tab; h: Hub; loggedIn: boolean }) {
  const { hydrated } = useSession();
  switch (tab) {
    case "Organization":
      return (
        <div className="panel panel-pad">
          <div className="stat-mini-row">
            <div className="stat-mini"><div className="sm-label">Type</div><div className="sm-val fs-15">{h.type}</div></div>
            <div className="stat-mini"><div className="sm-label">Ownership</div><div className="sm-val fs-15">{h.ownershipType}</div></div>
            <div className="stat-mini"><div className="sm-label">Operating Region</div><div className="sm-val fs-15">{h.operatingRegion}</div></div>
            <div className="stat-mini"><div className="sm-label">Founded</div><div className="sm-val fs-15">{h.founded}</div></div>
            <div className="stat-mini"><div className="sm-label">Funding Available</div><div className="sm-val fs-15">{h.fundingAvailable}</div></div>
            <div className="stat-mini"><div className="sm-label">Funding Type</div><div className="sm-val fs-15">{h.fundingType}</div></div>
          </div>
        </div>
      );
    case "Programs":
      return (
        <div className="entity-grid">
          {h.programs.map((p) => (
            <div className="panel panel-pad" key={p.name}>
              <b className="fs-13">{p.name}</b>
              <dl className="kv-grid mt-8">
                <dt>Type</dt><dd>{p.type}</dd>
                <dt>Status</dt><dd><span className={`badge ${p.status === "Open" ? "badge-good" : "badge-neutral"}`}>{p.status}</span></dd>
                <dt>Duration</dt><dd>{p.duration}</dd>
                <dt>Format</dt><dd>{p.format}</dd>
                <dt>Location</dt><dd>{p.location}</dd>
                <dt>Cohort Size</dt><dd>{p.cohortSize}</dd>
                <dt>Deadline</dt><dd>{p.deadline}</dd>
              </dl>
            </div>
          ))}
        </div>
      );
    case "Focus Areas":
      return (
        <div className="panel panel-pad">
          <div className="eyebrow brand mb-8">Healthcare Focus</div>
          <div className="chip-select mb-16">{h.healthcareFocus.map((s) => <span className="chip" key={s}>{s}</span>)}</div>
          <div className="eyebrow brand mb-8">Focus Areas</div>
          <div className="chip-select mb-16">{h.focusAreas.map((s) => <span className="chip" key={s}>{s}</span>)}</div>
          <div className="eyebrow brand mb-8">Stages Supported</div>
          <div className="chip-select mb-16">{h.stagesSupported.map((s) => <span className="chip" key={s}>{s}</span>)}</div>
          <div className="eyebrow brand mb-8">Geographic Coverage</div>
          <div className="chip-select">{h.geographicCoverage.map((s) => <span className="chip" key={s}>{s}</span>)}</div>
        </div>
      );
    case "Supported Companies": {
      if (!h.portfolio.length) return <div className="panel panel-pad"><span className="muted small">No supported companies listed.</span></div>;
      return (
        <div className="entity-grid">
          {h.portfolio.map((item) => {
            if (!item.startupSlug) {
              return (
                <div className="entity-card" key={item.name}>
                  <div className="etitle"><b>{item.name}</b><span>{item.location} · {item.sector}</span></div>
                  <div className="emeta"><span className="tag">{item.stage}</span><span className="tag">{item.program}</span></div>
                </div>
              );
            }
            return (
              <EntityCard
                key={item.startupId} href={`/startups/${item.startupSlug}`} logo={item.startupLogo ?? ""} name={item.name} subtitle={`${item.location} · ${item.startupCategory ?? item.sector}`} desc={item.startupTagline ?? ""}
                kind="startups" id={item.startupSlug}
                meta={<><span className="tag">{item.program}</span><span className="tag">{item.stage}</span></>}
                foot={<><span className="escore">{item.startupScore}</span><span className="small muted">RUWĀD Score</span></>}
              />
            );
          })}
        </div>
      );
    }
    case "Partnerships":
      if (!h.partnerships.length) return <div className="panel panel-pad"><span className="muted small">No partnerships listed.</span></div>;
      return (
        <div className="panel panel-pad">
          {h.partnerships.map((p, i) => (
            <div className="event-item" key={i}><b>{p.partner}</b><span className="tag" style={{ marginLeft: 8 }}>{p.type}</span><p className="small mt-4">{p.desc}</p></div>
          ))}
        </div>
      );
    case "Documents":
      return <DataRoomTab kind="hub" entityId={h.entityId} />;
    case "Analytics":
      return (
        <div className="traction-grid">
          <div className="kpi"><div className="k-label">Programs</div><div className="k-val fs-16">{h.programs.length}</div></div>
          <div className="kpi"><div className="k-label">Companies Supported</div><div className="k-val fs-16">{h.portfolio.length}</div></div>
          <div className="kpi"><div className="k-label">Partners</div><div className="k-val fs-16">{h.partnerships.length}</div></div>
          <div className="kpi"><div className="k-label">Focus Sectors</div><div className="k-val fs-16">{h.healthcareFocus.length}</div></div>
        </div>
      );
    case "Contacts":
      return (
        <div className="panel panel-pad">
          <div className="stat-mini-row">
            <div className="stat-mini"><div className="sm-label">Program Contact</div><div className="sm-val fs-15">{h.contacts.programContact}</div></div>
            <div className="stat-mini"><div className="sm-label">Email</div><div className="sm-val fs-15">{!hydrated ? <span className="skel" style={{ width: 90 }} /> : loggedIn ? h.contacts.email : <ContactLock />}</div></div>
            <div className="stat-mini"><div className="sm-label">Phone</div><div className="sm-val fs-15">{!hydrated ? <span className="skel" style={{ width: 70 }} /> : loggedIn ? h.contacts.phone : <ContactLock />}</div></div>
            <div className="stat-mini"><div className="sm-label">Website</div><div className="sm-val fs-15">{h.contacts.website}</div></div>
            <div className="stat-mini"><div className="sm-label">HQ</div><div className="sm-val fs-15">{h.contacts.hq}</div></div>
          </div>
        </div>
      );
    default:
      return null;
  }
}
