import { LIBRARY_DEFINITIONS } from "./library-definitions";
import { FACTS_BY_ID, LIBRARY_FACTS } from "./library-facts";
import { buildNarrative } from "./library-narrative";
import { assembleReport, emptyContent } from "./library-report";
import type { LibraryRaw } from "./library-stats.service";
import type { VerifiedFact, WorldBankPoint } from "./library-types";
import { normalizeForMatch, numbersIn, quoteIsOnPage, unsupportedNumbers, verifyFacts } from "./library-verify";
import { WORLD_BANK_BY_ID, fetchWorldBank } from "./library-world-bank";
import type { DocumentFetch } from "../../content/safe-fetch";

const html = (body: string): DocumentFetch => ({ ok: true, finalUrl: "https://x", contentType: "text/html", body: Buffer.from(`<html><head><title>t</title><script>var a = 1;</script></head><body>${body}</body></html>`) });

const raw = (over: Partial<LibraryRaw> = {}): LibraryRaw => ({
  asOf: "2026-09-24T00:00:00.000Z", categories: null, startupsTotal: 9, startups: 9, funded: 5, fundraising: 2, fundingSarM: 120.5, medianFundingSarM: 12, rounds: 7,
  investorsTotal: 8, investorsInGroup: 8, investorsWithGroupDeals: 3, investorHealthDeals: 40, hubs: 7, researchInstitutions: 7, researchers: 1500, researchCenters: 20, researchLabs: 30, patents: 12,
  multinationals: 12, mncSaudiOffice: 10, mncManufacturing: 4, mncResearch: 3, mncRegionalHq: 2,
  stages: [{ l: "Seed", v: 5 }, { l: "Series A", v: 4 }], cities: [{ l: "Riyadh", v: 6 }], investorTypes: [{ l: "VC", v: 5 }], hubTypes: [{ l: "Accelerator", v: 4 }], hubCities: [{ l: "Riyadh", v: 4 }],
  researchTypes: [{ l: "University", v: 5 }], researchCities: [{ l: "Riyadh", v: 3 }], mncCategories: [{ l: "MedTech", v: 6 }], ...over,
});

const wbPoint = (id: string, value: number, year = 2023): WorldBankPoint => {
  const ind = WORLD_BANK_BY_ID.get(id)!;
  return { id, code: ind.code, label: ind.label, unit: ind.unit, value, display: ind.thousands ? Math.round(value).toLocaleString("en-US") : value.toFixed(ind.decimals), year, geography: "Saudi Arabia", organization: "World Bank", url: `https://data.worldbank.org/indicator/${ind.code}?locations=SA`, retrievedAt: "2026-09-24T00:00:00Z" };
};
const allWb = [wbPoint("wb-health-exp-gdp", 5.687), wbPoint("wb-health-exp-pc", 1825.25), wbPoint("wb-physicians", 3.406), wbPoint("wb-nurses", 6.557), wbPoint("wb-beds", 2.41), wbPoint("wb-population", 36973555, 2025), wbPoint("wb-life-expectancy", 78.982, 2024), wbPoint("wb-rd", 0.635, 2024)];
const asVerified = (): VerifiedFact[] => LIBRARY_FACTS.map((f) => ({ ...f, verification: "manual" as const, checkedAt: "2026-09-24T00:00:00Z" }));

