import { AiSummaryGenerator, ProviderFailureError, ProviderNotConfiguredError } from "./ai-summary-generator";

const cfg = (env: Record<string, string>) => ({ get: (k: string) => env[k] }) as never;

const overview = "Gees Health is a Riyadh-based diagnostics company founded in 2026 that develops at-home saliva hormone testing for women. Its approach pairs a collection kit with an app that analyses results and tracks patterns over time. The company is at the Pre-Seed stage, employs 3 people and sells through a kit-plus-subscription model, with a stated focus on continuous insight into cycle and stress.";
const reply = JSON.stringify({ overview, highlights: ["Founded in 2026 in Riyadh.", "Pre-Seed stage with 3 employees."] });
const facts = { name: "Gees Health", foundedYear: 2026, employees: 3, developmentStage: "Pre-Seed" };

const geminiResponse = (text: string, ok = true, status = 200) =>
  ({ ok, status, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) }) as unknown as Response;

describe("provider selection", () => {
  it("uses Anthropic when only its key is set, Gemini when only Gemini's is", () => {
    expect(new AiSummaryGenerator(cfg({ ANTHROPIC_API_KEY: "a" })).provider).toBe("anthropic");
    expect(new AiSummaryGenerator(cfg({ GEMINI_API_KEY: "g" })).provider).toBe("gemini");
    expect(new AiSummaryGenerator(cfg({ GOOGLE_API_KEY: "g" })).provider).toBe("gemini");
  });
  it("prefers Anthropic when both exist, unless AI_SUMMARY_PROVIDER says otherwise", () => {
    expect(new AiSummaryGenerator(cfg({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" })).provider).toBe("anthropic");
    expect(new AiSummaryGenerator(cfg({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g", AI_SUMMARY_PROVIDER: "gemini" })).provider).toBe("gemini");
  });
  it("is unavailable with no key, or when the chosen provider has no key", () => {
    expect(new AiSummaryGenerator(cfg({})).available).toBe(false);
    expect(new AiSummaryGenerator(cfg({ ANTHROPIC_API_KEY: "a", AI_SUMMARY_PROVIDER: "gemini" })).available).toBe(false);
  });
  it("defaults to a different model per provider and honours AI_SUMMARY_MODEL", () => {
    expect(new AiSummaryGenerator(cfg({ GEMINI_API_KEY: "g" })).model).toMatch(/^gemini/);
    expect(new AiSummaryGenerator(cfg({ ANTHROPIC_API_KEY: "a" })).model).toMatch(/^claude/);
    expect(new AiSummaryGenerator(cfg({ GEMINI_API_KEY: "g", AI_SUMMARY_MODEL: "gemini-custom" })).model).toBe("gemini-custom");
  });
});

describe("Gemini calls", () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it("sends the key only in a header, asks for JSON, and returns the validated summary", async () => {
    const fetchMock = jest.fn(async () => geminiResponse(reply));
    global.fetch = fetchMock as never;
    const out = await new AiSummaryGenerator(cfg({ GEMINI_API_KEY: "secret-key" })).generate("startups", facts);
    expect(out.highlights).toHaveLength(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toContain("/v1beta/models/gemini-3.8-flash:generateContent");
    expect(url).not.toContain("secret-key");
    expect(init.headers["x-goog-api-key"]).toBe("secret-key");
    const body = JSON.parse(init.body);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.thinkingConfig).toBeUndefined(); // newer models get no thinking override
    expect(body.contents[0].parts[0].text).toContain("<data>");
    expect(body.systemInstruction.parts[0].text).toContain("Never invent");
  });

  it("sends the thinking override only to the 2.5 family, and retries without it if rejected", async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(geminiResponse("", false, 400)).mockResolvedValueOnce(geminiResponse(reply));
    global.fetch = fetchMock as never;
    await new AiSummaryGenerator(cfg({ GEMINI_API_KEY: "k", AI_SUMMARY_MODEL: "gemini-2.5-flash" })).generate("startups", facts);
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c as unknown as [string, { body: string }])[1].body));
    expect(bodies[0].generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(bodies[1].generationConfig.thinkingConfig).toBeUndefined();
  });

  it("retries once when the first reply breaks a rule, then succeeds", async () => {
    const bad = JSON.stringify({ overview: overview.replace("employs 3", "employs 40"), highlights: ["Founded in 2026.", "Pre-Seed stage."] });
    const fetchMock = jest.fn().mockResolvedValueOnce(geminiResponse(bad)).mockResolvedValueOnce(geminiResponse(reply));
    global.fetch = fetchMock as never;
    await new AiSummaryGenerator(cfg({ GEMINI_API_KEY: "k" })).generate("startups", facts);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse((fetchMock.mock.calls[1] as unknown as [string, { body: string }])[1].body).contents[0].parts[0].text).toContain("previous answer was rejected");
  });

  it("turns HTTP errors and network failures into ProviderFailureError", async () => {
    global.fetch = jest.fn(async () => geminiResponse("", false, 429)) as never;
    await expect(new AiSummaryGenerator(cfg({ GEMINI_API_KEY: "k" })).generate("startups", facts)).rejects.toBeInstanceOf(ProviderFailureError);
    global.fetch = jest.fn(async () => { throw new Error("socket hang up"); }) as never;
    await expect(new AiSummaryGenerator(cfg({ GEMINI_API_KEY: "k" })).generate("startups", facts)).rejects.toBeInstanceOf(ProviderFailureError);
  });

  it("explains an HTTP failure in a secret-free detail (status + Google's message)", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: { message: "API key not valid AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123 for this project" } }) }) as unknown as Response) as never;
    const err = await new AiSummaryGenerator(cfg({ GEMINI_API_KEY: "k" })).generate("startups", facts).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderFailureError);
    expect(err.detail).toContain("gemini 403");
    expect(err.detail).toContain("API key not valid");
    expect(err.detail).not.toContain("AIza");
  });

  it("reports which rule the text broke when validation fails twice", async () => {
    global.fetch = jest.fn(async () => geminiResponse("not json at all")) as never;
    const err = await new AiSummaryGenerator(cfg({ GEMINI_API_KEY: "k" })).generate("startups", facts).catch((e) => e);
    expect(err.detail).toMatch(/gemini output rejected twice/);
  });

  it("gives up with ProviderFailureError when the model keeps breaking the rules", async () => {
    global.fetch = jest.fn(async () => geminiResponse("not json at all")) as never;
    await expect(new AiSummaryGenerator(cfg({ GEMINI_API_KEY: "k" })).generate("startups", facts)).rejects.toBeInstanceOf(ProviderFailureError);
  });

  it("refuses to run with no provider configured", async () => {
    await expect(new AiSummaryGenerator(cfg({})).generate("startups", facts)).rejects.toBeInstanceOf(ProviderNotConfiguredError);
  });
});
