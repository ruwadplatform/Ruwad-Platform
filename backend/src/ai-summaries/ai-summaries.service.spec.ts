import { BadRequestException, HttpException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { AiSummariesService } from "./ai-summaries.service";
import { ProviderFailureError, ProviderNotConfiguredError, PROMPT_VERSION } from "./ai-summary-generator";
import { EntityKind } from "../common/enums";

const STARTUP = {
  id: "11111111-1111-4111-8111-111111111111", slug: "gees-health", name: "Gees Health", category: "Diagnostics", subsector: "Women's health", tagline: "At-home hormone monitoring",
  city: "Riyadh", country: "Saudi Arabia", hq: "Riyadh", founded: 2026, foundedBasis: "KNOWN", stage: "Pre-Seed", status: "Active", businessModel: "Kit plus subscription",
  employees: 3, fundingTotal: 0, desc: "Saliva-based hormone testing with AI analytics delivered through an app for continuous insight.", problem: "Testing needs clinic visits.", solution: "At-home kit.",
  advantage: "—", sfda: "—", fda: "—", ce: "—", clinicalStatus: "—", patentStatus: "—", marketTam: "—", marketSam: "—",
  provenanceSources: ["Company website"], provenanceConfidence: "Medium", provenanceLastUpdated: "2026-10-07",
};
const SUMMARY = { overview: "word ".repeat(70).trim(), highlights: ["Founded in 2026.", "Pre-Seed stage."] };

const WEB_ITEMS = [
  { title: "Gees Health raises seed", url: "https://news.example.com/gees", snippet: "Gees Health, a Riyadh company, launched an at-home hormone test.", date: null, source: null, position: 1 },
  { title: "Unrelated Co", url: "https://other.example.com/x", snippet: "Another company entirely.", date: null, source: null, position: 2 },
];

function setup(over: { startup?: unknown; cached?: Record<string, unknown> | null; generate?: jest.Mock; available?: boolean; research?: { enabled: boolean; run: jest.Mock }; env?: Record<string, string> } = {}) {
  const store: { row: Record<string, unknown> | null } = { row: over.cached === undefined ? null : over.cached };
  const cache = {
    findOne: jest.fn(async () => store.row),
    upsert: jest.fn(async (v: Record<string, unknown>) => { store.row = { ...v }; }),
  };
  const repoOf = (row: unknown) => ({ findOne: jest.fn(async () => row), find: jest.fn(async () => []) });
  const generate = over.generate ?? jest.fn(async () => SUMMARY);
  const generator = { available: over.available ?? true, model: "test-model", generate };
  const shared = { getSectorNames: jest.fn(async () => []), getProducts: jest.fn(async () => []), getPartnerships: jest.fn(async () => []) };
  const run = over.research?.run ?? jest.fn(async () => ({ items: WEB_ITEMS, knowledgeGraph: null, cached: false, failed: false, skipped: false }));
  const research = { enabled: over.research?.enabled ?? true, session: jest.fn(() => ({ run })) };
  const config = { get: (k: string) => over.env?.[k] };
  const startup = over.startup === undefined ? STARTUP : over.startup;
  const service = new AiSummariesService(cache as never, repoOf(startup) as never, repoOf(null) as never, repoOf(null) as never, repoOf(null) as never, repoOf(null) as never, shared as never, generator as never, research as never, config as never);
  return { service, cache, generate, store, run, research, startupRepo: service["startups" as keyof typeof service] as unknown as { findOne: jest.Mock } };
}

describe("AiSummariesService", () => {
  it("generates on first request, stores it, and reports it as not cached", async () => {
    const { service, generate, cache } = setup();
    const r = await service.get("startups", "gees-health");
    expect(r).toMatchObject({ status: "ready", cached: false, name: "Gees Health", aiGenerated: true, source: { label: "RUWĀD profile data", sources: ["Company website"], lastUpdated: "2026-10-07" } });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(cache.upsert).toHaveBeenCalledWith(expect.objectContaining({ entityType: EntityKind.STARTUP, accessScope: "member", promptVersion: PROMPT_VERSION, modelVersion: "test-model" }), expect.anything());
  });

  it("serves the cached summary on the second request without calling the provider", async () => {
    const { service, generate } = setup();
    await service.get("startups", "gees-health");
    const second = await service.get("startups", "gees-health");
    expect(second).toMatchObject({ status: "ready", cached: true });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("regenerates after the profile changes (fingerprint no longer matches)", async () => {
    const { service, generate, startupRepo } = setup();
    await service.get("startups", "gees-health");
    startupRepo.findOne.mockResolvedValue({ ...STARTUP, solution: "At-home kit with a companion app." });
    const r = await service.get("startups", "gees-health");
    expect(r).toMatchObject({ status: "ready", cached: false });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("regenerates when the cached row has expired", async () => {
    const { service, generate, store } = setup();
    await service.get("startups", "gees-health");
    store.row = { ...store.row!, expiresAt: new Date(Date.now() - 1000) };
    await service.get("startups", "gees-health");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("shares one provider call between concurrent requests for the same organization", async () => {
    let release!: (v: typeof SUMMARY) => void;
    const generate = jest.fn(() => new Promise<typeof SUMMARY>((res) => { release = res; }));
    const { service } = setup({ generate });
    const calls = [service.get("startups", "gees-health"), service.get("startups", "gees-health"), service.get("startups", "gees-health")];
    await new Promise((r) => setImmediate(r));
    release(SUMMARY);
    const results = await Promise.all(calls);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.status === "ready")).toBe(true);
  });

  it("adds relevant public web results as context, keeps only the cited ones, and stores them with the summary", async () => {
    const generate = jest.fn(async () => ({ overview: SUMMARY.overview + " [W1]", highlights: ["Founded in 2026.", "Pre-Seed stage."] }));
    const { service, run, cache } = setup({ generate });
    const r = await service.get("startups", "gees-health");
    expect(run).toHaveBeenCalledWith(expect.stringContaining('"Gees Health"'), expect.objectContaining({ kind: "search" }));
    // only the result that names the organization is offered to the model
    expect((generate.mock.calls[0] as unknown[])[2]).toEqual([expect.objectContaining({ id: "W1", site: "news.example.com" })]);
    expect(r).toMatchObject({ status: "ready", webSources: [{ id: "W1", site: "news.example.com", url: "https://news.example.com/gees" }] });
    expect(cache.upsert).toHaveBeenCalledWith(expect.objectContaining({ webSources: [expect.objectContaining({ id: "W1" })] }), expect.anything());
  });

  it("does not store web sources the text never cites", async () => {
    const { service } = setup();
    expect(await service.get("startups", "gees-health")).toMatchObject({ status: "ready", webSources: [] });
  });

  it("still writes the summary from the profile when the web search fails or is empty", async () => {
    const failing = setup({ research: { enabled: true, run: jest.fn(async () => { throw new Error("serper down"); }) } });
    expect(await failing.service.get("startups", "gees-health")).toMatchObject({ status: "ready", webSources: [] });
    expect((failing.generate.mock.calls[0] as unknown[])[2]).toEqual([]);
    const empty = setup({ research: { enabled: true, run: jest.fn(async () => ({ items: [], knowledgeGraph: null, cached: false, failed: true, skipped: false })) } });
    expect(await empty.service.get("startups", "gees-health")).toMatchObject({ status: "ready" });
  });

  it("makes no web search when Serper is not configured or the feature is switched off", async () => {
    const noKey = setup({ research: { enabled: false, run: jest.fn() } });
    await noKey.service.get("startups", "gees-health");
    expect(noKey.run).not.toHaveBeenCalled();
    const off = setup({ env: { AI_SUMMARY_WEB_SEARCH: "false" } });
    await off.service.get("startups", "gees-health");
    expect(off.run).not.toHaveBeenCalled();
  });

  it("does not spend a web search when the profile is thin or the AI provider is missing", async () => {
    const thin = setup({ startup: { ...STARTUP, tagline: "—", desc: "—", problem: "—", solution: "—", hq: "—", employees: 0 } });
    await thin.service.get("startups", "gees-health");
    expect(thin.run).not.toHaveBeenCalled();
    const noAi = setup({ available: false });
    await noAi.service.get("startups", "gees-health");
    expect(noAi.run).not.toHaveBeenCalled();
  });

  it("answers 'unavailable' for thin profiles without calling the provider", async () => {
    const { service, generate } = setup({ startup: { ...STARTUP, tagline: "—", desc: "—", problem: "—", solution: "—", hq: "—", employees: 0 } });
    expect(await service.get("startups", "gees-health")).toMatchObject({ status: "unavailable", reason: "insufficient_data" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("answers 'unavailable' when no AI provider is configured (and invents nothing)", async () => {
    const { service, generate } = setup({ available: false });
    expect(await service.get("startups", "gees-health")).toMatchObject({ status: "unavailable", reason: "provider_not_configured" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("turns provider failures into a retryable 503 and caches nothing", async () => {
    const { service, cache } = setup({ generate: jest.fn(async () => { throw new ProviderFailureError("timeout"); }) });
    await expect(service.get("startups", "gees-health")).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(cache.upsert).not.toHaveBeenCalled();
  });

  it("shows the failure reason to admins only", async () => {
    const generate = jest.fn(async () => { throw new ProviderFailureError("Provider error 403", "gemini 403: API key not valid"); });
    const admin = setup({ generate });
    await expect(admin.service.get("startups", "gees-health", { admin: true })).rejects.toMatchObject({ response: { detail: "gemini 403: API key not valid" } });
    const member = setup({ generate });
    const err = await member.service.get("startups", "gees-health").catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify(err.getResponse())).not.toContain("API key");
  });

  it("maps a not-configured error raised mid-flight to 'unavailable'", async () => {
    const { service } = setup({ generate: jest.fn(async () => { throw new ProviderNotConfiguredError("no key"); }) });
    expect(await service.get("startups", "gees-health")).toMatchObject({ status: "unavailable", reason: "provider_not_configured" });
  });

  it("rejects an unknown entity type, a malformed id, and a missing organization", async () => {
    const { service } = setup({ startup: null });
    await expect(service.get("research", "x")).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.get("startups", "../etc/passwd")).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.get("startups", "no-such-company")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("enforces the hourly generation cap with a 429", async () => {
    const { service } = setup();
    (service as unknown as { maxPerHour: number }).maxPerHour = 1;
    await service.get("startups", "gees-health");
    const other = setup();
    (other.service as unknown as { maxPerHour: number }).maxPerHour = 1;
    (other.service as unknown as { generationTimes: number[] }).generationTimes.push(Date.now());
    await expect(other.service.get("startups", "gees-health")).rejects.toBeInstanceOf(HttpException);
    await expect(other.service.get("startups", "gees-health")).rejects.toMatchObject({ status: 429 });
  });
});
