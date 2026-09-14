"use client";

import { useRouter } from "next/navigation";
import { RuwadIcon, type RuwadIconName } from "@/components/icons/ruwad-icon";
import { useStartups, useInvestors, useHubs, useResearchInstitutions, useMultinationals } from "@/hooks/use-directory-data";

/** Ported from renderEcosystem() (js/ecosystem.js) — the `.eco-metric-row`
 * + `.category-grid` landing over the five directories, same classes the
 * Dashboard and Analytics hub already use. The relationship-map and
 * ECOSYSTEM_ORGS sections from the old page aren't ported (no live data
 * source for either yet); the category grid, the actually load-bearing
 * part, is. */
export function EcosystemPage() {
  const router = useRouter();
  const { data: STARTUPS } = useStartups();
  const { data: INVESTORS } = useInvestors();
  const { data: HUBS } = useHubs();
  const { data: RESEARCH_INSTITUTIONS } = useResearchInstitutions();
  const { data: MULTINATIONALS } = useMultinationals();
  const trackedFunding = STARTUPS.reduce((a, s) => a + (s.fundingTotal || 0), 0);

  const categories: { label: string; icon: RuwadIconName; count: number; route: string }[] = [
    { label: "Startups", icon: "startups", count: STARTUPS.length, route: "/startups" },
    { label: "Investors", icon: "investors", count: INVESTORS.length, route: "/investors" },
    { label: "Hubs & Enablers", icon: "hubs", count: HUBS.length, route: "/hubs" },
    { label: "Multinational", icon: "corp", count: MULTINATIONALS.length, route: "/multinationals" },
    { label: "Research & Academia", icon: "research", count: RESEARCH_INSTITUTIONS.length, route: "/research" },
  ];

  return (
    <div className="ecosystem-page">
      <div className="page-head">
        <h2>Saudi Healthcare Ecosystem</h2>
        <p className="muted small">Explore companies, investors, enablers and institutions shaping healthcare innovation.</p>
      </div>
      <div className="eco-metric-row">
        <div className="eco-metric"><b className="mono">{STARTUPS.length}</b><span>Startups Tracked</span></div>
        <div className="eco-metric"><b className="mono">{INVESTORS.length}</b><span>Investors Tracked</span></div>
        <div className="eco-metric"><b className="mono">{HUBS.length}</b><span>Hubs &amp; Enablers</span></div>
        <div className="eco-metric"><b className="mono">{RESEARCH_INSTITUTIONS.length}</b><span>Research Institutions</span></div>
        <div className="eco-metric"><b className="mono">SAR {trackedFunding.toFixed(1)}M</b><span>Tracked Funding</span></div>
      </div>
      <div className="category-grid">
        {categories.map((c) => (
          <button className="category-card" key={c.label} onClick={() => router.push(c.route)}>
            <div className="cc-icon"><RuwadIcon name={c.icon} size={17} /></div>
            <b>{c.label}</b><span>{c.count} tracked</span>
          </button>
        ))}
      </div>

      <div className="panel panel-pad mt-16" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h3 className="fs-14">See the flagship ecosystem dashboard</h3>
          <p className="muted small mt-4">Funding, sector and geographic intelligence across the whole ecosystem in one dashboard.</p>
        </div>
        <button className="btn btn-primary" onClick={() => router.push("/analytics/saudi-healthcare-ecosystem")}>
          <RuwadIcon name="ecosystem" size={14} /> View Ecosystem Dashboard
        </button>
      </div>
    </div>
  );
}
