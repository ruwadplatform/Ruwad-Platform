/** Shared core of RUWĀD's synchronous-read / async-populate resource caches (lib/store.ts and lib/api/resource-cache.ts).
 *
 * Why this exists: the previous cache cleared its `loading` flag on failure and notified subscribers. A subscriber that re-reads the cache
 * while rendering (useSyncExternalStore -> getOwnedListings() -> ensureLoaded()) then fetched again immediately, which failed again, and so on:
 * a single 429 turned into tens of thousands of requests from one tab. Failures are now classified and retried a bounded number of times with
 * exponential backoff, and the cache owns its retry timer, so re-rendering can never start a request.
 *
 *   request -> success: cache it
 *           -> failure: classify
 *                 permanent (4xx other than 408/429, e.g. 401/403/404) -> terminal error, no retry
 *                 transient (5xx, 429, 408, network)                   -> up to `maxRetries` retries, backoff, then terminal error
 *
 * A terminal error stays visible through error(); it is cleared only by an explicit reset(), invalidate() or retry(). */

export interface ResourceCacheOptions {
  /** Tells subscribers that state changed (loading / error / value). Must be safe to call at any time. */
  notify(): void;
  /** Retries after the first attempt. Default 3 (so at most 4 requests per load attempt chain). */
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Injectable for tests. */
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface ResourceCache<T> {
  get(): T;
  isLoaded(): boolean;
  /** True while a request is in flight or a retry is scheduled. */
  isLoading(): boolean;
  /** Message of the last failure (kept while retries are pending and after a terminal failure); null after a success. */
  error(): string | null;
  /** True once the cache has given up (permanent error or retries exhausted). Nothing refetches until reset/invalidate/retry. */
  isFailed(): boolean;
  set(v: T): void;
  /** Drops the value back to the fallback and forgets everything, including in-flight results. Does not notify. */
  reset(): void;
  /** Marks the value stale and clears any failure state; the next ensureLoaded() fetches again. Keeps the current value. Notifies. */
  invalidate(): void;
  /** Clears a terminal failure so the next ensureLoaded() can try again. */
  retry(): void;
  /** Starts a load unless one is in flight, the value is loaded, a retry is already scheduled, or the cache has given up. */
  ensureLoaded(fetcher: () => Promise<T>): void;
}

export type ErrorKind = "permanent" | "transient";

/** Duck-typed on `status` so this module needs no imports (ApiError carries the HTTP status; 0/absent means the network failed). */
export function classifyError(e: unknown): ErrorKind {
  const status = typeof e === "object" && e !== null && typeof (e as { status?: unknown }).status === "number" ? (e as { status: number }).status : undefined;
  if (status === undefined || status === 0) return "transient";
  if (status === 408 || status === 429) return "transient";
  if (status >= 400 && status < 500) return "permanent";
  return "transient";
}

export function createResourceCacheCore<T>(fallback: T, options: ResourceCacheOptions): ResourceCache<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let value = fallback;
  let loaded = false;
  let inflight = false;
  let failed = false;
  let failures = 0;
  let lastError: string | null = null;
  let timer: unknown = null;
  let lastFetcher: (() => Promise<T>) | null = null;
  /** Bumped by reset()/invalidate(): a response from an older generation is ignored, so a late reply can never resurrect stale data. */
  let generation = 0;

  function clearScheduled(): void {
    if (timer !== null) { clearTimer(timer); timer = null; }
  }

  function start(fetcher: () => Promise<T>): void {
    inflight = true;
    const mine = generation;
    let pending: Promise<T>;
    try { pending = fetcher(); } catch (e) { pending = Promise.reject(e); }
    pending.then(
      (v) => {
        if (mine !== generation) return;
        inflight = false;
        value = v;
        loaded = true;
        failed = false;
        failures = 0;
        lastError = null;
        options.notify();
      },
      (e: unknown) => {
        if (mine !== generation) return;
        inflight = false;
        lastError = e instanceof Error ? e.message : "Failed to load data";
        const permanent = classifyError(e) === "permanent";
        if (permanent || failures >= maxRetries) {
          failed = true;
        } else {
          failures += 1;
          const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (failures - 1));
          timer = setTimer(() => {
            timer = null;
            if (mine === generation && lastFetcher && !loaded && !inflight && !failed) start(lastFetcher);
          }, delay);
        }
        // Subscribers learn about the failure once. Re-reading the cache after this notification cannot start a request:
        // ensureLoaded() is a no-op while a retry is scheduled or after the cache has given up.
        options.notify();
      },
    );
  }

  return {
    get: () => value,
    isLoaded: () => loaded,
    isLoading: () => inflight || timer !== null,
    error: () => lastError,
    isFailed: () => failed,
    set(v: T) {
      clearScheduled();
      generation += 1;
      inflight = false;
      value = v;
      loaded = true;
      failed = false;
      failures = 0;
      lastError = null;
      options.notify();
    },
    reset() {
      clearScheduled();
      generation += 1;
      value = fallback;
      loaded = false;
      inflight = false;
      failed = false;
      failures = 0;
      lastError = null;
      lastFetcher = null;
    },
    invalidate() {
      clearScheduled();
      generation += 1;
      loaded = false;
      inflight = false;
      failed = false;
      failures = 0;
      lastError = null;
      options.notify();
    },
    retry() {
      if (!failed) return;
      failed = false;
      failures = 0;
      lastError = null;
    },
    ensureLoaded(fetcher: () => Promise<T>) {
      if (loaded || inflight || failed || timer !== null) return;
      lastFetcher = fetcher;
      start(fetcher);
    },
  };
}