describe("library fact registry", () => {
  it("has unique ids and complete source metadata on every fact", () => {
    expect(new Set(LIBRARY_FACTS.map((f) => f.id)).size).toBe(LIBRARY_FACTS.length);
    for (const f of LIBRARY_FACTS) {
      expect(f.url).toMatch(/^https:\/\//);
      expect(f.organization.length).toBeGreaterThan(2);
      expect(f.documentTitle.length).toBeGreaterThan(2);
      expect(f.geography).toBeTruthy();
      expect(f.year).toBeGreaterThanOrEqual(2024);
      expect(f.quote.length).toBeGreaterThan(20);
      expect(f.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("never states a number that its verbatim quote (or stated year/period) does not contain", () => {
    for (const f of LIBRARY_FACTS) expect({ id: f.id, bad: unsupportedNumbers(f) }).toEqual({ id: f.id, bad: [] });
  });

  it("every definition references facts and indicators that exist", () => {
    expect(new Set(LIBRARY_DEFINITIONS.map((d) => d.slug)).size).toBe(6);
    for (const d of LIBRARY_DEFINITIONS) {
      for (const id of d.factIds) expect(FACTS_BY_ID.has(id)).toBe(true);
      for (const id of d.worldBankIds) expect(WORLD_BANK_BY_ID.has(id)).toBe(true);
    }
  });
});

describe("fact verification", () => {
  it("matches quotes despite entities, curly quotes, dashes, case and spacing", () => {
    expect(normalizeForMatch("Ministry&#39;s  &amp; plans — Ready&#58; now")).toBe("ministry's & plans - ready: now");
    expect(quoteIsOnPage("The sector's contribution", "<p>The sector’s   CONTRIBUTION</p>")).toBe(true);
    expect(quoteIsOnPage("USD 3.24B committed", "USD 3.25B committed")).toBe(false);
  });

  it("reads numbers canonically", () => {
    expect(numbersIn("4,000 beds, USD 1.86B in 2025, 09")).toEqual(["4000", "1.86", "2025", "9"]);
  });

  const fact = LIBRARY_FACTS.find((f) => f.id === "ghe2025-vc")!;
  it("keeps a fact whose quote is on the live page as 'live'", async () => {
    const r = await verifyFacts([fact], async () => html(`<p>… ${fact.quote} …</p>`));
    expect(r.facts).toHaveLength(1);
    expect(r.facts[0].verification).toBe("live");
    expect(r.dropped).toEqual([]);
  });

  it("drops a fact whose quote is no longer on the page, or whose page is gone", async () => {
    const changed = await verifyFacts([fact], async () => html("<p>Something else entirely</p>"));
    expect(changed.facts).toEqual([]);
    expect(changed.dropped[0].reason).toMatch(/no longer found/);
    const gone = await verifyFacts([fact], async () => ({ ok: false, reason: "http", status: 404 }));
    expect(gone.facts).toEqual([]);
    expect(gone.dropped[0].reason).toMatch(/gone/);
  });

  it("keeps an unreachable or blocked page as 'manual' rather than inventing a result", async () => {
    for (const res of [{ ok: false, reason: "unreachable" } as DocumentFetch, { ok: false, reason: "http", status: 403 } as DocumentFetch]) {
      const r = await verifyFacts([fact], async () => res);
      expect(r.facts[0].verification).toBe("manual");
      expect(r.facts[0].verifiedOn).toBe(fact.verifiedOn);
    }
    const thrown = await verifyFacts([fact], async () => { throw new Error("boom"); });
    expect(thrown.facts[0].verification).toBe("manual");
  });

  it("drops a fact whose statement carries a number its quote lacks", async () => {
    const bad = { ...fact, id: "bad", statement: "USD 9.99 billion was committed." };
    const r = await verifyFacts([bad], async () => html(fact.quote));
    expect(r.facts).toEqual([]);
    expect(r.dropped[0].reason).toMatch(/not in its quote/);
  });

  it("fetches each source page once for facts that share it", async () => {
    const same = LIBRARY_FACTS.filter((f) => f.url === fact.url);
    let calls = 0;
    await verifyFacts(same, async () => { calls++; return html(same.map((f) => f.quote).join(" ")); });
    expect(same.length).toBeGreaterThan(1);
    expect(calls).toBe(1);
  });
});

describe("World Bank indicators", () => {
  it("reads the latest value and its year, and reports indicators it could not get", async () => {
    const body = (v: number | null) => ({ ok: true, finalUrl: "", contentType: "application/json", body: Buffer.from(JSON.stringify([{ page: 1 }, [{ value: v, date: "2023", country: { value: "Saudi Arabia" } }]])) }) as DocumentFetch;
    const r = await fetchWorldBank(["wb-physicians", "wb-beds", "wb-rd"], async (url) => (url.includes("PHYS") ? body(3.406) : url.includes("BEDS") ? body(null) : { ok: false, reason: "unreachable" }));
    expect(r.points).toHaveLength(1);
    expect(r.points[0]).toMatchObject({ id: "wb-physicians", value: 3.406, display: "3.4", year: 2023, geography: "Saudi Arabia", url: "https://data.worldbank.org/indicator/SH.MED.PHYS.ZS?locations=SA" });
    expect(r.failed.sort()).toEqual(["wb-beds", "wb-rd"]);
  });
});

describe("library narrative", () => {
  it("writes all six reports with no dropped paragraph", () => {
    for (const def of LIBRARY_DEFINITIONS) {
      const out = buildNarrative({ def, raw: raw({ categories: def.categories }), facts: asVerified().filter((f) => def.factIds.includes(f.id)), worldBank: allWb.filter((p) => def.worldBankIds.includes(p.id)) });
      expect({ slug: def.slug, warnings: out.warnings }).toEqual({ slug: def.slug, warnings: [] });
      expect(out.sections.length).toBeGreaterThanOrEqual(4);
      const numbered = out.sections.flatMap((s) => s.paragraphs).filter((p) => /d/.test(p.text));
      expect(numbered.length).toBeGreaterThan(0);
    }
  });

  it("takes database figures from the database, not from text", () => {
    const def = LIBRARY_DEFINITIONS[0];
    const out = buildNarrative({ def, raw: raw({ startups: 77, startupsTotal: 77, funded: 0, fundraising: 0 }), facts: [], worldBank: [] });
    const text = out.sections.flatMap((s) => s.paragraphs.map((p) => p.text)).join(" ");
    expect(text).toContain("77 startups");
    expect(out.warnings).toEqual([]);
  });

  it("states plainly that RUWĀD has no biotech startups instead of describing any", () => {
    const def = LIBRARY_DEFINITIONS.find((d) => d.slug === "saudi-biotechnology-landscape-2026")!;
    const out = buildNarrative({ def, raw: raw({ categories: def.categories, startups: 0, funded: 0, fundraising: 0, fundingSarM: 0, investorsWithGroupDeals: 0, stages: [], cities: [] }), facts: asVerified().filter((f) => def.factIds.includes(f.id)), worldBank: allWb });
    const text = out.sections.flatMap((s) => s.paragraphs.map((p) => p.text)).join("\n");
    expect(text).toMatch(/does not currently list any startups/);
    expect(text).not.toMatch(/most common stage/);
  });

  it("leaves out facts that could not be verified and lists them as missing", () => {
    const def = LIBRARY_DEFINITIONS.find((d) => d.slug === "saudi-healthcare-startup-funding-landscape-2026")!;
    const facts = asVerified().filter((f) => def.factIds.includes(f.id) && f.id !== "monshaat-vc-h1-2025");
    const out = buildNarrative({ def, raw: raw(), facts, worldBank: [] });
    expect(out.sections.flatMap((s) => s.paragraphs).some((p) => p.factIds.includes("monshaat-vc-h1-2025"))).toBe(false);
    expect(out.missing.join(" ")).toContain("monshaat-vc-h1-2025");
  });

  it("drops a paragraph carrying a number that is not in its evidence", () => {
    // A database figure that was not passed as evidence must never slip into text: simulate by an unsupported World Bank value.
    const def = LIBRARY_DEFINITIONS[0];
    const out = buildNarrative({ def, raw: raw(), facts: asVerified().filter((f) => def.factIds.includes(f.id)), worldBank: [] });
    expect(out.missing.some((m) => /World Bank indicator/.test(m))).toBe(true);
    expect(out.sections.find((s) => s.heading === "The health system at a glance")).toBeUndefined();
  });

  it("never states a market size or forecast of its own", () => {
    for (const def of LIBRARY_DEFINITIONS) {
      const out = buildNarrative({ def, raw: raw({ categories: def.categories }), facts: asVerified().filter((f) => def.factIds.includes(f.id)), worldBank: allWb });
      for (const s of out.sections) for (const p of s.paragraphs) if (p.factIds.length === 0) expect(p.text).not.toMatch(/market (is worth|will reach)|CAGR|will grow|forecast/i);
    }
  });
});

describe("assembled report", () => {
  it("is a normal RUWĀD-origin report that the directory can list, filter and search", () => {
    const def = LIBRARY_DEFINITIONS.find((d) => d.slug === "saudi-digital-health-landscape-2026")!;
    const facts = asVerified().filter((f) => def.factIds.includes(f.id));
    const narrative = buildNarrative({ def, raw: raw({ categories: def.categories }), facts, worldBank: allWb.filter((p) => def.worldBankIds.includes(p.id)) });
    const content = { ...emptyContent([]), facts, worldBank: allWb.filter((p) => def.worldBankIds.includes(p.id)), sections: narrative.sections, missing: narrative.missing };
    const r = assembleReport(def, content, { coverage: { startups: 9, investors: 8, asOf: "" }, metrics: [], distributions: [], companies: [], investors: [], subject: null }, [], "2026-09-24");
    expect(r).toMatchObject({ slug: def.slug, title: "Saudi Digital Health Landscape 2026", category: "Digital Health", geography: "Saudi Arabia", origin: "RUWAD", reportKind: null, generated: null, generationMode: "no-ai" });
    expect(r.libraryContent?.marketSize).toEqual({ status: "notIdentified", message: "Reliable market-size data was not identified from the available sources." });
    expect(r.sources?.length).toBe(facts.length + content.worldBank.length);
    expect(r.provenanceSources).toContain("Saudi Food and Drug Authority (SFDA)");
  });
});
