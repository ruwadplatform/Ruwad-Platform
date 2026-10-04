import { notifyStoreChange, subscribeStoreChange } from "@/lib/store";
import { createResourceCacheCore, type ResourceCache } from "@/lib/resource-cache-core";

/** Same synchronous-read/async-populate cache pattern already used in
 * lib/store.ts for session-scoped resources (watchlist, saved searches...),
 * for public directory data (startups, investors, ...) that every guest can
 * read — not tied to a logged-in session, so it never resets on login/logout
 * the way the store.ts caches do. Failure handling (bounded retries with
 * backoff, no retry on 401/403/404) lives in lib/resource-cache-core.ts. */
export type { ResourceCache };

export function createResourceCache<T>(fallback: T): ResourceCache<T> {
  return createResourceCacheCore(fallback, { notify: notifyStoreChange });
}

export { subscribeStoreChange };
