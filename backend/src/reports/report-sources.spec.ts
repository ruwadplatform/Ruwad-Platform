import { classifySource } from "../content/source-quality";
import type { ResearchItem } from "../content/research.service";
import { MAX_REPORT_QUERIES, buildSources, researchPlan, researchStatus, type PlanItem } from "./report-sources";

const plan: PlanItem = { query: "digital health Saudi Arabia", kind: "search", topic: "overview" };
const hit = (url: string, title: string, snippet = "Saudi Arabia digital health market update.", date: string | null = null) =>
  ({ item: { title, url, snippet, date, source: null, position: 1 } as ResearchItem, plan });
const ctx = { officialHosts: new Set<string>(["clinicy.com"]), scope: { sector: "Digital Health" }, now: new Date("2026-09-23T00:00:00Z") };
const build = (hits: ReturnType<typeof hit>[], cap?: number) => buildSources(hits, ctx, "2026-09-23T00:00:00.000Z", cap);

describe("source quality tiers", () => {
  it.each([
    ["https://www.moh.gov.sa/en/x", "government", 1],
    ["https://www.sfda.gov.sa/y", "government", 1],
    ["https://clinicy.com/about", "official", 2],
    ["https://www.who.int/z", "international", 3],
    ["https://www.pwc.com/m1/en/report.html", "consulting", 4],
    ["https://www.reuters.com/a", "news", 5],
    ["https://www.zawya.com/b", "news", 5],
    ["https://www.mobihealthnews.com/c", "industry", 6],
  ])("classifies %s as %s (tier %i)", (url, type, tier) => {
    expect(classifySource(url, ctx.officialHosts)).toMatchObject({ type, tier });
  });

  it("rejects SEO blogs, aggregators and social media", () => {
    for (const url of ["https://best-healthtech-seo-blog.com/top-10", "https://www.facebook.com/x", "https://medium.com/@someone/post", "https://random.example.org/page"]) {
      expect(classifySource(url, ctx.officialHosts)).toBeNull();
    }
  });
});

describe("buildSources", () => {
  it("drops untrusted domains", () => {
    const out = build([hit("https://seo-blog.example.com/a", "Saudi digital health"), hit("https://www.moh.gov.sa/a", "Digital health initiative")]);
    expect(out.map((s) => s.domain)).toEqual(["moh.gov.sa"]);
  });

  it("removes duplicates by canonical URL (tracking params, www, trailing slash)", () => {
    const out = build([
      hit("https://www.reuters.com/business/saudi-digital-health/", "Saudi digital health funding rises"),
      hit("https://reuters.com/business/saudi-digital-health?utm_source=x", "Saudi digital health funding rises"),
    ]);
    expect(out).toHaveLength(1);
  });

  it("removes same title on the same domain even if the URL differs", () => {
    const out = build([hit("https://www.arabnews.com/node/1", "Saudi digital health boom - Arab News"), hit("https://www.arabnews.com/node/2", "Saudi digital health boom | Arab News")]);
    expect(out).toHaveLength(1);
  });

  it("limits repeated results from one domain to 3", () => {
    const out = build([1, 2, 3, 4, 5].map((i) => hit(`https://www.reuters.com/a${i}`, `Saudi digital health story ${i}`)));
    expect(out).toHaveLength(3);
  });

  it("drops results that are off-topic or not about the region", () => {
    const out = build([
      hit("https://www.reuters.com/celebrity", "Celebrity news", "A film star wins an award."),
      hit("https://www.reuters.com/us-hospital", "Ohio hospital opens", "A hospital in Ohio opened a clinic."),
    ]);
    expect(out).toHaveLength(0);
  });

  it("ranks stronger source types first, then newer dates", () => {
    const out = build([
      hit("https://www.reuters.com/n", "Saudi digital health news", undefined, "2 days ago"),
      hit("https://www.moh.gov.sa/g", "Digital health strategy"),
      hit("https://www.who.int/i", "Saudi Arabia digital health country profile"),
    ]);
    expect(out.map((s) => s.tier)).toEqual([1, 3, 5]);
  });

  it("stores title, URL, domain, snippet, query, category and retrieval time, with a stable id", () => {
    const [s] = build([hit("https://www.moh.gov.sa/g", "Digital health strategy", "Saudi Arabia digital health plan.", "3 days ago")]);
    expect(s).toMatchObject({
      id: "S1", title: "Digital health strategy", url: "https://www.moh.gov.sa/g", domain: "moh.gov.sa", snippet: "Saudi Arabia digital health plan.",
      query: plan.query, sourceType: "government", sourceTypeLabel: "Government", retrievedAt: "2026-09-23T00:00:00.000Z", publishedAt: "2026-09-20",
    });
  });

  it("company reports keep only results that mention the company", () => {
    const out = buildSources(
      [hit("https://www.reuters.com/a", "Clinicy raises funding", "Riyadh-based Clinicy raised a round."), hit("https://www.reuters.com/b", "Saudi health news", "Unrelated Saudi health story.")],
      { ...ctx, scope: {}, subjectName: "Clinicy" }, "2026-09-23T00:00:00.000Z");
    expect(out.map((s) => s.title)).toEqual(["Clinicy raises funding"]);
  });
});

describe("research budget", () => {
  it("never plans more than 8 searches for a report, and about 5 for a startup", () => {
    for (const kind of ["SECTOR_OVERVIEW", "STARTUP_LANDSCAPE", "FUNDING_LANDSCAPE", "INVESTOR_LANDSCAPE"] as const) {
      const n = researchPlan(kind, { sector: "Digital Health" }).length;
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThanOrEqual(MAX_REPORT_QUERIES);
    }
    expect(researchPlan("STARTUP_ANALYSIS", {}, "Clinicy")).toHaveLength(5);
  });

  it("reports research status from the query log", () => {
    const q = (o: object) => ({ query: "q", kind: "search" as const, topic: "t", results: 1, cached: false, failed: false, skipped: false, ...o });
    expect(researchStatus([q({})], false)).toBe("disabled");
    expect(researchStatus([q({}), q({})], true)).toBe("ok");
    expect(researchStatus([q({}), q({ failed: true })], true)).toBe("partial");
    expect(researchStatus([q({ failed: true })], true)).toBe("unavailable");
    expect(researchStatus([], true)).toBe("unavailable");
  });
});
