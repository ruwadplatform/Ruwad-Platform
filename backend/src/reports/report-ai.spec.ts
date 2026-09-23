import { ConfigService } from "@nestjs/config";
import { ReportAiService, isOverviewAcceptable } from "./report-ai.service";
import type { ExternalSource } from "./report-types";

const source = (id: string): ExternalSource => ({
  id, title: "t", url: "https://www.moh.gov.sa/a", domain: "moh.gov.sa", snippet: "s", publishedAt: "2026-01-01", publishedText: null, query: "q", topic: "government",
  sourceType: "government", sourceTypeLabel: "Government", tier: 1, retrievedAt: "2026-09-23T00:00:00Z",
});
const data = JSON.stringify({ ruwadMetrics: [{ label: "Startups on RUWĀD", value: "9" }, { label: "Total recorded funding", value: "SAR 35.4M" }], sources: [{ id: "S1", date: "2026-01-01", text: "s" }] });

describe("AI overview safety check", () => {
  it("accepts text whose numbers all appear in the data", () => {
    expect(isOverviewAcceptable("RUWĀD data shows 9 startups with SAR 35.4M recorded funding. According to a government source [S1] there is activity.", data, [source("S1")])).toBe(true);
  });

  it("rejects an invented number", () => {
    expect(isOverviewAcceptable("RUWĀD lists 47 startups.", data, [source("S1")])).toBe(false);
  });

  it("rejects a derived percentage or total that the data does not state", () => {
    expect(isOverviewAcceptable("Startups grew 45% and funding reached SAR 100M.", data, [source("S1")])).toBe(false);
  });

  it("does not let a digit hide inside a bigger number (substring match)", () => {
    expect(isOverviewAcceptable("There are 5 startups.", data, [source("S1")])).toBe(false); // '5' only occurs inside 35.4
  });

  it("rejects a citation that does not exist", () => {
    expect(isOverviewAcceptable("According to a source [S7] things are fine.", data, [source("S1")])).toBe(false);
  });

  it("rejects empty or very long text", () => {
    expect(isOverviewAcceptable("", data, [])).toBe(false);
    expect(isOverviewAcceptable("word ".repeat(400), data, [])).toBe(false);
  });
});

describe("ReportAiService without an API key", () => {
  it("is unavailable and returns no overview, so reports fall back to the no-AI summary", async () => {
    const ai = new ReportAiService(new ConfigService({ ANTHROPIC_API_KEY: "" }));
    expect(ai.available).toBe(false);
    await expect(ai.overview({ scopeLabel: "Saudi healthcare", metrics: [], sources: [source("S1")] })).resolves.toBeNull();
  });
});
