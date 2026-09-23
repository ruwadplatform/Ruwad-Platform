import { ResearchService } from "./research.service";
import type { SerperClient } from "./serper.client";

class FakeCache {
  rows = new Map<string, { key: string; payload: unknown; fetchedAt: Date }>();
  findOne = async ({ where }: { where: { key: string } }) => this.rows.get(where.key) ?? null;
  upsert = async (row: { key: string; payload: unknown; fetchedAt: Date }) => { this.rows.set(row.key, row); };
}

function setup(over: { enabled?: boolean; fail?: boolean } = {}) {
  const calls = { search: 0, news: 0 };
  const serper = {
    enabled: over.enabled ?? true,
    searchDetailed: async () => { calls.search++; if (over.fail) throw new Error("Serper request failed (HTTP 500)"); return { organic: [{ title: "T", link: "https://www.moh.gov.sa/a", snippet: "s", position: 1 }], knowledgeGraph: null }; },
    news: async () => { calls.news++; if (over.fail) throw new Error("Serper request failed"); return [{ title: "N", link: "https://www.reuters.com/n", snippet: "s", date: "1 day ago" }]; },
  } as unknown as SerperClient;
  const cache = new FakeCache();
  const service = new ResearchService(serper, cache as never);
  return { service, cache, calls };
}

describe("ResearchService / ResearchSession", () => {
  it("answers a repeated query from the cache within 24 hours (no second Serper call)", async () => {
    const { service, calls } = setup();
    const first = service.session(8);
    await first.run("saudi digital health");
    expect(first.serperCalls).toBe(1);
    const second = service.session(8);
    const r = await second.run("Saudi   Digital Health");
    expect(r.cached).toBe(true);
    expect(second.serperCalls).toBe(0);
    expect(second.cacheHits).toBe(1);
    expect(calls.search).toBe(1);
  });

  it("does not use a cache entry older than the freshness window", async () => {
    const { service, cache, calls } = setup();
    await service.session(8).run("saudi digital health");
    for (const row of cache.rows.values()) row.fetchedAt = new Date(Date.now() - 25 * 3600_000);
    const s = service.session(8, { ttlHours: 24 });
    await s.run("saudi digital health");
    expect(s.serperCalls).toBe(1);
    expect(calls.search).toBe(2);
  });

  it("an explicit refresh (force) bypasses the cache and spends a search", async () => {
    const { service, calls } = setup();
    await service.session(8).run("saudi digital health");
    const s = service.session(8, { force: true });
    await s.run("saudi digital health");
    expect(s.serperCalls).toBe(1);
    expect(calls.search).toBe(2);
  });

  it("stops at the query budget and never runs the same query twice in one run", async () => {
    const { service, calls } = setup();
    const s = service.session(3);
    for (const q of ["a", "b", "c", "d", "e", "a"]) await s.run(q);
    expect(calls.search).toBe(3);
    expect(s.log.filter((l) => l.skipped)).toHaveLength(2);
  });

  it("a Serper failure never throws: the result is empty and flagged", async () => {
    const { service } = setup({ fail: true });
    const s = service.session(8);
    const r = await s.run("saudi digital health");
    expect(r).toMatchObject({ items: [], failed: true });
    expect(s.serperCalls).toBe(0);
  });

  it("without a Serper key it makes no calls and flags failure", async () => {
    const { service, calls } = setup({ enabled: false });
    const r = await service.session(8).run("saudi digital health");
    expect(r.failed).toBe(true);
    expect(calls.search + calls.news).toBe(0);
  });

  it("still serves a cached answer when the key is missing", async () => {
    const { service, cache } = setup();
    await service.session(8).run("saudi digital health");
    const off = new ResearchService({ enabled: false } as unknown as SerperClient, cache as never);
    const r = await off.session(8).run("saudi digital health");
    expect(r.cached).toBe(true);
  });
});
