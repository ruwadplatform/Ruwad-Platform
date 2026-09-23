"use client";

import { useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { ProvenanceStrip } from "@/components/shared/ProvenanceStrip";
import { OrganizationLogo } from "@/components/shared/OrganizationLogo";
import { DataRoomTab } from "@/components/shared/DataRoomTab";
import { ContactLock } from "@/components/shared/ContactLock";
import { LockedTeaser } from "@/components/shared/LockedTeaser";
import { useSession, useIsSaved, useToggleSaved } from "@/hooks/use-store";
import { useToast } from "@/components/shell/ToastProvider";
import { requireAuth } from "@/lib/store";
import { regBadgeClass } from "@/lib/widgets";
import type { Multinational } from "@/types/entities";

/* NOTE — explicit product rule: no RUWĀD startup score anywhere on this
 * page. Multinationals aren't scored the way early-stage startups are. */
const TABS = ["Overview", "Company", "Products", "Market Presence", "Innovation & R&D", "Partnerships", "Investments", "Documents", "Analytics", "Contacts"] as const;
type Tab = (typeof TABS)[number];
const tabSlug = (t: string) => t.toLowerCase().replace(/\s+/g, "");

export function MultinationalProfilePage({ mnc: m }: { mnc: Multinational }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const { loggedIn } = useSession();
  const saved = useIsSaved("multinationals", m.id);
  const toggleSaved = useToggleSaved();
  const toast = useToast();

  function shareLink() {
    const url = `${location.origin}/multinationals/${m.id}`;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => toast("Profile link copied to clipboard"), () => toast(url));
    else toast(url);
  }

  return (
    <div className="entity-profile-page">
      <div className="profile-head">
        <OrganizationLogo logo={m.logo} logoUrl={m.logoUrl} className="plogo" style={{ background: "var(--navy-900)" }} />
        <div className="profile-head-main">
          <h1>{m.name}</h1>
          <div className="ptagline">{m.tagline}</div>
          <div className="profile-meta">
            <span><RuwadIcon name="map" size={13} /> {m.hq}</span>
            <span><RuwadIcon name="startups" size={13} /> {m.category}</span>
            <span><RuwadIcon name="dashboard" size={13} /> Founded {m.founded}</span>
          </div>
          <ProvenanceStrip provenance={m.provenance} />
        </div>
        <div className="profile-actions">
          <button className="btn btn-outline" onClick={() => toggleSaved("multinationals", m.id)}><RuwadIcon name="star" size={14} /> {saved ? "Saved" : "Save"}</button>
          <button className="btn btn-primary" onClick={() => { if (!requireAuth("route", { label: "partner" })) return; toast("Partnership inquiry — demo only"); }}>Request Partnership</button>
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
          <Overview m={m} />
        ) : (
          <div className="profile-body" style={{ gridTemplateColumns: "1fr" }}>
            <div><TabBody tab={tab} m={m} loggedIn={loggedIn} /></div>
          </div>
        )}
      </div>
    </div>
  );
}

function Overview({ m }: { m: Multinational }) {
  return (
    <div className="profile-body" style={{ gridTemplateColumns: "1fr" }}>
      <div>
        <div className="stat-mini-row">
          <div className="stat-mini"><div className="sm-label">Countries</div><div className="sm-val">{m.menaPresence.countriesActiveIn.length}</div></div>
          <div className="stat-mini"><div className="sm-label">Employees</div><div className="sm-val">{m.employees.toLocaleString()}+</div></div>
          <div className="stat-mini"><div className="sm-label">Healthcare Products</div><div className="sm-val">{m.products.length}</div></div>
          <div className="stat-mini"><div className="sm-label">R&D Centers</div><div className="sm-val">{m.rdCenters}</div></div>
          <div className="stat-mini"><div className="sm-label">Regional Partnerships</div><div className="sm-val">{m.partnershipsList.length}</div></div>
          <div className="stat-mini"><div className="sm-label">Saudi Operations</div><div className="sm-val fs-15">{m.menaPresence.saudiOffice ? "Active" : "None"}</div></div>
        </div>
        <div className="panel panel-pad">
          <h3 className="fs-13 mb-12">About</h3>
          <p className="db-text">{m.desc}</p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, val, small }: { label: string; val: React.ReactNode; small?: boolean }) {
  return <div className="stat-mini"><div className="sm-label">{label}</div><div className={`sm-val ${small ? "fs-13" : "fs-15"}`}>{val}</div></div>;
}

