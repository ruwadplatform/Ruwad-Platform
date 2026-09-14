"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { KpiCard } from "@/components/intelligence/KpiCard";
import { InsightCard } from "@/components/intelligence/InsightCard";
import { BarChart } from "@/components/intelligence/BarChart";
import { DonutChart } from "@/components/intelligence/DonutChart";
import { DataSourceLabel } from "@/components/intelligence/DataSourceLabel";
import { LockedTeaser } from "@/components/shared/LockedTeaser";
import { EmptyState } from "@/components/shared/EmptyState";
import { useSession } from "@/hooks/use-store";
import { useStartups } from "@/hooks/use-directory-data";
import {
  useAnalyticsOverview, useFundingByStage, useSectorDistribution, useGeographicDistribution,
  useInvestorActivity, useResearchAnalytics, useMultinationalsAnalytics,
} from "@/hooks/use-analytics";
import type { StartupActivityRow, RecentFundingRoundRow, InvestorActivityRow } from "@/lib/api/analytics";
import { DASHBOARD_META } from "@/data/dashboard-meta";
import { STAGES } from "@/data/reference";

export function AnalyticsDetailPage({ dashboardId }: { dashboardId: string }) {
  const router = useRouter();
  const { loggedIn } = useSession();
  const meta = DASHBOARD_META.find((d) => d.id === dashboardId) ?? DASHBOARD_META[0];

  return (
    <div className="analytics-page">
      <button className="btn btn-ghost btn-sm mb-16" onClick={() => router.push("/analytics")}>← Back to Dashboards</button>
      <IntelligencePageHeader title={meta.title} description={meta.description} />
      <div className="mt-20">
        <DashboardBody id={meta.id} loggedIn={loggedIn} />
      </div>
    </div>
  );
}

function Gated({ loggedIn, title, body, children }: { loggedIn: boolean; title: string; body: string; children: React.ReactNode }) {
  if (loggedIn) return <>{children}</>;
  return <LockedTeaser title={title} body={body} blurLines={3} cta="Unlock Full Intelligence" />;
}

function DashboardBody({ id, loggedIn }: { id: string; loggedIn: boolean }) {
  switch (id) {
    case "saudi-healthcare-ecosystem":
      return <EcosystemDashboard loggedIn={loggedIn} />;
    case "startup-funding":
      return <StartupFundingDashboard loggedIn={loggedIn} />;
    case "investor-activity":
      return <InvestorActivityDashboard loggedIn={loggedIn} />;
    case "sector-intelligence":
      return <SectorIntelligenceDashboard loggedIn={loggedIn} />;
    case "geographic-intelligence":
      return <GeographicIntelligenceDashboard loggedIn={loggedIn} />;
    case "innovation-research":
      return <InnovationResearchDashboard loggedIn={loggedIn} />;
    case "multinational-presence":
      return <MultinationalPresenceDashboard loggedIn={loggedIn} />;
    case "market-activity":
      return <MarketActivityDashboard loggedIn={loggedIn} />;
    default:
      return null;
  }
}

function DashboardLoading() {
  return <EmptyState icon="search" title="Loading dashboard…" body="" />;
}
function DashboardError({ message }: { message: string }) {
  return <EmptyState icon="help" title="Couldn't load this dashboard" body={message} />;
}

