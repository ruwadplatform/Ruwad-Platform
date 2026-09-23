import { randomUUID } from "crypto";
import { NotFoundException } from "@nestjs/common";
import { ResearchService } from "../content/research.service";
import type { SerperClient } from "../content/serper.client";
import { ReportGeneratorService } from "./report-generator.service";
import { ReportsService } from "./reports.service";
import type { InternalStats } from "./report-types";

class FakeRepo {
  rows: Record<string, any>[] = [];
  /** Mirrors the database column defaults (`default: []`) that a real insert would apply. */
  create = (o: object) => ({ relatedStartupIds: [], relatedInvestorIds: [], relatedReportIds: [], ...o });
  save = async (o: Record<string, any>) => { if (!o.id) { o.id = randomUUID(); this.rows.push(o); } return o; };
  findOne = async ({ where }: { where: Record<string, unknown> }) => this.rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null;
  findOneOrFail = async (q: { where: Record<string, unknown> }) => { const r = await this.findOne(q); if (!r) throw new Error("not found"); return r; };
  find = async () => [...this.rows];
  delete = async (id: string) => { this.rows = this.rows.filter((r) => r.id !== id); };
}
class FakeCache {
  rows = new Map<string, any>();
  findOne = async ({ where }: { where: { key: string } }) => this.rows.get(where.key) ?? null;
  upsert = async (row: any) => { this.rows.set(row.key, row); };
}

const STATS: InternalStats = {
  coverage: { startups: 9, investors: 8, asOf: "2026-09-23T00:00:00.000Z" },
  metrics: [{ label: "Startups on RUWĀD", value: "9", note: "all sectors" }, { label: "Total recorded funding", value: "SAR 35.4M" }],
  distributions: [{ key: "stage", title: "Startups by stage", unit: "startups", rows: [{ l: "Seed", v: 3 }] }],
  companies: [], investors: [], subject: null,
};

interface World { serperCalls: () => number; setFail: (f: boolean) => void; setResults: (r: { organic?: any[]; news?: any[] }) => void }
function setup(opts: { ai?: { available: boolean; overview: () => Promise<string | null> } } = {}) {
  const repo = new FakeRepo();
  const cache = new FakeCache();
  let calls = 0; let fail = false;
  let results: { organic: any[]; news: any[] } = {
    organic: [{ title: "Digital health strategy", link: "https://www.moh.gov.sa/dh", snippet: "Saudi Arabia digital health programme.", position: 1 }],
    news: [{ title: "Saudi digital health startup expands", link: "https://www.reuters.com/dh", snippet: "A Saudi digital health company expanded.", date: "1 day ago" }],
  };
  const serper = {
    enabled: true,
    searchDetailed: async () => { calls++; if (fail) throw new Error("Serper request failed"); return { organic: results.organic, knowledgeGraph: null }; },
    news: async () => { calls++; if (fail) throw new Error("Serper request failed"); return results.news; },
  } as unknown as SerperClient;
  const research = new ResearchService(serper, cache as never);
  const reports = new ReportsService(repo as never, {} as never, {} as never);
  const stats = { build: async () => STATS, officialHosts: async () => new Set<string>() };
  const ai = opts.ai ?? { available: false, overview: async () => null };
  const gen = new ReportGeneratorService(repo as never, reports, stats as never, research, ai as never);
  const world: World = { serperCalls: () => calls, setFail: (f) => { fail = f; }, setResults: (r) => { results = { organic: r.organic ?? [], news: r.news ?? [] }; } };
  return { gen, reports, repo, cache, world };
}

describe("report generation", () => {
  it("creates a DRAFT with RUWĀD statistics and sources, using at most 8 searches", async () => {
    const { gen, world } = setup();
    const r = await gen.generate("SECTOR_OVERVIEW", { sector: "Digital Health" });
    expect(r.isPublished).toBe(false);
    expect(r.title).toBe("Saudi Digital Health Landscape");
    expect(r.reportKind).toBe("SECTOR_OVERVIEW");
    expect(r.internalStats).toEqual(STATS);
    expect(r.externalSources.length).toBeGreaterThan(0);
    expect(r.externalSources[0]).toEqual(expect.objectContaining({ id: "S1", title: expect.any(String), url: expect.any(String), domain: expect.any(String), snippet: expect.any(String), query: expect.any(String), sourceTypeLabel: expect.any(String), retrievedAt: expect.any(String) }));
    expect(world.serperCalls()).toBeGreaterThan(0);
    expect(world.serperCalls()).toBeLessThanOrEqual(8);
  });

  it("works with no AI configured (facts-only overview)", async () => {
    const { gen } = setup();
    const r = await gen.generate("STARTUP_LANDSCAPE", { sector: "Digital Health" });
    expect(r.generationMode).toBe("no-ai");
    expect(r.aiOverview).toBeNull();
    expect(r.generated!.overviewLines.join(" ")).toContain("RUWĀD lists 9 startups");
    expect(r.executiveSummary).toContain("RUWĀD lists 9 startups");
  });

  it("stores an AI overview only when the AI returns one", async () => {
    const { gen } = setup({ ai: { available: true, overview: async () => "RUWĀD data shows 9 startups." } });
    const r = await gen.generate("SECTOR_OVERVIEW", {});
    expect(r).toMatchObject({ generationMode: "ai", aiOverview: "RUWĀD data shows 9 startups." });
    const off = setup({ ai: { available: true, overview: async () => null } });
    expect((await off.gen.generate("SECTOR_OVERVIEW", {})).generationMode).toBe("no-ai");
  });

  it("still generates when Serper is down: RUWĀD data only, with an honest note", async () => {
    const { gen, world } = setup();
    world.setFail(true);
    const r = await gen.generate("SECTOR_OVERVIEW", { sector: "Digital Health" });
    expect(r.externalSources).toEqual([]);
    expect(r.internalStats).toEqual(STATS);
    expect(r.generated!.research.status).toBe("unavailable");
    expect(r.generated!.research.note).toMatch(/unavailable/i);
  });

  it("reuses cached research for the same request within 24 hours (0 new searches)", async () => {
    const { gen, world } = setup();
    await gen.generate("SECTOR_OVERVIEW", { sector: "Digital Health" });
    const before = world.serperCalls();
    const again = await gen.generate("SECTOR_OVERVIEW", { sector: "Digital Health" });
    expect(world.serperCalls()).toBe(before);
    expect(again.generated!.research.searchesUsed).toBe(0);
    expect(again.generated!.research.cacheHits).toBeGreaterThan(0);
  });
});

