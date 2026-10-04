import { StartupIdentityMatchingService } from "./startup-identity-matching.service";
import { IdentityMatchedBy, IdentityMatchStatus } from "../../common/enums";

function fakeRepo(seed: Record<string, any>[] = []) {
  const rows: Record<string, any>[] = [...seed];
  return {
    rows,
    find: jest.fn(async (opts?: any) => rows.filter((r) => matches(r, opts?.where))),
    findOne: jest.fn(async (opts: any) => rows.find((r) => matches(r, opts.where)) ?? null),
    create: jest.fn((x: any) => ({ id: `id-${rows.length + 1}`, ...x })),
    save: jest.fn(async (x: any) => { const i = rows.findIndex((r) => r.id === x.id); if (i >= 0) rows[i] = x; else rows.push(x); return x; }),
  };
}
function matches(row: any, where: any): boolean {
  if (!where) return true;
  const clauses = Array.isArray(where) ? where : [where];
  return clauses.some((w) => Object.entries(w).every(([k, v]) => row[k] === v));
}

const startups = [
  { id: "s1", name: "Example Health", website: "https://www.examplehealth.com/", country: "Saudi Arabia" },
  { id: "s2", name: "Other Startup", website: "otherstartup.com", country: "UAE" },
];

describe("StartupIdentityMatchingService.matchCandidate — waterfall", () => {
  let startupsRepo: ReturnType<typeof fakeRepo>;
  let identitiesRepo: ReturnType<typeof fakeRepo>;
  let svc: StartupIdentityMatchingService;

  beforeEach(() => {
    startupsRepo = fakeRepo(startups);
    identitiesRepo = fakeRepo();
    svc = new StartupIdentityMatchingService(startupsRepo as any, identitiesRepo as any);
  });

  it("tier 1: matches on an already-confirmed external ID", async () => {
    identitiesRepo.rows.push({ id: "i1", sourceName: "MAGNiTT", externalId: "8841", startupId: "s1", companyNameAtSource: "Example Health" });
    const result = await svc.matchCandidate({ startupName: "Anything Else", externalId: "8841", sourceName: "MAGNiTT" });
    expect(result.matchStatus).toBe(IdentityMatchStatus.MATCHED);
    expect(result.matchedBy).toBe(IdentityMatchedBy.EXTERNAL_ID);
    expect(result.startupId).toBe("s1");
  });

  it("tier 2: matches on exact normalized domain", async () => {
    const result = await svc.matchCandidate({ startupName: "Some Other Name", startupDomain: "examplehealth.com", sourceName: "Research" });
    expect(result.matchStatus).toBe(IdentityMatchStatus.MATCHED);
    expect(result.matchedBy).toBe(IdentityMatchedBy.DOMAIN);
    expect(result.startupId).toBe("s1");
  });

  it("tier 3: matches on a verified alias", async () => {
    identitiesRepo.rows.push({ id: "i2", sourceName: "Crunchbase", companyNameAtSource: "ExampleHealth Technologies", startupId: "s1", verified: true });
    const result = await svc.matchCandidate({ startupName: "ExampleHealth Technologies", sourceName: "Crunchbase" });
    expect(result.matchStatus).toBe(IdentityMatchStatus.MATCHED);
    expect(result.matchedBy).toBe(IdentityMatchedBy.ALIAS);
  });

  it("tier 4: matches on normalized name + country", async () => {
    const result = await svc.matchCandidate({ startupName: "Example Health Inc.", country: "Saudi Arabia", sourceName: "Research" });
    expect(result.matchStatus).toBe(IdentityMatchStatus.MATCHED);
    expect(result.matchedBy).toBe(IdentityMatchedBy.NORMALIZED_NAME);
  });

  it("tier 5: a close-but-not-exact name is suggested for review, never auto-applied", async () => {
    const result = await svc.matchCandidate({ startupName: "ExampleHealth", sourceName: "Research" });
    expect(result.matchStatus).toBe(IdentityMatchStatus.REVIEW_REQUIRED);
    expect(result.matchedBy).toBe(IdentityMatchedBy.FUZZY_REVIEW);
    // startupId here is a SUGGESTION for the review UI to display, not a
    // confirmed match — resolveAndPersist() must never actually assign it
    // while status is REVIEW_REQUIRED (checked below).
    expect(result.startupId).toBe("s1");
  });

  it("a fuzzy-tier suggestion is never persisted as an actual startupId assignment", async () => {
    const persisted = await svc.resolveAndPersist({ startupName: "ExampleHealth", sourceName: "Research" });
    expect(persisted.matchStatus).toBe(IdentityMatchStatus.REVIEW_REQUIRED);
    expect(persisted.startupId).toBeUndefined();
  });

  it("a completely unrelated name is UNMATCHED, never force-matched", async () => {
    const result = await svc.matchCandidate({ startupName: "Nothing Like Either Company", sourceName: "Research" });
    expect(result.matchStatus).toBe(IdentityMatchStatus.UNMATCHED);
  });

  it("never auto-merges two different startups that happen to share a normalized name", async () => {
    startupsRepo.rows.push({ id: "s3", name: "Example Health", website: "different-domain.com", country: "Egypt" });
    const result = await svc.matchCandidate({ startupName: "Example Health", sourceName: "Research" });
    expect(result.matchStatus).toBe(IdentityMatchStatus.POSSIBLE_DUPLICATE);
    expect(result.startupId).toBeUndefined();
  });
});

