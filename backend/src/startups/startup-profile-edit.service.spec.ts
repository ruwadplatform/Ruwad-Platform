import { BadRequestException } from "@nestjs/common";
import { StartupProfileEditService } from "./startup-profile-edit.service";
import { ScoreTrigger, ScoringBasis } from "../common/enums";

/** The edit service talks to a transaction manager and a few collaborators; each is faked here so the rules it owns can be checked in isolation:
 * what it validates, what it writes, and what it hands to the scoring pipeline. */
function build(opts: { storedFeatures?: Record<string, unknown>; storedAfter?: Record<string, unknown>; scoringBasis?: ScoringBasis } = {}) {
  const startup = { id: "s1", name: "Acme", category: "Digital Health", scoringBasis: opts.scoringBasis ?? ScoringBasis.STANDARD };
  const updates: Record<string, unknown>[] = [];
  const saved: { entity: unknown; rows: unknown }[] = [];
  const deleted: unknown[] = [];
  const manager = {
    getRepository: () => ({ update: async (_id: string, patch: Record<string, unknown>) => { updates.push(patch); }, findOne: async () => null, create: (x: unknown) => x, save: async (x: unknown) => x }),
    delete: async (entity: unknown, where: unknown) => { deleted.push([entity, where]); },
    find: async () => [],
    findOne: async () => null,
    create: (_entity: unknown, row: unknown) => row,
    save: async (entity: unknown, rows: unknown) => { saved.push({ entity, rows }); return rows; },
  };
  const dataSource = { transaction: async (fn: (m: unknown) => Promise<void>) => fn(manager), manager };
  const startups = { findOneOrFail: async () => startup };
  const getFeatures = jest.fn()
    .mockResolvedValueOnce({ features: opts.storedFeatures ?? {} })
    .mockResolvedValue({ features: opts.storedAfter ?? opts.storedFeatures ?? {} });
  const assessStartup = jest.fn().mockResolvedValue({});
  const scoring = { getFeatures, assessStartup };
  const outcomeEvents = { createSystemEventIfNew: jest.fn().mockResolvedValue(null) };
  const activity = { log: jest.fn().mockResolvedValue(undefined) };
  const svc = new StartupProfileEditService(dataSource as never, startups as never, {} as never, scoring as never, outcomeEvents as never, activity as never);
  return { svc, updates, saved, deleted, assessStartup, outcomeEvents, activity };
}

const core = { name: "Acme", category: "Digital Health", tagline: "We help", country: "Saudi Arabia", city: "Riyadh", stage: "Seed" };

describe("StartupProfileEditService.applyEdit", () => {
  it("refuses an edit that blanks a core identity field", async () => {
    const t = build();
    await expect(t.svc.applyEdit("s1", "u1", { ...core, tagline: "  " })).rejects.toBeInstanceOf(BadRequestException);
    expect(t.updates).toHaveLength(0);
    expect(t.assessStartup).not.toHaveBeenCalled();
  });

  it("accepts a partial profile: everything beyond the core fields may stay empty", async () => {
    const t = build();
    await expect(t.svc.applyEdit("s1", "u1", { ...core })).resolves.toEqual({ lockedFields: [] });
  });

  it("rejects an incomplete team member and an out-of-range year", async () => {
    const t = build();
    await expect(t.svc.applyEdit("s1", "u1", { ...core, founders: [{ name: "Sara", title: "" }] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.svc.applyEdit("s1", "u1", { ...core, founded: 1850 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("writes the edit in place and moves an older startup onto the score-what-was-provided basis", async () => {
    const t = build({ scoringBasis: ScoringBasis.STANDARD });
    await t.svc.applyEdit("s1", "u1", { ...core, tagline: "A new tagline", employees: 12, formerName: "" });
    expect(t.updates[0]).toMatchObject({ tagline: "A new tagline", employees: 12, formerName: "—", scoringBasis: ScoringBasis.EXISTING_DATA });
    expect(t.updates[0]).not.toHaveProperty("slug"); // links to the profile never change
    expect(t.activity.log).toHaveBeenCalled();
  });

  it("rescores after every edit and sends only the scoring inputs that changed", async () => {
    const t = build({ storedFeatures: { annualRevenue: 100, customerCount: 5 } });
    await t.svc.applyEdit("s1", "u1", { ...core, annualRevenue: 100, customerCount: 9, cashAvailable: 50 });
    expect(t.assessStartup).toHaveBeenCalledTimes(1);
    const [id, input] = t.assessStartup.mock.calls[0];
    expect(id).toBe("s1");
    expect(input.trigger).toBe(ScoreTrigger.STARTUP_UPDATED);
    expect(input.founderPatch).toEqual({ customerCount: 9, cashAvailable: 50 }); // annualRevenue was unchanged, so it is not re-labelled as founder reported
  });

  it("clearing a number leaves the stored value alone instead of writing zero", async () => {
    const t = build({ storedFeatures: { annualRevenue: 100 } });
    await t.svc.applyEdit("s1", "u1", { ...core, annualRevenue: "" });
    expect(t.assessStartup.mock.calls[0][1].founderPatch).toEqual({});
  });

  it("reports a changed input that a verified value still outranks", async () => {
    const t = build({ storedFeatures: { annualRevenue: 100 }, storedAfter: { annualRevenue: 100 } });
    const result = await t.svc.applyEdit("s1", "u1", { ...core, annualRevenue: 250 });
    expect(result.lockedFields).toEqual(["annualRevenue"]);
  });

  it("derived inputs cannot be set through an edit", async () => {
    const t = build();
    await t.svc.applyEdit("s1", "u1", { ...core, teamSize: 99, fundingRounds: 7, investorCount: 3, ruwadScore: 10 });
    expect(t.assessStartup.mock.calls[0][1].founderPatch).toEqual({});
    expect(t.updates[0]).not.toHaveProperty("ruwadScore");
  });

  it("a funding round becomes outcome evidence, deduplicated by the service", async () => {
    const t = build();
    await t.svc.applyEdit("s1", "u1", { ...core, rounds: [{ round: "Seed", date: "2026-03", amount: 2000000, lead: "Fund" }] });
    expect(t.outcomeEvents.createSystemEventIfNew).toHaveBeenCalledWith("s1", expect.objectContaining({ eventDate: "2026-03-01", valueNumeric: 2000000 }));
  });

  it("a failed rescore never undoes the saved edit", async () => {
    const t = build();
    t.assessStartup.mockRejectedValueOnce(new Error("boom"));
    await expect(t.svc.applyEdit("s1", "u1", { ...core })).resolves.toEqual({ lockedFields: [] });
    expect(t.updates).toHaveLength(1);
  });
});