/* ============================================================== FLAGSHIP */
function EcosystemDashboard({ loggedIn }: { loggedIn: boolean }) {
  const overview = useAnalyticsOverview();
  const sectorDist = useSectorDistribution();
  const geo = useGeographicDistribution();
  const investorAct = useInvestorActivity();
  const research = useResearchAnalytics();
  const mnc = useMultinationalsAnalytics();
  const { data: STARTUPS, loading: startupsLoading } = useStartups();

  const [sector, setSector] = useState("All");
  const sectors = useMemo(() => ["All", ...(sectorDist.data?.startupSectorCounts.map((d) => d.l) ?? [])], [sectorDist.data]);
  const scoped = sector === "All" ? STARTUPS : STARTUPS.filter((s) => s.category === sector);

  const scopedFundingByStage = useMemo(() => {
    const m: Record<string, number> = {};
    scoped.forEach((s) => { m[s.stage] = (m[s.stage] || 0) + (s.fundingTotal || 0); });
    return STAGES.filter((s) => m[s]).map((s) => ({ l: s, v: Math.round(m[s]) }));
  }, [scoped]);
  const scopedByCity = useMemo(() => {
    const m: Record<string, number> = {};
    scoped.forEach((s) => { m[s.city] = (m[s.city] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ l, v }));
  }, [scoped]);

  const loading = overview.loading || sectorDist.loading || geo.loading || investorAct.loading || research.loading || mnc.loading || startupsLoading;
  const error = overview.error || sectorDist.error || geo.error || investorAct.error || research.error || mnc.error;
  if (error) return <DashboardError message={error} />;
  if (loading || !overview.data || !sectorDist.data || !geo.data || !investorAct.data || !research.data || !mnc.data) return <DashboardLoading />;

  return (
    <>
      <div className="kpi-row mb-24">
        <KpiCard label="Total Startups" value={overview.data.startupCount} />
        <KpiCard label="Investors" value={overview.data.activeInvestors} />
        <KpiCard label="Hubs & Enablers" value={overview.data.hubsCount} />
        <KpiCard label="Research Institutions" value={overview.data.researchCount} />
        <KpiCard label="Multinationals" value={overview.data.multinationalsCount} />
        <KpiCard label="Total Funding" value={`SAR ${overview.data.trackedFundingSar.toFixed(0)}M`} />
      </div>

      <div className="flex mb-16" style={{ alignItems: "center", gap: 10 }}>
        <label className="small muted" htmlFor="eco-sector">Sector:</label>
        <select id="eco-sector" className="input" style={{ maxWidth: 220 }} value={sector} onChange={(e) => setSector(e.target.value)}>
          {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="insight-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <InsightCard title="Funding by Stage"><BarChart data={scopedFundingByStage} unit="M" /><DataSourceLabel /></InsightCard>
        <InsightCard title="Sector Distribution"><DonutChart data={sectorDist.data.startupSectorCounts} /><DataSourceLabel /></InsightCard>
      </div>

      <div className="insight-row mt-20" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Gated loggedIn={loggedIn} title="Unlock Geographic Intelligence" body="City-level distribution and investor-type breakdowns are available to RUWĀD members.">
          <InsightCard title="Geographic Distribution"><BarChart data={scopedByCity} /><DataSourceLabel /></InsightCard>
        </Gated>
        <Gated loggedIn={loggedIn} title="Unlock Investor Intelligence" body="Investor-type breakdowns are available to RUWĀD members.">
          <InsightCard title="Investor Types"><DonutChart data={investorAct.data.investorTypeCounts} /><DataSourceLabel /></InsightCard>
        </Gated>
      </div>

      <div className="mt-20">
        <Gated loggedIn={loggedIn} title="Unlock Investor Activity" body="Most-active investor rankings, portfolio counts and stage focus are available to RUWĀD members.">
          <InvestorActivityTable rows={investorAct.data.mostActiveInvestors} />
        </Gated>
      </div>

      <div className="mt-20">
        <Gated loggedIn={loggedIn} title="Unlock Startup Activity" body="Recently founded, most funded, highest-scoring and recently updated startups are available to RUWĀD members.">
          <StartupActivityPanels overview={overview.data} />
        </Gated>
      </div>

      <div className="insight-row mt-20" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Gated loggedIn={loggedIn} title="Unlock Research & Innovation" body="Research institution activity is available to RUWĀD members.">
          <InsightCard title="Research & Innovation">
            <div className="stat-mini-row mb-16">
              <div className="stat-mini"><div className="sm-label">Institutions</div><div className="sm-val">{research.data.summary.institutions}</div></div>
              <div className="stat-mini"><div className="sm-label">Active Projects</div><div className="sm-val">{research.data.summary.activeProjects}</div></div>
              <div className="stat-mini"><div className="sm-label">Publications</div><div className="sm-val">{research.data.summary.publications}</div></div>
              <div className="stat-mini"><div className="sm-label">Patents</div><div className="sm-val">{research.data.summary.patents}</div></div>
            </div>
            <BarChart data={research.data.byField} />
            <DataSourceLabel />
          </InsightCard>
        </Gated>
        <Gated loggedIn={loggedIn} title="Unlock Multinational Presence" body="Multinational sector coverage and R&D presence are available to RUWĀD members.">
          <InsightCard title="Multinational Presence">
            <div className="stat-mini-row mb-16">
              <div className="stat-mini"><div className="sm-label">Companies</div><div className="sm-val">{mnc.data.summary.companies}</div></div>
              <div className="stat-mini"><div className="sm-label">Saudi Offices</div><div className="sm-val">{mnc.data.summary.saudiOffices}</div></div>
              <div className="stat-mini"><div className="sm-label">R&D Centers</div><div className="sm-val">{mnc.data.summary.rdCenters}</div></div>
              <div className="stat-mini"><div className="sm-label">Partnerships</div><div className="sm-val">{mnc.data.summary.regionalPartnerships}</div></div>
            </div>
            <DonutChart data={mnc.data.bySector} />
            <DataSourceLabel />
          </InsightCard>
        </Gated>
      </div>
    </>
  );
}

function InvestorActivityTable({ rows }: { rows: InvestorActivityRow[] }) {
  return (
    <InsightCard title="Most Active Investors">
      <div className="scroll-x">
        <table className="data-table">
          <thead><tr><th>Investor</th><th>Type</th><th>HC Deals</th><th>Stage Focus</th><th>City</th></tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td className="cell-main"><Link href={`/investors/${v.slug}`}>{v.name}</Link></td>
                <td>{v.type}</td>
                <td className="mono">{v.hcDeals}</td>
                <td className="cell-sub">{v.stageFocus.join(", ")}</td>
                <td>{v.city}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DataSourceLabel />
    </InsightCard>
  );
}

function StartupActivityPanels({ overview }: { overview: { topFundedStartups: StartupActivityRow[]; highestScoreStartups: StartupActivityRow[]; recentlyFoundedStartups: StartupActivityRow[]; recentlyUpdatedStartups: StartupActivityRow[] } }) {
  const groups: { title: string; list: StartupActivityRow[] }[] = [
    { title: "Most Funded", list: overview.topFundedStartups },
    { title: "Highest RUWĀD Score", list: overview.highestScoreStartups },
    { title: "Recently Founded", list: overview.recentlyFoundedStartups },
    { title: "Recently Updated", list: overview.recentlyUpdatedStartups },
  ];
  return (
    <div className="insight-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
      {groups.map((g) => (
        <div className="panel panel-pad" key={g.title}>
          <h4 className="eyebrow mb-8">{g.title}</h4>
          {g.list.map((s) => (
            <Link key={s.id} href={`/startups/${s.slug}`} className="event-item" style={{ display: "block", cursor: "pointer" }}>
              <b className="fs-13">{s.name}</b>
              <div className="small muted">{s.category}</div>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ============================================================== STARTUP FUNDING */
function StartupFundingDashboard({ loggedIn }: { loggedIn: boolean }) {
  const overview = useAnalyticsOverview();
  const funding = useFundingByStage();
  const sectorDist = useSectorDistribution();
  const { data: STARTUPS } = useStartups();

  if (overview.error || funding.error || sectorDist.error) return <DashboardError message={overview.error || funding.error || sectorDist.error || ""} />;
  if (!overview.data || !funding.data || !sectorDist.data) return <DashboardLoading />;

  return (
    <>
      <div className="kpi-row mb-24">
        <KpiCard label="Total Funding" value={`SAR ${overview.data.trackedFundingSar.toFixed(0)}M`} />
        <KpiCard label="Total Deals" value={overview.data.totalDealCount} />
        <KpiCard label="Avg Deal Size" value={`SAR ${overview.data.avgDealSizeSar.toFixed(1)}M`} />
        <KpiCard label="Startups Tracked" value={STARTUPS.length} />
      </div>
      <div className="insight-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <InsightCard title="Funding by Stage"><BarChart data={funding.data.fundingByStage} unit="M" /><DataSourceLabel /></InsightCard>
        <InsightCard title="Funding by Sector"><BarChart data={sectorDist.data.fundingBySector} unit="M" /><DataSourceLabel /></InsightCard>
      </div>
      <div className="mt-20">
        <Gated loggedIn={loggedIn} title="Unlock Deal-Level Funding History" body="Round-by-round funding history across all tracked startups is available to RUWĀD members.">
          <RecentRoundsTable rows={overview.data.recentFundingRounds} />
        </Gated>
      </div>
    </>
  );
}

function RecentRoundsTable({ rows }: { rows: RecentFundingRoundRow[] }) {
  return (
    <InsightCard title="Recent Funding Rounds">
      <div className="scroll-x">
        <table className="data-table">
          <thead><tr><th>Startup</th><th>Round</th><th>Date</th><th>Amount</th><th>Lead</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="cell-main"><Link href={`/startups/${r.startupSlug}`}>{r.startup}</Link></td>
                <td>{r.round}</td><td className="cell-sub">{r.date}</td><td className="mono">SAR {r.amount}M</td><td className="cell-sub">{r.lead}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DataSourceLabel />
    </InsightCard>
  );
}

/* ============================================================== INVESTOR ACTIVITY */
function InvestorActivityDashboard({ loggedIn }: { loggedIn: boolean }) {
  const investorAct = useInvestorActivity();
  if (investorAct.error) return <DashboardError message={investorAct.error} />;
  if (!investorAct.data) return <DashboardLoading />;
  const totalHcDeals = investorAct.data.mostActiveInvestors.reduce((a, v) => a + v.hcDeals, 0);
  return (
    <>
      <div className="kpi-row mb-24">
        <KpiCard label="Active Investors" value={investorAct.data.mostActiveInvestors.length} />
        <KpiCard label="Total HC Deals" value={totalHcDeals} />
        <KpiCard label="Investor Types" value={investorAct.data.investorTypeCounts.length} />
      </div>
      <div className="insight-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <InsightCard title="Investor Types"><DonutChart data={investorAct.data.investorTypeCounts} /><DataSourceLabel /></InsightCard>
        <Gated loggedIn={loggedIn} title="Unlock Investor Rankings" body="Most-active investor rankings by healthcare deal count are available to RUWĀD members.">
          <InvestorActivityTable rows={investorAct.data.mostActiveInvestors} />
        </Gated>
      </div>
    </>
  );
}

/* ============================================================== SECTOR INTELLIGENCE */
function SectorIntelligenceDashboard({ loggedIn }: { loggedIn: boolean }) {
  const overview = useAnalyticsOverview();
  const sectorDist = useSectorDistribution();
  if (overview.error || sectorDist.error) return <DashboardError message={overview.error || sectorDist.error || ""} />;
  if (!overview.data || !sectorDist.data) return <DashboardLoading />;
  return (
    <>
      <div className="kpi-row mb-24">
        <KpiCard label="Sectors Tracked" value={sectorDist.data.startupSectorCounts.length} />
        <KpiCard label="Leading Sector" value={sectorDist.data.startupSectorCounts[0]?.l ?? "—"} />
        <KpiCard label="Total Funding" value={`SAR ${overview.data.trackedFundingSar.toFixed(0)}M`} />
      </div>
      <div className="insight-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <InsightCard title="Startups by Sector"><DonutChart data={sectorDist.data.startupSectorCounts} /><DataSourceLabel /></InsightCard>
        <Gated loggedIn={loggedIn} title="Unlock Sector Funding Detail" body="Funding-by-sector breakdowns and deal-stage detail are available to RUWĀD members.">
          <InsightCard title="Funding by Sector"><BarChart data={sectorDist.data.fundingBySector} unit="M" /><DataSourceLabel /></InsightCard>
        </Gated>
      </div>
    </>
  );
}

/* ============================================================== GEOGRAPHIC INTELLIGENCE */
function GeographicIntelligenceDashboard({ loggedIn }: { loggedIn: boolean }) {
  const geo = useGeographicDistribution();
  if (geo.error) return <DashboardError message={geo.error} />;
  if (!geo.data) return <DashboardLoading />;
  return (
    <>
      <div className="kpi-row mb-24">
        <KpiCard label="Cities Tracked" value={geo.data.startupsByCity.length} />
        <KpiCard label="Leading City" value={geo.data.startupsByCity[0]?.l ?? "—"} />
      </div>
      <div className="insight-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <InsightCard title="Startups by City"><BarChart data={geo.data.startupsByCity} /><DataSourceLabel /></InsightCard>
        <Gated loggedIn={loggedIn} title="Unlock Full Geographic Distribution" body="Combined entity distribution across all directories is available to RUWĀD members.">
          <InsightCard title="All Entities by City"><BarChart data={geo.data.entitiesByCity} /><DataSourceLabel /></InsightCard>
        </Gated>
      </div>
    </>
  );
}

/* ============================================================== INNOVATION & RESEARCH */
function InnovationResearchDashboard({ loggedIn }: { loggedIn: boolean }) {
  const research = useResearchAnalytics();
  if (research.error) return <DashboardError message={research.error} />;
  if (!research.data) return <DashboardLoading />;
  return (
    <>
      <div className="kpi-row mb-24">
        <KpiCard label="Institutions" value={research.data.summary.institutions} />
        <KpiCard label="Active Projects" value={research.data.summary.activeProjects} />
        <KpiCard label="Publications" value={research.data.summary.publications} />
        <KpiCard label="Patents" value={research.data.summary.patents} />
        <KpiCard label="Open Collaborations" value={research.data.summary.openCollaborations} />
      </div>
      <div className="insight-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <InsightCard title="Institutions by Research Field"><BarChart data={research.data.byField} /><DataSourceLabel /></InsightCard>
        <Gated loggedIn={loggedIn} title="Unlock Institution Rankings" body="Institution-level project and publication rankings are available to RUWĀD members.">
          <InsightCard title="Most Active Institutions">
            <div className="scroll-x">
              <table className="data-table">
                <thead><tr><th>Institution</th><th>Active Projects</th></tr></thead>
                <tbody>
                  {research.data.topInstitutions.map((r) => (
                    <tr key={r.id}><td className="cell-main"><Link href={`/research/${r.slug}`}>{r.name}</Link></td><td className="mono">{r.activeProjectCount}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DataSourceLabel />
          </InsightCard>
        </Gated>
      </div>
    </>
  );
}

/* ============================================================== MULTINATIONAL PRESENCE */
function MultinationalPresenceDashboard({ loggedIn }: { loggedIn: boolean }) {
  const mnc = useMultinationalsAnalytics();
  if (mnc.error) return <DashboardError message={mnc.error} />;
  if (!mnc.data) return <DashboardLoading />;
  return (
    <>
      <div className="kpi-row mb-24">
        <KpiCard label="Companies" value={mnc.data.summary.companies} />
        <KpiCard label="Saudi Offices" value={mnc.data.summary.saudiOffices} />
        <KpiCard label="R&D Centers" value={mnc.data.summary.rdCenters} />
        <KpiCard label="Regional Partnerships" value={mnc.data.summary.regionalPartnerships} />
      </div>
      <div className="insight-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <InsightCard title="Multinationals by Sector"><DonutChart data={mnc.data.bySector} /><DataSourceLabel /></InsightCard>
        <Gated loggedIn={loggedIn} title="Unlock R&D Rankings" body="R&D-center rankings by multinational are available to RUWĀD members.">
          <InsightCard title="R&D Centers by Company">
            <div className="scroll-x">
              <table className="data-table">
                <thead><tr><th>Company</th><th>Sector</th><th>R&D Centers</th></tr></thead>
                <tbody>
                  {mnc.data.topByRd.map((m) => (
                    <tr key={m.id}><td className="cell-main"><Link href={`/multinationals/${m.slug}`}>{m.name}</Link></td><td>{m.category}</td><td className="mono">{m.rdCenters}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DataSourceLabel />
          </InsightCard>
        </Gated>
      </div>
    </>
  );
}

/* ============================================================== MARKET ACTIVITY */
function MarketActivityDashboard({ loggedIn }: { loggedIn: boolean }) {
  const overview = useAnalyticsOverview();
  const funding = useFundingByStage();
  if (overview.error || funding.error) return <DashboardError message={overview.error || funding.error || ""} />;
  if (!overview.data || !funding.data) return <DashboardLoading />;
  return (
    <>
      <div className="kpi-row mb-24">
        <KpiCard label="Total Deals" value={overview.data.totalDealCount} />
        <KpiCard label="Total Funding" value={`SAR ${overview.data.trackedFundingSar.toFixed(0)}M`} />
        <KpiCard label="Avg Deal Size" value={`SAR ${overview.data.avgDealSizeSar.toFixed(1)}M`} />
      </div>
      <div className="insight-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <InsightCard title="Deals by Stage"><BarChart data={funding.data.dealsByStage} /><DataSourceLabel /></InsightCard>
        <InsightCard title="Funding by Stage"><BarChart data={funding.data.fundingByStage} unit="M" /><DataSourceLabel /></InsightCard>
      </div>
      <div className="mt-20">
        <Gated loggedIn={loggedIn} title="Unlock Recent Deal Activity" body="Deal-level round history across all tracked startups is available to RUWĀD members.">
          <RecentRoundsTable rows={overview.data.recentFundingRounds} />
        </Gated>
      </div>
    </>
  );
}
