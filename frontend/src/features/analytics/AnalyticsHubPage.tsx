"use client";

import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { DashboardCard } from "@/components/intelligence/DashboardCard";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  useAnalyticsOverview, useFundingByStage, useSectorDistribution, useGeographicDistribution,
  useInvestorActivity, useResearchAnalytics, useMultinationalsAnalytics,
} from "@/hooks/use-analytics";
import { DASHBOARD_META } from "@/data/dashboard-meta";
import type { RuwadIconName } from "@/components/icons/ruwad-icon";
import type { DashboardMeta } from "@/types/intelligence";

const DASHBOARD_ICONS: Record<string, RuwadIconName> = {
  "saudi-healthcare-ecosystem": "ecosystem",
  "startup-funding": "bi",
  "investor-activity": "investors",
  "sector-intelligence": "grid",
  "geographic-intelligence": "map",
  "innovation-research": "research",
  "multinational-presence": "corp",
  "market-activity": "globe",
};

const LAST_UPDATED = new Date().toISOString().slice(0, 10);

/** Same eight dashboard cards the old data/intelligence.ts's module-scope
 * DASHBOARDS const built eagerly at import time from the mock arrays — now
 * assembled from the seven live /analytics/* endpoints once they resolve,
 * since a real network fetch can't happen at module-eval time. */
export function AnalyticsHubPage() {
  const overview = useAnalyticsOverview();
  const funding = useFundingByStage();
  const sector = useSectorDistribution();
  const geo = useGeographicDistribution();
  const investor = useInvestorActivity();
  const research = useResearchAnalytics();
  const mnc = useMultinationalsAnalytics();

  const loading = overview.loading || funding.loading || sector.loading || geo.loading || investor.loading || research.loading || mnc.loading;
  const error = overview.error || funding.error || sector.error || geo.error || investor.error || research.error || mnc.error;

  if (error) {
    return (
      <div className="analytics-page">
        <IntelligencePageHeader title="Dashboards" description="Ecosystem, funding and sector analytics built on RUWĀD's live entity data." />
        <EmptyState icon="help" title="Couldn't load dashboards" body={error} />
      </div>
    );
  }
  if (loading || !overview.data || !funding.data || !sector.data || !investor.data || !geo.data || !research.data || !mnc.data) {
    return (
      <div className="analytics-page">
        <IntelligencePageHeader title="Dashboards" description="Ecosystem, funding and sector analytics built on RUWĀD's live entity data." />
        <EmptyState icon="search" title="Loading dashboards…" body="" />
      </div>
    );
  }

  const topStage = [...funding.data.fundingByStage].sort((a, b) => b.v - a.v)[0];
  const topSector = [...sector.data.fundingBySector].sort((a, b) => b.v - a.v)[0];
  const topInvestor = investor.data.mostActiveInvestors[0];
  const topCity = [...geo.data.startupsByCity].sort((a, b) => b.v - a.v)[0];

  const kpiPreviewById: Record<string, { label: string; value: string }> = {
    "saudi-healthcare-ecosystem": { label: "Total Funding Tracked", value: `SAR ${overview.data.trackedFundingSar.toFixed(0)}M` },
    "startup-funding": { label: "Leading Stage", value: topStage?.l ?? "—" },
    "investor-activity": { label: "Most Active Investor", value: topInvestor?.name ?? "—" },
    "sector-intelligence": { label: "Leading Sector", value: topSector?.l ?? "—" },
    "geographic-intelligence": { label: "Leading City", value: topCity?.l ?? "—" },
    "innovation-research": { label: "Active Research Projects", value: String(research.data.summary.activeProjects) },
    "multinational-presence": { label: "R&D Centers Tracked", value: String(mnc.data.summary.rdCenters) },
    "market-activity": { label: "Total Deals Tracked", value: String(overview.data.totalDealCount) },
  };
  const dashboards: DashboardMeta[] = DASHBOARD_META.map((m) => ({ ...m, lastUpdated: LAST_UPDATED, kpiPreview: kpiPreviewById[m.id] }));

  return (
    <div className="analytics-page">
      <IntelligencePageHeader title="Dashboards" description="Ecosystem, funding and sector analytics built on RUWĀD's live entity data." />
      <div className="category-grid mt-20">
        {dashboards.map((d) => <DashboardCard key={d.id} dashboard={d} icon={DASHBOARD_ICONS[d.id] ?? "bi"} />)}
      </div>
    </div>
  );
}
