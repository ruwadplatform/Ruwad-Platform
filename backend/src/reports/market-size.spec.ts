import { MARKET_SIZE_NOT_IDENTIFIED, extractMarketSize } from "./market-size";
import type { ExternalSource } from "./report-types";

const src = (over: Partial<ExternalSource>): ExternalSource => ({
  id: "S1", title: "Saudi digital health report", url: "https://www.pwc.com/r", domain: "pwc.com", snippet: "", publishedAt: null, publishedText: null,
  query: "q", topic: "market-study", sourceType: "consulting", sourceTypeLabel: "Consulting / research firm", tier: 4, retrievedAt: "2026-09-23T00:00:00Z", ...over,
});

describe("extractMarketSize", () => {
  it("returns a figure only with currency, scale, year, Saudi geography and a credible source", () => {
    const r = extractMarketSize([src({ snippet: "The Saudi Arabia digital health market was valued at USD 4.2 billion in 2024." })]);
    expect(r.status).toBe("found");
    if (r.status !== "found") return;
    expect(r.claims[0]).toMatchObject({ amount: "4.2 billion", currency: "USD", year: 2024, geography: "Saudi Arabia", basis: "reported", sourceId: "S1", url: "https://www.pwc.com/r", domain: "pwc.com" });
    expect(r.claims[0].quote).toContain("USD 4.2 billion");
  });

  it("labels a forward-looking figure as a projection", () => {
    const r = extractMarketSize([src({ snippet: "The Saudi healthcare market is projected to reach SAR 90 billion by 2030." })]);
    expect(r.status === "found" && r.claims[0]).toMatchObject({ currency: "SAR", year: 2030, basis: "projected" });
  });

  it("says data was not identified when no source states a size", () => {
    expect(extractMarketSize([src({ snippet: "Saudi Arabia is investing in digital health under Vision 2030." })])).toEqual({ status: "notIdentified", message: MARKET_SIZE_NOT_IDENTIFIED });
    expect(extractMarketSize([])).toEqual({ status: "notIdentified", message: MARKET_SIZE_NOT_IDENTIFIED });
  });

  it("never turns a funding round into a market size", () => {
    expect(extractMarketSize([src({ snippet: "A Saudi digital health startup raised USD 20 million in 2025 to grow its market share." })]).status).toBe("notIdentified");
  });

  it("needs a year in the same sentence", () => {
    expect(extractMarketSize([src({ snippet: "The Saudi digital health market is worth USD 4 billion." })]).status).toBe("notIdentified");
  });

  it("needs a currency and a scale", () => {
    expect(extractMarketSize([src({ snippet: "The Saudi digital health market grew 12 billion in 2024." })]).status).toBe("notIdentified");
    expect(extractMarketSize([src({ snippet: "The Saudi digital health market reached 4200 in 2024." })]).status).toBe("notIdentified");
  });

  it("needs the geography to be Saudi Arabia", () => {
    expect(extractMarketSize([src({ snippet: "The global digital health market was valued at USD 300 billion in 2024." })]).status).toBe("notIdentified");
  });

  it("ignores weak sources (industry publications, unknown)", () => {
    const text = "The Saudi Arabia digital health market was valued at USD 4.2 billion in 2024.";
    expect(extractMarketSize([src({ snippet: text, tier: 6, sourceType: "industry" })]).status).toBe("notIdentified");
  });

  it("prefers stronger sources and removes duplicates", () => {
    const text = "The Saudi Arabia digital health market was valued at USD 4.2 billion in 2024.";
    const r = extractMarketSize([src({ id: "S2", snippet: text, tier: 5, sourceType: "news" }), src({ id: "S1", snippet: text })]);
    expect(r.status === "found" && r.claims).toHaveLength(1);
    expect(r.status === "found" && r.claims[0].sourceId).toBe("S1");
  });
});
