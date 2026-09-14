"use client";

/** Same pattern as use-directory-data.ts/use-analytics.ts (a module-level
 * cache read via useSyncExternalStore, populated from an effect that never
 * calls a React setState directly — only cache.set(), which notifies
 * subscribers) but keyed, for single-record fetches like "the startup my
 * account owns" where the key (slug/id) can vary per caller. */
import { useEffect, useSyncExternalStore } from "react";
import { createResourceCache, subscribeStoreChange, type ResourceCache } from "@/lib/api/resource-cache";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

const caches = new Map<string, ResourceCache<unknown>>();

export function useKeyedResource<T>(key: string | null, fetcher: (key: string) => Promise<T>): AsyncState<T> {
  const cacheKey = `${fetcher.name}:${key ?? ""}`;
  let cache = caches.get(cacheKey) as ResourceCache<T | null> | undefined;
  if (!cache) {
    cache = createResourceCache<T | null>(null);
    caches.set(cacheKey, cache);
  }

  useEffect(() => {
    if (key) cache!.ensureLoaded(() => fetcher(key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  const data = useSyncExternalStore(subscribeStoreChange, cache.get, cache.get);
  return { data, loading: !!key && cache.isLoading() && !cache.isLoaded(), error: cache.error() };
}
