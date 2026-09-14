import { api } from "./client";
import type { ApiEcosystemSnapshot } from "./types";

export function fetchEcosystemSnapshot(): Promise<ApiEcosystemSnapshot> {
  return api.get<ApiEcosystemSnapshot>("/analytics/ecosystem-snapshot");
}

export interface ChartDatum { l: string; v: number }

export interface StartupActivityRow { id: string; slug: string; name: string; logo: string; category: string; fundingTotal: number; score: number; founded: number; provenanceLastUpdated: string }
export interface RecentFundingRoundRow { startup: string; startupId: string; startupSlug: string; round: string; date: string; amount: number; lead: string }

export interface AnalyticsOverview extends ApiEcosystemSnapshot {
  totalDealCount: number;
  avgDealSizeSar: number;
  topFundedStartups: StartupActivityRow[];
  highestScoreStartups: StartupActivityRow[];
  recentlyFoundedStartups: StartupActivityRow[];
  recentlyUpdatedStartups: StartupActivityRow[];
  recentFundingRounds: RecentFundingRoundRow[];
}
export function fetchAnalyticsOverview(): Promise<AnalyticsOverview> {
  return api.get<AnalyticsOverview>("/analytics/overview");
}

export interface FundingByStageResponse { fundingByStage: ChartDatum[]; dealsByStage: ChartDatum[] }
export function fetchFundingByStage(): Promise<FundingByStageResponse> {
  return api.get<FundingByStageResponse>("/analytics/funding-by-stage");
}

export interface SectorDistributionResponse { startupSectorCounts: ChartDatum[]; fundingBySector: ChartDatum[] }
export function fetchSectorDistribution(): Promise<SectorDistributionResponse> {
  return api.get<SectorDistributionResponse>("/analytics/sector-distribution");
}

export interface GeographicDistributionResponse { startupsByCity: ChartDatum[]; entitiesByCity: ChartDatum[] }
export function fetchGeographicDistribution(): Promise<GeographicDistributionResponse> {
  return api.get<GeographicDistributionResponse>("/analytics/geographic-distribution");
}

export interface InvestorActivityRow { id: string; slug: string; name: string; logo: string; type: string; city: string; hcDeals: number; stageFocus: string[] }
export interface InvestorActivityResponse { mostActiveInvestors: InvestorActivityRow[]; investorTypeCounts: ChartDatum[] }
export function fetchInvestorActivity(): Promise<InvestorActivityResponse> {
  return api.get<InvestorActivityResponse>("/analytics/investor-activity");
}

export interface ResearchAnalyticsRow { id: string; slug: string; name: string; logo: string; activeProjectCount: number }
export interface ResearchAnalyticsResponse {
  summary: { institutions: number; activeProjects: number; publications: number; patents: number; openCollaborations: number };
  byField: ChartDatum[];
  topInstitutions: ResearchAnalyticsRow[];
}
export function fetchResearchAnalytics(): Promise<ResearchAnalyticsResponse> {
  return api.get<ResearchAnalyticsResponse>("/analytics/research");
}

export interface MultinationalsAnalyticsRow { id: string; slug: string; name: string; logo: string; category: string; rdCenters: number }
export interface MultinationalsAnalyticsResponse {
  summary: { companies: number; saudiOffices: number; rdCenters: number; regionalPartnerships: number };
  bySector: ChartDatum[];
  topByRd: MultinationalsAnalyticsRow[];
}
export function fetchMultinationalsAnalytics(): Promise<MultinationalsAnalyticsResponse> {
  return api.get<MultinationalsAnalyticsResponse>("/analytics/multinationals");
}
