import { notifyStoreChange, subscribeStoreChange, subscribeViewerChange } from "@/lib/store";
import { createResourceCacheCore, type ResourceCache } from "@/lib/resource-cache-core";

/** Same synchronous-read/async-populate cache pattern already used in
 * lib/store.ts for session-scoped resources (watchlist, saved searches...),
 * for public directory data (startups, investors, ...) that every guest can
 * read — not tied to a logged-in session, so it never resets on login/logout
 * the way the store.ts caches do. Failure handling (bounded retries with
 * backoff, no retry on 401/403/404) lives in lib/resource-cache-core.ts. */
export type { ResourceCache };

/** Every cache made here holds data the API may return differently per viewer. When the signed-in viewer changes, each one drops what it holds (never keeping one viewer's data for the next)
 * and, if something had been loading it, loads it again for the new viewer. */
const viewerScoped = new Set<{ cache: ResourceCache<never>; fetcher: { current: (() => Promise<never>) | null } }>();

export function createResourceCache<T>(fallback: T): ResourceCache<T> {
  const core = createResourceCacheCore(fallback, { notify: notifyStoreChange });
  const fetcher: { current: (() => Promise<T>) | null } = { current: null };
  viewerScoped.add({ cache: core as unknown as ResourceCache<never>, fetcher: fetcher as unknown as { current: (() => Promise<never>) | null } });
  return {
    ...core,
    ensureLoaded(f) {
      fetcher.current = f;
      core.ensureLoaded(f);
    },
  };
}

if (typeof window !== "undefined") {
  subscribeViewerChange(() => {
    for (const { cache, fetcher } of viewerScoped) {
      cache.reset();
      if (fetcher.current) cache.ensureLoaded(fetcher.current);
    }
  });
}

export { subscribeStoreChange };