function TabBody({ tab, m, loggedIn }: { tab: Tab; m: Multinational; loggedIn: boolean }) {
  const { hydrated } = useSession();
  switch (tab) {
    case "Company":
      return (
        <div className="panel panel-pad">
          <div className="stat-mini-row">
            <Stat label="Legal Name" val={m.legalName} />
            <Stat label="Sector" val={m.category} />
            <Stat label="Subsector" val={m.subsector} />
            <Stat label="Headquarters" val={m.hq} />
            <Stat label="Founded" val={m.founded} />
            <Stat label="Company Size" val={m.companySize} />
            <Stat label="Business Model" val={m.businessModel} />
            <Stat label="Status" val={<span className="badge badge-good">{m.status}</span>} />
            <Stat label="Website" val={m.website} />
            <Stat label="Email" val={!hydrated ? <span className="skel" style={{ width: 90 }} /> : loggedIn ? m.email : <ContactLock />} />
            <Stat label="Phone" val={!hydrated ? <span className="skel" style={{ width: 70 }} /> : loggedIn ? m.phone : <ContactLock />} />
            <Stat label="LinkedIn" val={m.linkedin} />
          </div>
        </div>
      );
    case "Products":
      return (
        <div className="entity-grid">
          {m.products.map((p) => (
            <div className="panel panel-pad" key={p.name}>
              <b className="fs-13">{p.name}</b>
              <span className="tag" style={{ marginLeft: 8 }}>{p.category}</span>
              <p className="small muted mt-8">{p.description}</p>
            </div>
          ))}
        </div>
      );
    case "Market Presence":
      return (
        <div className="panel panel-pad">
          <div className="stat-mini-row">
            <Stat label="Saudi Office" val={m.menaPresence.saudiOffice ? "Yes" : "No"} />
            <Stat label="Regional Headquarters" val={m.menaPresence.regionalHeadquarters ? "Yes" : "No"} />
            <Stat label="Manufacturing" val={m.menaPresence.manufacturing ? "Yes" : "No"} />
            <Stat label="Distribution" val={m.menaPresence.distribution ? "Yes" : "No"} />
            <Stat label="Clinical Operations" val={m.menaPresence.clinicalOperations ? "Yes" : "No"} />
            <Stat label="Training Centers" val={m.menaPresence.trainingCenters ? "Yes" : "No"} />
            <Stat label="Research Operations" val={m.menaPresence.researchOperations ? "Yes" : "No"} />
            <Stat label="Regional Employees" val={m.menaPresence.regionalEmployees} />
          </div>
          <div className="mt-16">
            <h4 className="eyebrow mb-8">Countries Active In</h4>
            <div className="chip-select">{m.menaPresence.countriesActiveIn.map((c) => <span className="chip" key={c}>{c}</span>)}</div>
          </div>
        </div>
      );
    case "Innovation & R&D":
      return (
        <div className="panel panel-pad">
          <div className="stat-mini-row">
            <Stat label="R&D Centers" val={m.rdCenters} />
            <Stat label="R&D Focus" val={m.rdFocus} small />
            <Stat label="Open Innovation" val={m.openInnovation ? "Yes" : "No"} />
            <Stat label="Startup Collaboration" val={m.startupCollaboration ? "Yes" : "No"} />
            <Stat label="Tech Scouting" val={m.techScouting ? "Yes" : "No"} />
          </div>
          {m.startupProgramsList.length > 0 && (
            <div className="mt-16">
              <h4 className="eyebrow mb-8">Startup Programs</h4>
              {m.startupProgramsList.map((p) => (
                <div className="event-item" key={p.name}><b>{p.name}</b><span className="badge badge-good" style={{ marginLeft: 8 }}>{p.status}</span><p className="small mt-4">{p.geography} · {p.focus.join(", ")}</p></div>
              ))}
            </div>
          )}
        </div>
      );
    case "Partnerships":
      return (
        <div className="panel panel-pad">
          {m.partnershipsList.map((p, i) => (
            <div className="event-item" key={i}><b>{p.type}</b><p className="small mt-4">{p.desc}</p></div>
          ))}
        </div>
      );
    case "Investments":
      if (!loggedIn) return <div className="panel panel-pad"><LockedTeaser title="Unlock Investment Intelligence" body="See which startups this multinational has backed or piloted with." blurLines={3} cta="Unlock Investment Intelligence" /></div>;
      if (!m.investmentsList.length) return <div className="panel panel-pad"><span className="muted small">No regional investments on record.</span></div>;
      return (
        <div className="panel scroll-x">
          <table className="data-table">
            <thead><tr><th>Company</th><th>Sector</th><th>Round</th><th>Year</th></tr></thead>
            <tbody>{m.investmentsList.map((iv, i) => <tr key={i}><td className="cell-main">{iv.company}</td><td>{iv.sector}</td><td>{iv.round}</td><td>{iv.year}</td></tr>)}</tbody>
          </table>
        </div>
      );
    case "Documents":
      return <DataRoomTab kind="multinational" entityId={m.entityId} />;
    case "Analytics":
      return (
        <div className="traction-grid">
          <div className="kpi"><div className="k-label">Regional Employees</div><div className="k-val fs-16">{m.employees.toLocaleString()}+</div></div>
          <div className="kpi"><div className="k-label">Products</div><div className="k-val fs-16">{m.products.length}</div></div>
          <div className="kpi"><div className="k-label">R&D Centers</div><div className="k-val fs-16">{m.rdCenters}</div></div>
          <div className="kpi"><div className="k-label">Partnerships</div><div className="k-val fs-16">{m.partnershipsList.length}</div></div>
          <div className="kpi"><div className="k-label">Startup Programs</div><div className="k-val fs-16">{m.startupProgramsList.length}</div></div>
          <div className="kpi"><div className="k-label">SFDA Status</div><div className="k-val"><span className={`badge ${regBadgeClass(m.regulatory.sfda)}`}>{m.regulatory.sfda}</span></div></div>
        </div>
      );
    case "Contacts":
      return (
        <div className="panel panel-pad">
          <div className="stat-mini-row">
            <div className="stat-mini"><div className="sm-label">Website</div><div className="sm-val fs-15">{m.website}</div></div>
            <div className="stat-mini"><div className="sm-label">Email</div><div className="sm-val fs-15">{!hydrated ? <span className="skel" style={{ width: 90 }} /> : loggedIn ? m.email : <ContactLock />}</div></div>
            <div className="stat-mini"><div className="sm-label">Phone</div><div className="sm-val fs-15">{!hydrated ? <span className="skel" style={{ width: 70 }} /> : loggedIn ? m.phone : <ContactLock />}</div></div>
            <div className="stat-mini"><div className="sm-label">LinkedIn</div><div className="sm-val fs-15">{m.linkedin}</div></div>
          </div>
        </div>
      );
    default:
      return null;
  }
}
