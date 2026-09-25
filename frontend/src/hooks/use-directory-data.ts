"use client";

/** React hooks over the real backend directory/intelligence data — one
 * shared in-memory cache per entity type (see lib/api/resource-cache.ts),
 * fetched once per page load and reused by every component that needs it
 * (directory pages, profile pages, cross-entity joins, search, analytics).
 * Because the cache returns a stable reference until a fetch resolves,
 * useSyncExternalStore can read it directly with no snapshot memoization. */
import { useEffect, useReducer, useSyncExternalStore } from "react";
import { createResourceCache, subscribeStoreChange } from "@/lib/api/resource-cache";
import { notifyStoreChange } from "@/lib/store";
import { fetchStartups } from "@/lib/api/startups";
import { fetchInvestors } from "@/lib/api/investors";
import { fetchHubs } from "@/lib/api/hubs";
import { fetchResearchInstitutions } from "@/lib/api/research";
import { fetchMultinationals } from "@/lib/api/multinationals";
import { fetchReports } from "@/lib/api/reports";
import { fetchNews } from "@/lib/api/news";
import { fetchEvents } from "@/lib/api/events";
import type { Startup, Investor, Hub, ResearchInstitution, Multinational } from "@/types/entities";
import type { Report, NewsArticle, EventItem } from "@/types/intelligence";

export interface DataState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  /** Fetches the collection again (used after an admin action changes what is published). */
  refresh: () => void;
}

function makeHook<T>(fetcher: () => Promise<T[]>) {
  const cache = createResourceCache<T[]>([]);
  return function useEntities(): DataState<T> {
    // Fired from an effect, not during render: the backend's directory
    // endpoints are public, so a same-request server-side fetch can
    // resolve fast enough to race React's hydration diff and produce a
    // mismatch (SSR renders the loading fallback, client renders data
    // before the hydration commit finishes). Deferring to an effect
    // guarantees the first client render matches SSR; the real fetch
    // then kicks off post-mount and repaints via notifyStoreChange().
    useEffect(() => {
      cache.ensureLoaded(fetcher);
    }, []);
    // cache.get() returns the same [] reference it was constructed with
    // until set() first resolves, so it's already a stable server snapshot
    // — no separate literal needed (a fresh `() => []` here would make
    // useSyncExternalStore think the snapshot changes every render).
    const data = useSyncExternalStore(subscribeStoreChange, cache.get, cache.get);
    // A failed fetch leaves `data` untouched, so the snapshot above never
    // changes; re-render on every store change so loading/error still update.
    const [, rerender] = useReducer((n: number) => n + 1, 0);
    useEffect(() => subscribeStoreChange(rerender), []);
    const refresh = () => { cache.reset(); cache.ensureLoaded(fetcher); notifyStoreChange(); };
    return { data, loading: cache.isLoading() && !cache.isLoaded(), error: cache.error(), refresh };
  };
}

export const useStartups = makeHook<Startup>(fetchStartups);
export const useInvestors = makeHook<Investor>(fetchInvestors);
export const useHubs = makeHook<Hub>(fetchHubs);
export const useResearchInstitutions = makeHook<ResearchInstitution>(fetchResearchInstitutions);
export const useMultinationals = makeHook<Multinational>(fetchMultinationals);
export const useReports = makeHook<Report>(fetchReports);
export const useNews = makeHook<NewsArticle>(fetchNews);
export const useEvents = makeHook<EventItem>(fetchEvents);

/** Bundles the five entity-directory collections for lib/entity-resolve.ts's
 * resolveEntity() — every Workspace page that resolves watchlist/listing
 * refs across mixed kinds needs all five, so this saves five separate hook
 * calls at each call site. */
export function useResolveCollections() {
  const { data: startups } = useStartups();
  const { data: investors } = useInvestors();
  const { data: hubs } = useHubs();
  const { data: research } = useResearchInstitutions();
  const { data: multinationals } = useMultinationals();
  return { startups, investors, hubs, research, multinationals };
}
