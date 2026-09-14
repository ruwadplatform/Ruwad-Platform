import { notifyStoreChange, subscribeStoreChange } from "@/lib/store";

/** Same synchronous-read/async-populate cache pattern already used in
 * lib/store.ts for session-scoped resources (watchlist, saved searches...),
 * extracted here for public directory data (startups, investors, ...) that
 * every guest can read — not tied to a logged-in session, so it never
 * resets on login/logout the way the store.ts caches do. */
export interface ResourceCache<T> {
  get(): T;
  isLoaded(): boolean;
  isLoading(): boolean;
  error(): string | null;
  set(v: T): void;
  reset(): void;
  ensureLoaded(fetcher: () => Promise<T>): void;
}

export function createResourceCache<T>(fallback: T): ResourceCache<T> {
  let value = fallback;
  let loaded = false;
  let loading = false;
  let lastError: string | null = null;

  return {
    get: () => value,
    isLoaded: () => loaded,
    isLoading: () => loading,
    error: () => lastError,
    set(v: T) {
      value = v;
      loaded = true;
      lastError = null;
      notifyStoreChange();
    },
    reset() {
      value = fallback;
      loaded = false;
      loading = false;
      lastError = null;
    },
    ensureLoaded(fetcher: () => Promise<T>) {
      if (loaded || loading) return;
      loading = true;
      fetcher()
        .then((v) => {
          value = v;
          loaded = true;
          lastError = null;
        })
        .catch((e) => {
          lastError = e instanceof Error ? e.message : "Failed to load data";
        })
        .finally(() => {
          loading = false;
          notifyStoreChange();
        });
    },
  };
}

export { subscribeStoreChange };
