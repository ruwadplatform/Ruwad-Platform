// Run with: npm run test:unit   (Node's built-in test runner; no extra dependencies)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyError, createResourceCacheCore } from "./resource-cache-core.ts";

class HttpError extends Error {
  status: number;
  constructor(status: number, message = `HTTP ${status}`) { super(message); this.status = status; }
}

/** A manual clock/timer so tests are instant and deterministic. */
function harness<T>(fallback: T, opts: { maxRetries?: number } = {}) {
  let t = 0;
  let notifications = 0;
  const timers: { at: number; fn: () => void; id: number; cleared?: boolean }[] = [];
  let nextId = 1;
  const cache = createResourceCacheCore(fallback, {
    notify: () => { notifications += 1; },
    now: () => t,
    setTimer: (fn, ms) => { const h = { at: t + ms, fn, id: nextId++ }; timers.push(h); return h; },
    clearTimer: (h) => { (h as { cleared?: boolean }).cleared = true; },
    baseDelayMs: 1000,
    maxDelayMs: 8000,
    ...opts,
  });
  return {
    cache,
    notifications: () => notifications,
    pendingTimers: () => timers.filter((x) => !x.cleared && x.at >= 0 && !(x as { fired?: boolean }).fired).length,
    /** Runs every timer due within `ms`, then lets promise callbacks settle. */
    async advance(ms: number) {
      t += ms;
      for (const h of timers) {
        if (!h.cleared && !(h as { fired?: boolean }).fired && h.at <= t) { (h as { fired?: boolean }).fired = true; h.fn(); }
      }
      await settle();
    },
  };
}
const settle = () => new Promise<void>((r) => setImmediate(r));

function counting<T>(impl: (n: number) => Promise<T>) {
  let calls = 0;
  const fetcher = () => impl(++calls);
  return { fetcher, calls: () => calls };
}

describe("classifyError", () => {
  it("treats 401, 403, 404 and other 4xx as permanent", () => {
    for (const s of [400, 401, 403, 404, 409, 422]) assert.equal(classifyError(new HttpError(s)), "permanent", String(s));
  });
  it("treats 408, 429, 5xx and network failures (status 0 / none) as transient", () => {
    for (const s of [408, 429, 500, 502, 503, 504, 0]) assert.equal(classifyError(new HttpError(s)), "transient", String(s));
    assert.equal(classifyError(new TypeError("Failed to fetch")), "transient");
    assert.equal(classifyError(undefined), "transient");
  });
});