describe("market size", () => {
  const consult = (snippet: string) => ({ organic: [{ title: "Saudi digital health market report", link: "https://www.pwc.com/m1/report", snippet, position: 1 }], news: [] });

  it("shows a market size only when a stored source states it", async () => {
    const { gen, world } = setup();
    world.setResults(consult("The Saudi Arabia digital health market was valued at USD 4.2 billion in 2024."));
    const r = await gen.generate("SECTOR_OVERVIEW", { sector: "Digital Health" });
    const ms = r.generated!.marketSize!;
    expect(ms.status).toBe("found");
    if (ms.status !== "found") return;
    expect(ms.claims[0]).toMatchObject({ currency: "USD", year: 2024, geography: "Saudi Arabia", url: "https://www.pwc.com/m1/report" });
    expect(r.externalSources.some((s) => s.id === ms.claims[0].sourceId)).toBe(true);
  });

  it("never invents one when the sources have none", async () => {
    const { gen, world } = setup();
    world.setResults(consult("Saudi Arabia is expanding its digital health services."));
    const r = await gen.generate("SECTOR_OVERVIEW", { sector: "Digital Health" });
    expect(r.generated!.marketSize).toEqual({ status: "notIdentified", message: "Reliable market-size data was not identified from the available sources." });
  });
});

describe("visibility: draft, publish, unpublish", () => {
  it("a draft is not publicly readable; publishing makes it readable; unpublishing removes it", async () => {
    const { gen, reports } = setup();
    const draft = await gen.generate("SECTOR_OVERVIEW", { sector: "Digital Health" });
    await expect(reports.findBySlugOrThrow(draft.slug)).rejects.toBeInstanceOf(NotFoundException);
    await reports.setPublished(draft.id, true);
    await expect(reports.findBySlugOrThrow(draft.slug)).resolves.toMatchObject({ slug: draft.slug, isPublished: true });
    await reports.setPublished(draft.id, false);
    await expect(reports.findBySlugOrThrow(draft.slug)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("opening a report runs 0 Serper searches", async () => {
    const { gen, reports, world } = setup();
    const r = await gen.generate("SECTOR_OVERVIEW", { sector: "Digital Health" });
    await reports.setPublished(r.id, true);
    const before = world.serperCalls();
    for (let i = 0; i < 3; i++) await reports.findBySlugOrThrow(r.slug);
    expect(world.serperCalls()).toBe(before);
  });
});

describe("explicit refresh", () => {
  it("bypasses the cache and spends searches", async () => {
    const { gen, world } = setup();
    const r = await gen.generate("SECTOR_OVERVIEW", { sector: "Digital Health" });
    const before = world.serperCalls();
    const refreshed = await gen.refreshResearch(r.id);
    expect(world.serperCalls()).toBeGreaterThan(before);
    expect(refreshed.generated!.research.searchesUsed).toBeGreaterThan(0);
  });

  it("keeps the earlier sources when the refresh cannot reach Serper", async () => {
    const { gen, world } = setup();
    const r = await gen.generate("SECTOR_OVERVIEW", { sector: "Digital Health" });
    const kept = r.externalSources.map((s) => s.url);
    expect(kept.length).toBeGreaterThan(0);
    world.setFail(true);
    const refreshed = await gen.refreshResearch(r.id);
    expect(refreshed.externalSources.map((s) => s.url)).toEqual(kept);
    expect(refreshed.generated!.research.status).toBe("partial");
    expect(refreshed.generated!.research.note).toMatch(/could not reach/i);
  });

  it("refuses to refresh a hand-written report", async () => {
    const { gen, repo } = setup();
    const legacy = await repo.save({ slug: "legacy", title: "Legacy", reportKind: null });
    await expect(gen.refreshResearch(legacy.id)).rejects.toThrow(/Only generated reports/);
  });
});
