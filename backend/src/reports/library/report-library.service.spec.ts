import { ConflictException } from "@nestjs/common";
import { LIBRARY_DEFINITIONS } from "./library-definitions";
import { LIBRARY_FACTS } from "./library-facts";
import type { LibraryRaw } from "./library-stats.service";
import { incompleteReasons, ReportLibraryService } from "./report-library.service";
import { WORLD_BANK_BY_ID } from "./library-world-bank";
import type { WorldBankPoint } from "./library-types";

jest.mock("./library-verify", () => ({ ...jest.requireActual("./library-verify"), verifyFacts: jest.fn() }));
jest.mock("./library-world-bank", () => ({ ...jest.requireActual("./library-world-bank"), fetchWorldBank: jest.fn() }));
import { verifyFacts } from "./library-verify";
import { fetchWorldBank } from "./library-world-bank";

const raw = (categories: string[] | null): LibraryRaw => ({
  asOf: "2026-09-25T00:00:00.000Z", categories, startupsTotal: 9, startups: 9, funded: 5, fundraising: 2, fundingSarM: 120.5, medianFundingSarM: 12, rounds: 7,
  investorsTotal: 8, investorsInGroup: 8, investorsWithGroupDeals: 3, investorHealthDeals: 40, hubs: 7, researchInstitutions: 7, researchers: 1500, researchCenters: 20, researchLabs: 30, patents: 12,
  multinationals: 12, mncSaudiOffice: 10, mncManufacturing: 4, mncResearch: 3, mncRegionalHq: 2,
  stages: [{ l: "Seed", v: 5 }], cities: [{ l: "Riyadh", v: 6 }], investorTypes: [{ l: "VC", v: 5 }], hubTypes: [{ l: "Accelerator", v: 4 }], hubCities: [{ l: "Riyadh", v: 4 }],
  researchTypes: [{ l: "University", v: 5 }], researchCities: [{ l: "Riyadh", v: 3 }], mncCategories: [{ l: "MedTech", v: 6 }],
});
const wb = (id: string): WorldBankPoint => {
  const i = WORLD_BANK_BY_ID.get(id)!;
  return { id, code: i.code, label: i.label, unit: i.unit, value: 3.4, display: "3.4", year: 2023, geography: "Saudi Arabia", organization: "World Bank", url: `https://data.worldbank.org/indicator/${i.code}?locations=SA`, retrievedAt: "" };
};
const verified = () => LIBRARY_FACTS.map((f) => ({ ...f, verification: "live" as const, checkedAt: "2026-09-25T00:00:00Z" }));

function setup(over: { failStatsFor?: string } = {}) {
  const rows: Record<string, unknown>[] = [];
  const repo = {
    find: jest.fn(async () => rows),
    findOne: jest.fn(async ({ where }: { where: { slug: string } }) => rows.find((r) => r.slug === where.slug) ?? null),
    create: jest.fn((x: Record<string, unknown>) => ({ ...x })),
    save: jest.fn(async (x: Record<string, unknown>) => { if (!rows.includes(x)) rows.push(x); return x; }),
  };
  const stats = { build: jest.fn(async (categories: string[] | null) => {
    if (over.failStatsFor && categories?.includes(over.failStatsFor)) throw new Error("db down");
    return { raw: raw(categories), stats: { coverage: { startups: 9, investors: 8, asOf: "" }, metrics: [], distributions: [], companies: [], investors: [], subject: null } };
  }) };
  const session = { run: jest.fn(async () => ({ items: [], cached: false, failed: false, skipped: false })), log: [] as unknown[], serperCalls: 0, cacheHits: 0 };
  const research = { enabled: true, session: jest.fn(() => session) };
  const reportStats = { officialHosts: jest.fn(async () => new Set<string>()) };
  const svc = new ReportLibraryService(repo as never, stats as never, reportStats as never, research as never);
  return { svc, rows, repo, session, research };
}

beforeEach(() => {
  (verifyFacts as jest.Mock).mockReset().mockImplementation(async (facts: { id: string }[]) => ({ facts: verified().filter((f) => facts.some((x) => x.id === f.id)), dropped: [] }));
  (fetchWorldBank as jest.Mock).mockReset().mockImplementation(async (ids: string[]) => ({ points: ids.map(wb), failed: [] }));
});

