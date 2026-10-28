"use client";

import { useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { ProvenanceStrip } from "@/components/shared/ProvenanceStrip";
import { OrganizationLogo } from "@/components/shared/OrganizationLogo";
import { ContactLock } from "@/components/shared/ContactLock";
import { useSession, useIsSaved, useToggleSaved } from "@/hooks/use-store";
import { useToast } from "@/components/shell/ToastProvider";
import { requireAuth } from "@/lib/store";
import type { ResearchInstitution } from "@/types/entities";
import { StatCard } from "@/components/shared/StatCard";

/* NOTE — explicit product rule: Research & Academia profiles have NO Data
 * Room tab and NO NDA/fundraising-document machinery anywhere on this
 * page. These are knowledge/collaboration profiles, not fundraising
 * profiles — do not add one later without a real product decision to do so. */
const TABS = ["Overview", "Institution", "Research Areas", "Projects", "Publications", "Technologies", "Collaborations", "Researchers", "Analytics", "Contacts"] as const;
type Tab = (typeof TABS)[number];
const tabSlug = (t: string) => t.toLowerCase().replace(/\s+/g, "");

export function ResearchProfilePage({ institution: r }: { institution: ResearchInstitution }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const { loggedIn } = useSession();
  const saved = useIsSaved("research", r.id);
  const toggleSaved = useToggleSaved();
  const toast = useToast();

  function shareLink() {
    const url = `${location.origin}/research/${r.id}`;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => toast("Profile link copied to clipboard"), () => toast(url));
    else toast(url);
  }

  return (
    <div className="entity-profile-page">
      <div className="profile-head">
        <OrganizationLogo logo={r.logo} logoUrl={r.logoUrl} className="plogo" style={{ background: "var(--navy-700)" }} />
        <div className="profile-head-main">
          <h1>{r.name}</h1>
          <div className="ptagline">{r.type}{r.founded ? ` · Est. ${r.founded}` : ""}</div>
          <div className="profile-meta">
            <span><RuwadIcon name="map" size={13} /> {r.city}, {r.country}</span>
            <span><RuwadIcon name="research" size={13} /> {r.coreResearchAreas[0]}</span>
            <span><RuwadIcon name="clock" size={13} /> TRL {r.technologyReadinessLevel}</span>
          </div>
          <ProvenanceStrip provenance={r.provenance} />
        </div>
        <div className="profile-actions">
          <button className="btn btn-outline" onClick={() => toggleSaved("research", r.id)}><RuwadIcon name="star" size={14} /> {saved ? "Saved" : "Save"}</button>
          <button className="btn btn-primary" onClick={() => { if (!requireAuth("route", { label: "collaborate" })) return; toast("Collaboration request — demo only"); }}>Request Collaboration</button>
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
          <Overview r={r} />
        ) : (
          <div className="profile-body" style={{ gridTemplateColumns: "1fr" }}>
            <div><TabBody tab={tab} r={r} loggedIn={loggedIn} /></div>
          </div>
        )}
      </div>
    </div>
  );
}

function Overview({ r }: { r: ResearchInstitution }) {
  return (
    <div className="profile-body" style={{ gridTemplateColumns: "1fr" }}>
      <div>
        <div className="stat-mini-row">
          <StatCard label="Active Research Projects" value={r.activeProjects.length} />
          <StatCard label="Publications" value={r.publications.length} />
          <StatCard label="Patents" value={r.patentsCount} />
          <StatCard label="Researchers" value={r.numResearchers} />
          <StatCard label="Clinical Collaborations" value={r.clinical.hospitalAffiliations} />
          <StatCard label="Industry Partnerships" value={r.partnerships.length} />
        </div>
        <div className="panel panel-pad">
          <h3 className="card-title">About</h3>
          <p className="db-text">{r.about}</p>
        </div>
      </div>
    </div>
  );
}