describe("StartupIdentityMatchingService.confirmMatch / rejectMatch", () => {
  it("confirmMatch sets startupId, marks verified, and matchedBy MANUAL", async () => {
    const startupsRepo = fakeRepo(startups);
    const identitiesRepo = fakeRepo([{ id: "i1", sourceName: "MAGNiTT", companyNameAtSource: "ExampleHealth", matchStatus: IdentityMatchStatus.REVIEW_REQUIRED }]);
    const svc = new StartupIdentityMatchingService(startupsRepo as any, identitiesRepo as any);

    const result = await svc.confirmMatch("i1", "s1", "admin-1");
    expect(result.startupId).toBe("s1");
    expect(result.matchStatus).toBe(IdentityMatchStatus.MATCHED);
    expect(result.verified).toBe(true);
  });

  it("rejectMatch clears startupId and marks UNMATCHED", async () => {
    const startupsRepo = fakeRepo(startups);
    const identitiesRepo = fakeRepo([{ id: "i1", sourceName: "MAGNiTT", companyNameAtSource: "ExampleHealth", startupId: "s1", matchStatus: IdentityMatchStatus.MATCHED }]);
    const svc = new StartupIdentityMatchingService(startupsRepo as any, identitiesRepo as any);

    const result = await svc.rejectMatch("i1");
    expect(result.startupId).toBeUndefined();
    expect(result.matchStatus).toBe(IdentityMatchStatus.UNMATCHED);
  });
});

describe("StartupIdentityMatchingService.correctStartupCategory — side-effect-free maintenance", () => {
  function setup() {
    const rows: any[] = [{ id: "s1", name: "THAKAA MED", category: "Healthcare AI", website: "", country: "Saudi Arabia" }];
    const startupsRepo: any = {
      findOne: jest.fn(async (o: any) => rows.find((r) => r.id === o.where.id) ?? null),
      update: jest.fn(async (where: any, patch: any) => { Object.assign(rows.find((r) => r.id === where.id), patch); }),
      save: jest.fn(), create: jest.fn(), find: jest.fn(),
    };
    // The service is constructed with ONLY the startups and identities repositories: it has no handle on
    // scoring, ML snapshots or startup update hooks, so none of them can be triggered by this path.
    const svc = new StartupIdentityMatchingService(startupsRepo, {} as any);
    return { rows, startupsRepo, svc };
  }

  it("changes only the category via a single-column update and never calls save()", async () => {
    const { rows, startupsRepo, svc } = setup();
    const out = await svc.correctStartupCategory("s1", "AI Healthcare", "Healthcare AI is not a supported category");
    expect(startupsRepo.update).toHaveBeenCalledTimes(1);
    expect(startupsRepo.update).toHaveBeenCalledWith({ id: "s1" }, { category: "AI Healthcare" });
    expect(startupsRepo.save).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ category: "AI Healthcare", name: "THAKAA MED", website: "", country: "Saudi Arabia" });
    expect(out.category).toBe("AI Healthcare");
  });

  it("rejects a category outside the supported list and an unknown startup, writing nothing", async () => {
    const { startupsRepo, svc } = setup();
    await expect(svc.correctStartupCategory("s1", "Healthcare AI", "should be rejected as unsupported")).rejects.toThrow(/not a supported/);
    await expect(svc.correctStartupCategory("nope", "AI Healthcare", "unknown startup should fail")).rejects.toThrow(/Unknown startup/);
    expect(startupsRepo.update).not.toHaveBeenCalled();
  });

  it("is a no-op when the category is already correct", async () => {
    const { startupsRepo, svc } = setup();
    await svc.correctStartupCategory("s1", "AI Healthcare", "first correction applies it");
    startupsRepo.update.mockClear();
    await svc.correctStartupCategory("s1", "AI Healthcare", "second call changes nothing");
    expect(startupsRepo.update).not.toHaveBeenCalled();
  });
});