describe("resource cache core", () => {
  it("200: caches the result, notifies once, and does not refetch", async () => {
    const h = harness<string[]>([]);
    const f = counting(async () => ["a"]);
    h.cache.ensureLoaded(f.fetcher);
    assert.equal(h.cache.isLoading(), true);
    await settle();
    assert.deepEqual(h.cache.get(), ["a"]);
    assert.equal(h.cache.isLoaded(), true);
    assert.equal(h.cache.error(), null);
    h.cache.ensureLoaded(f.fetcher);
    h.cache.ensureLoaded(f.fetcher);
    assert.equal(f.calls(), 1);
    assert.equal(h.notifications(), 1);
  });

  for (const status of [401, 403, 404]) {
    it(`${status}: no retry, terminal error, however often it is re-read`, async () => {
      const h = harness<string[]>([]);
      const f = counting(async () => { throw new HttpError(status); });
      h.cache.ensureLoaded(f.fetcher);
      await settle();
      assert.equal(h.cache.isFailed(), true);
      assert.equal(h.cache.isLoading(), false);
      assert.match(String(h.cache.error()), new RegExp(String(status)));
      for (let i = 0; i < 1000; i++) h.cache.ensureLoaded(f.fetcher); // a render loop re-reading the cache
      await h.advance(120_000);
      assert.equal(f.calls(), 1);
      assert.equal(h.pendingTimers(), 0);
    });
  }

  it("500: bounded retries with exponential backoff, then a terminal error (1 + 3 requests)", async () => {
    const h = harness<string[]>([]);
    const f = counting(async () => { throw new HttpError(500); });
    h.cache.ensureLoaded(f.fetcher);
    await settle();
    assert.equal(f.calls(), 1);
    assert.equal(h.cache.isLoading(), true); // a retry is scheduled
    await h.advance(999); assert.equal(f.calls(), 1); // 1s backoff not yet elapsed
    await h.advance(1); assert.equal(f.calls(), 2);
    await h.advance(1999); assert.equal(f.calls(), 2); // 2s
    await h.advance(1); assert.equal(f.calls(), 3);
    await h.advance(3999); assert.equal(f.calls(), 3); // 4s
    await h.advance(1); assert.equal(f.calls(), 4);
    assert.equal(h.cache.isFailed(), true);
    assert.equal(h.cache.isLoading(), false);
    await h.advance(600_000);
    assert.equal(f.calls(), 4, "no further requests once the cache has given up");
  });

  it("network failure (no HTTP status) is retried a bounded number of times", async () => {
    const h = harness<string[]>([], { maxRetries: 2 });
    const f = counting(async () => { throw new TypeError("Failed to fetch"); });
    h.cache.ensureLoaded(f.fetcher);
    await settle();
    await h.advance(60_000);
    await h.advance(60_000);
    await h.advance(60_000);
    assert.equal(f.calls(), 3); // 1 + 2 retries
    assert.equal(h.cache.isFailed(), true);
  });

  it("a transient failure that recovers loads normally and clears the error", async () => {
    const h = harness<string[]>([]);
    const f = counting(async (n) => { if (n < 3) throw new HttpError(503); return ["ok"]; });
    h.cache.ensureLoaded(f.fetcher);
    await settle();
    await h.advance(1000);
    await h.advance(2000);
    assert.deepEqual(h.cache.get(), ["ok"]);
    assert.equal(h.cache.error(), null);
    assert.equal(h.cache.isFailed(), false);
    assert.equal(f.calls(), 3);
  });

  it("duplicate callers share one in-flight request", async () => {
    const h = harness<string[]>([]);
    let release!: (v: string[]) => void;
    const f = counting(() => new Promise<string[]>((r) => { release = r; }));
    for (let i = 0; i < 50; i++) h.cache.ensureLoaded(f.fetcher);
    assert.equal(f.calls(), 1);
    release(["x"]);
    await settle();
    assert.deepEqual(h.cache.get(), ["x"]);
    assert.equal(f.calls(), 1);
  });

  it("the failure notification cannot create a render loop: a subscriber that re-reads on notify starts no request", async () => {
    let calls = 0;
    let reads = 0;
    const timers: (() => void)[] = [];
    const fetcher = async () => { calls += 1; throw new HttpError(429); };
    // Mirrors useSyncExternalStore: every notification makes the component re-render, and the render calls ensureLoaded() again.
    const cache = createResourceCacheCore<string[]>([], {
      notify: () => { reads += 1; if (reads < 10_000) cache.ensureLoaded(fetcher); },
      setTimer: (fn) => { timers.push(fn); return timers.length; },
      clearTimer: () => undefined,
    });
    cache.ensureLoaded(fetcher);
    await settle();
    assert.equal(calls, 1, "only the one scheduled retry may follow, and it is timer-driven");
    assert.ok(reads < 10, `re-render storm: ${reads}`);
    assert.equal(timers.length, 1);
  });

  it("a permanent error followed by re-render notifications stays at one request", async () => {
    let calls = 0;
    const fetcher = async () => { calls += 1; throw new HttpError(401); };
    const cache = createResourceCacheCore<string[]>([], { notify: () => { for (let i = 0; i < 50; i++) cache.ensureLoaded(fetcher); } });
    cache.ensureLoaded(fetcher);
    await settle();
    await settle();
    assert.equal(calls, 1);
  });

  it("manual retry() and invalidate() can load again after a terminal error", async () => {
    const h = harness<string[]>([]);
    let healthy = false;
    const f = counting(async () => { if (!healthy) throw new HttpError(403); return ["fixed"]; });
    h.cache.ensureLoaded(f.fetcher);
    await settle();
    assert.equal(h.cache.isFailed(), true);
    healthy = true;
    h.cache.ensureLoaded(f.fetcher); assert.equal(f.calls(), 1); // still blocked until asked
    h.cache.retry();
    h.cache.ensureLoaded(f.fetcher);
    await settle();
    assert.deepEqual(h.cache.get(), ["fixed"]);
    assert.equal(f.calls(), 2);

    // invalidate(): keeps the old value, marks it stale, and the next ensureLoaded() refetches
    const g = counting(async (n) => [`v${n}`]);
    h.cache.invalidate();
    assert.deepEqual(h.cache.get(), ["fixed"]);
    h.cache.ensureLoaded(g.fetcher);
    await settle();
    assert.deepEqual(h.cache.get(), ["v1"]);
  });

  it("invalidate() also recovers from a permanent error", async () => {
    const h = harness<string[]>([]);
    let ok = false;
    const f = counting(async () => { if (!ok) throw new HttpError(404); return ["now"]; });
    h.cache.ensureLoaded(f.fetcher); await settle();
    assert.equal(h.cache.isFailed(), true);
    ok = true;
    h.cache.invalidate();
    h.cache.ensureLoaded(f.fetcher); await settle();
    assert.deepEqual(h.cache.get(), ["now"]);
  });

  it("reset() cancels a pending retry and ignores a late response from before the reset", async () => {
    const h = harness<string[]>(["fallback"]);
    let release!: (v: string[]) => void;
    const slow = counting(() => new Promise<string[]>((r) => { release = r; }));
    h.cache.ensureLoaded(slow.fetcher);
    h.cache.reset();
    release(["stale"]);
    await settle();
    assert.deepEqual(h.cache.get(), ["fallback"], "a response from before reset() must not be applied");
    assert.equal(h.cache.isLoaded(), false);

    const failing = counting(async () => { throw new HttpError(500); });
    h.cache.ensureLoaded(failing.fetcher); await settle();
    assert.equal(h.pendingTimers(), 1);
    h.cache.reset();
    await h.advance(600_000);
    assert.equal(failing.calls(), 1, "reset() must cancel the scheduled retry");
  });

  it("set() stores a value and stops any retry", async () => {
    const h = harness<string[]>([]);
    const f = counting(async () => { throw new HttpError(500); });
    h.cache.ensureLoaded(f.fetcher); await settle();
    h.cache.set(["manual"]);
    await h.advance(600_000);
    assert.deepEqual(h.cache.get(), ["manual"]);
    assert.equal(f.calls(), 1);
  });
});