function TabBody({ tab, r, loggedIn }: { tab: Tab; r: ResearchInstitution; loggedIn: boolean }) {
  const { hydrated } = useSession();
  switch (tab) {
    case "Institution":
      return (
        <div className="panel panel-pad">
          <div className="stat-mini-row">
            <StatCard label="Type" size={15} value={r.type} />
            <StatCard label="Founded" size={15} value={r.founded} />
            <StatCard label="Research Centers" size={15} value={r.numCenters} />
            <StatCard label="Labs" size={15} value={r.numLabs} />
            <StatCard label="Website" size={15} value={r.website} />
          </div>
          {r.researchCenters.length > 0 && (
            <div className="mt-16">
              <h4 className="eyebrow mb-8">Research Centers</h4>
              <div className="entity-grid">
                {r.researchCenters.map((c) => (
                  <div className="panel panel-pad" key={c.name}><b className="fs-13">{c.name}</b><p className="small muted mt-4">{c.principalArea}</p></div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    case "Research Areas":
      return (
        <div className="panel panel-pad">
          <div className="eyebrow brand mb-8">Core Research Areas</div>
          <div className="chip-select mb-16">{r.coreResearchAreas.map((s) => <span className="chip" key={s}>{s}</span>)}</div>
          <div className="eyebrow brand mb-8">Healthcare Focus</div>
          <div className="chip-select">{r.healthcareFocus.map((s) => <span className="chip" key={s}>{s}</span>)}</div>
        </div>
      );
    case "Projects":
      if (!r.activeProjects.length) return <div className="panel panel-pad"><span className="muted small">No active projects listed.</span></div>;
      return (
        <div className="panel panel-pad">
          {r.activeProjects.map((p, i) => (
            <div className="event-item" key={i}>
              <div className="ev-cat">{p.area}</div><h5>{p.title}</h5>
              <div className="ev-meta"><span className={`badge ${p.status === "Active" ? "badge-good" : "badge-neutral"}`}>{p.status}</span><span>Since {p.startYear}</span></div>
              {p.partners.length > 0 && <div className="ev-meta">Partners: {p.partners.join(", ")}</div>}
            </div>
          ))}
        </div>
      );
    case "Publications":
      if (!r.publications.length) return <div className="panel panel-pad"><span className="muted small">No publications on file.</span></div>;
      return (
        <div className="panel scroll-x">
          <table className="data-table">
            <thead><tr><th>Title</th><th>Area</th><th>Authors</th><th>Journal</th><th>Year</th></tr></thead>
            <tbody>
              {r.publications.map((p, i) => <tr key={i}><td className="cell-main">{p.title}</td><td>{p.area}</td><td className="cell-sub">{p.authors}</td><td className="cell-sub">{p.journal}</td><td>{p.year}</td></tr>)}
            </tbody>
          </table>
        </div>
      );
    case "Technologies":
      if (!r.technologies.length) return <div className="panel panel-pad"><span className="muted small">No technologies listed.</span></div>;
      return (
        <div className="entity-grid">
          {r.technologies.map((t) => (
            <div className="panel panel-pad" key={t.name}>
              <b className="fs-13">{t.name}</b>
              <dl className="kv-grid mt-8">
                <dt>Area</dt><dd>{t.area}</dd>
                <dt>TRL</dt><dd>{t.trl} / 9</dd>
                <dt>Status</dt><dd>{t.status}</dd>
              </dl>
            </div>
          ))}
        </div>
      );
    case "Collaborations":
      if (!r.partnerships.length) return <div className="panel panel-pad"><span className="muted small">No collaborations listed.</span></div>;
      return (
        <div className="panel panel-pad">
          {r.partnerships.map((p, i) => (
            <div className="event-item" key={i}><b>{p.partner}</b><span className="tag" style={{ marginLeft: 8 }}>{p.type}</span><p className="small mt-4">{p.desc}</p></div>
          ))}
        </div>
      );
    case "Researchers":
      if (!r.researchers.length) return <div className="panel panel-pad"><span className="muted small">No researchers listed.</span></div>;
      return (
        <div className="team-grid">
          {r.researchers.map((p) => (
            <div className="team-card" key={p.name}>
              <div className="tavatar">{p.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</div>
              <b>{p.name}</b><div className="trole">{p.title}</div><span className="small muted">{p.area}</span>
            </div>
          ))}
        </div>
      );
    case "Analytics":
      return (
        <div className="traction-grid">
          <div className="kpi"><div className="k-label">Active Projects</div><div className="k-val fs-16">{r.activeProjects.length}</div></div>
          <div className="kpi"><div className="k-label">Publications</div><div className="k-val fs-16">{r.publications.length}</div></div>
          <div className="kpi"><div className="k-label">Patents</div><div className="k-val fs-16">{r.patentsCount}</div></div>
          <div className="kpi"><div className="k-label">Researchers</div><div className="k-val fs-16">{r.numResearchers}</div></div>
          <div className="kpi"><div className="k-label">Technologies</div><div className="k-val fs-16">{r.technologies.length}</div></div>
          <div className="kpi"><div className="k-label">Partnerships</div><div className="k-val fs-16">{r.partnerships.length}</div></div>
        </div>
      );
    case "Contacts":
      return (
        <div className="panel panel-pad">
          <div className="stat-mini-row">
            <StatCard label="Main Contact" size={15} value={r.contacts.mainContact} />
            <StatCard label="Research Office" size={15} value={r.contacts.researchOffice} />
            <StatCard label="Tech Transfer Office" size={15} value={r.contacts.techTransferOffice} />
            <div className="stat-mini"><div className="sm-label">Email</div><div className="sm-val fs-15">{!hydrated ? <span className="skel" style={{ width: 90 }} /> : loggedIn ? r.contacts.email : <ContactLock />}</div></div>
            <div className="stat-mini"><div className="sm-label">Phone</div><div className="sm-val fs-15">{!hydrated ? <span className="skel" style={{ width: 70 }} /> : loggedIn ? r.contacts.phone : <ContactLock />}</div></div>
            <StatCard label="Website" size={15} value={r.contacts.website} />
          </div>
        </div>
      );
    default:
      return null;
  }
}
