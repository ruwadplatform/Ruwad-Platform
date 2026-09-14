"use client";

/** React hooks over the backend's server-computed analytics endpoints
 * (src/analytics/analytics.service.ts) — these replace the client-side
 * aggregation functions that used to live in src/data/intelligence.ts,
 * which read the local mock arrays directly. Same shared-cache pattern as
 * use-directory-data.ts, one cache per endpoint. */
import { useEffect, useSyncExternalStore } from "react";
import { createResourceCache, subscribeStoreChange } from "@/lib/api/resource-cache";
import {
  fetchAnalyticsOverview, fetchFundingByStage, fetchSectorDistribution, fetchGeographicDistribution,
  fetchInvestorActivity, fetchResearchAnalytics, fetchMultinationalsAnalytics,
  type AnalyticsOverview, type FundingByStageResponse, type SectorDistributionResponse, type GeographicDistributionResponse,
  type InvestorActivityResponse, type ResearchAnalyticsResponse, type MultinationalsAnalyticsResponse,
} from "@/lib/api/analytics";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function makeHook<T>(fetcher: () => Promise<T>) {
  const cache = createResourceCache<T | null>(null);
  return function useResource(): AsyncState<T> {
    useEffect(() => {
      cache.ensureLoaded(fetcher);
    }, []);
    const data = useSyncExternalStore(subscribeStoreChange, cache.get, cache.get);
    return { data, loading: cache.isLoading() && !cache.isLoaded(), error: cache.error() };
  };
}

export const useAnalyticsOverview = makeHook<AnalyticsOverview>(fetchAnalyticsOverview);
export const useFundingByStage = makeHook<FundingByStageResponse>(fetchFundingByStage);
export const useSectorDistribution = makeHook<SectorDistributionResponse>(fetchSectorDistribution);
export const useGeographicDistribution = makeHook<GeographicDistributionResponse>(fetchGeographicDistribution);
export const useInvestorActivity = makeHook<InvestorActivityResponse>(fetchInvestorActivity);
export const useResearchAnalytics = makeHook<ResearchAnalyticsResponse>(fetchResearchAnalytics);
export const useMultinationalsAnalytics = makeHook<MultinationalsAnalyticsResponse>(fetchMultinationalsAnalytics);