describe("ReportLibraryService", () => {
  it("creates all six reports as published RUWĀD reports, and updating again never duplicates them", async () => {
    const { svc, rows } = setup();
    const first = await svc.generate({ publish: true });
    expect(first.reports.map((r) => r.action)).toEqual(Array(6).fill("created"));
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.origin === "RUWAD" && r.isPublished === true && r.reportKind === null)).toBe(true);
    expect(new Set(rows.map((r) => r.slug))).toEqual(new Set(LIBRARY_DEFINITIONS.map((d) => d.slug)));

    const second = await svc.generate({ publish: true });
    expect(second.reports.map((r) => r.action)).toEqual(Array(6).fill("updated"));
    expect(rows).toHaveLength(6);
  });

  it("publish:true makes an unpublished library report public; leaving publish out keeps its visibility", async () => {
    const { svc, rows } = setup();
    await svc.generate({ publish: false });
    expect(rows.every((r) => r.isPublished === false)).toBe(true);
    await svc.generate({});
    expect(rows.every((r) => r.isPublished === false)).toBe(true);
    await svc.generate({ publish: true });
    expect(rows.every((r) => r.isPublished === true)).toBe(true);
  });

  it("never saves or publishes a report whose sources could not be verified, and leaves an existing one untouched", async () => {
    const { svc, rows } = setup();
    await svc.generate({ publish: true });
    const before = JSON.stringify(rows);
    (verifyFacts as jest.Mock).mockResolvedValue({ facts: [], dropped: LIBRARY_FACTS.map((f) => ({ id: f.id, reason: "quote no longer found on the source page" })) });
    const r = await svc.generate({ publish: true });
    expect(r.reports.every((x) => x.action === "skipped" && x.reasons.length > 0)).toBe(true);
    expect(JSON.stringify(rows)).toBe(before);

    const fresh = setup();
    await fresh.svc.generate({ publish: true });
    expect(fresh.rows).toHaveLength(0);
  });

  it("a report that fails does not stop or publish the others", async () => {
    const { svc, rows } = setup({ failStatsFor: "Biotechnology" });
    const r = await svc.generate({ publish: true });
    expect(r.reports.find((x) => x.slug === "saudi-biotechnology-landscape-2026")).toMatchObject({ action: "failed", isPublished: false });
    expect(r.reports.filter((x) => x.action === "created")).toHaveLength(5);
    expect(rows).toHaveLength(5);
  });

  it("a dry run saves nothing", async () => {
    const { svc, rows } = setup();
    const r = await svc.generate({ dryRun: true, publish: true });
    expect(r.reports.every((x) => x.action === "preview")).toBe(true);
    expect(rows).toHaveLength(0);
  });

  it("uses the shared research session only when generating, and skipResearch avoids it entirely", async () => {
    const skipped = setup();
    await skipped.svc.generate({ skipResearch: true });
    expect(skipped.session.run).not.toHaveBeenCalled();

    const normal = setup();
    await normal.svc.generate({ slugs: ["saudi-digital-health-landscape-2026"] });
    expect(normal.session.run).toHaveBeenCalledTimes(4);
    expect(normal.research.session).toHaveBeenCalledTimes(1);
  });

  it("only builds the requested reports", async () => {
    const { svc, rows } = setup();
    const r = await svc.generate({ slugs: ["saudi-medtech-landscape-2026"], publish: true });
    expect(r.reports).toHaveLength(1);
    expect(rows).toHaveLength(1);
  });

  it("refuses to run twice at once", async () => {
    const { svc } = setup();
    const a = svc.generate({ publish: true });
    await expect(svc.generate({ publish: true })).rejects.toBeInstanceOf(ConflictException);
    await a;
    await expect(svc.generate({ dryRun: true })).resolves.toBeDefined();
  });

  it("reports status for all six reports, including whether a generation is running", async () => {
    const { svc } = setup();
    const idle = await svc.status();
    expect(idle).toHaveLength(6);
    expect(idle.every((r) => r.running === false)).toBe(true);
    const run = svc.generate({ publish: true });
    expect((await svc.status()).every((r) => r.running === true)).toBe(true);
    await run;
    expect((await svc.status()).every((r) => r.running === false)).toBe(true);
  });
});

describe("incompleteReasons", () => {
  it("accepts a complete report and explains every way one can be incomplete", () => {
    expect(incompleteReasons({ sections: 5, factsUsed: 8, factsPlanned: 8, warnings: 0 })).toEqual([]);
    expect(incompleteReasons({ sections: 3, factsUsed: 8, factsPlanned: 8, warnings: 0 })).toHaveLength(1);
    expect(incompleteReasons({ sections: 5, factsUsed: 2, factsPlanned: 8, warnings: 0 })).toHaveLength(1);
    expect(incompleteReasons({ sections: 5, factsUsed: 8, factsPlanned: 8, warnings: 1 })).toHaveLength(1);
    expect(incompleteReasons({ sections: 1, factsUsed: 0, factsPlanned: 8, warnings: 1 })).toHaveLength(3);
  });
});
