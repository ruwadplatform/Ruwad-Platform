import { MlSnapshotSource, ScoreDataSource, ScoreStatus } from "../common/enums";
import { MlSnapshotService } from "./ml-snapshot.service";
import { ML_FEATURE_SCHEMA_VERSION } from "./ml-data.constants";
import type { ScoreResult } from "../scoring/scoring.types";

function fakeRepo(seed: Record<string, any>[] = []) {
  const rows: Record<string, any>[] = [...seed];
  return {
    rows,
    find: jest.fn(async (opts?: any) => rows.filter((r) => matches(r, opts?.where))),
    findOne: jest.fn(async (opts: any) => {
      let out = rows.filter((r) => matches(r, opts.where));
      if (opts?.order?.snapshotAt === "DESC") out = [...out].sort((a, b) => b.snapshotAt - a.snapshotAt);
      return out[0] ?? null;
    }),
    create: jest.fn((x: any) => ({ id: `id-${rows.length + 1}`, ...x })),
    save: jest.fn(async (x: any) => { const i = rows.findIndex((r) => r.id === x.id); if (i >= 0) rows[i] = x; else rows.push(x); return x; }),
  };
}
function matches(row: any, where: any): boolean {
  if (!where) return true;
  const clauses = Array.isArray(where) ? where : [where];
  return clauses.some((w) => Object.entries(w).every(([k, v]) => row[k] === v));
}

const startup = { id: "s1", stage: "Seed", category: "Digital Health", scoreVersion: "RUWAD-2.0" } as any;
const result = (over: Partial<ScoreResult> = {}): ScoreResult => ({
  status: ScoreStatus.CALCULATED, ruwadScore: 7, confidenceScore: 0.8, version: "RUWAD-2.0", calculatedAt: new Date().toISOString(),
  factors: {} as any, missingFactors: [], ...over,
});

describe("MlSnapshotService.maybeSnapshot", () => {
  let snapshots: ReturnType<typeof fakeRepo>;
  let svc: MlSnapshotService;

  beforeEach(() => {
    snapshots = fakeRepo();
    svc = new MlSnapshotService(snapshots as any, fakeRepo() as any, fakeRepo() as any, fakeRepo() as any);
  });

  it("creates the first snapshot for a startup with no prior one", async () => {
    const row = await svc.maybeSnapshot(startup, { teamSize: 5 }, {}, result());
    expect(row).not.toBeNull();
    expect(snapshots.rows).toHaveLength(1);
    expect(snapshots.rows[0].snapshotSource).toBe(MlSnapshotSource.MATERIAL_CHANGE);
    expect(snapshots.rows[0].featureSchemaVersion).toBe(ML_FEATURE_SCHEMA_VERSION);
  });

  it("creates a new snapshot when a scoring feature value materially changes", async () => {
    await svc.maybeSnapshot(startup, { teamSize: 5 }, {}, result());
    const row = await svc.maybeSnapshot(startup, { teamSize: 8 }, {}, result());
    expect(row).not.toBeNull();
    expect(snapshots.rows).toHaveLength(2);
    expect(row!.reason).toContain("teamSize");
  });

  it("does NOT create a new snapshot when nothing in ScoringFeatures changed (identical repeat write)", async () => {
    await svc.maybeSnapshot(startup, { teamSize: 5, annualRevenue: 1_000_000 }, {}, result());
    const row = await svc.maybeSnapshot(startup, { teamSize: 5, annualRevenue: 1_000_000 }, {}, result());
    expect(row).toBeNull();
    expect(snapshots.rows).toHaveLength(1);
  });

  it("creates a new snapshot when a feature's verified flag changes even if the value didn't", async () => {
    await svc.maybeSnapshot(startup, { teamSize: 5 }, { teamSize: { source: ScoreDataSource.FOUNDER_SUBMITTED, verified: false } }, result());
    const row = await svc.maybeSnapshot(startup, { teamSize: 5 }, { teamSize: { source: ScoreDataSource.VERIFIED_DOCUMENT, verified: true } }, result());
    expect(row).not.toBeNull();
    expect(row!.reason).toContain("verification changed");
  });

  it("never mutates an earlier snapshot's frozen features when a later write changes them", async () => {
    const first = await svc.maybeSnapshot(startup, { teamSize: 5 }, {}, result());
    await svc.maybeSnapshot(startup, { teamSize: 99 }, {}, result());
    expect(first!.features.teamSize).toBe(5); // the object reference this test holds is untouched
    expect(snapshots.rows.find((r) => r.id === first!.id)!.features.teamSize).toBe(5); // and so is what's stored
  });
});

describe("MlSnapshotService.forceSnapshotForStartup / backfillAll", () => {
  it("forceSnapshotForStartup bypasses materiality and always creates a row, tagged ADMIN_MANUAL", async () => {
    const snapshots = fakeRepo();
    const startups = fakeRepo([startup]);
    const features = fakeRepo([{ startupId: "s1", features: { teamSize: 5 }, provenance: {} }]);
    const history = fakeRepo();
    const svc = new MlSnapshotService(snapshots as any, startups as any, features as any, history as any);

    await svc.forceSnapshotForStartup("s1");
    await svc.forceSnapshotForStartup("s1"); // identical state, still forces a second row
    expect(snapshots.rows).toHaveLength(2);
    expect(snapshots.rows[0].snapshotSource).toBe(MlSnapshotSource.ADMIN_MANUAL);
  });

  it("backfillAll never overwrites a startup that already has a snapshot", async () => {
    const snapshots = fakeRepo([{ id: "existing", startupId: "s1", features: {} }]);
    const startups = fakeRepo([startup]);
    const features = fakeRepo([{ startupId: "s1", features: { teamSize: 5 }, provenance: {} }]);
    const history = fakeRepo();
    const svc = new MlSnapshotService(snapshots as any, startups as any, features as any, history as any);

    const out = await svc.backfillAll();
    expect(out).toEqual([{ startupId: "s1", name: undefined, created: false }]);
    expect(snapshots.rows).toHaveLength(1);
  });

  it("backfillAll skips a startup with no scoring features at all — nothing meaningful to snapshot", async () => {
    const snapshots = fakeRepo();
    const startups = fakeRepo([{ ...startup, id: "s2", name: "Empty Co" }]);
    const features = fakeRepo(); // no row for s2
    const history = fakeRepo();
    const svc = new MlSnapshotService(snapshots as any, startups as any, features as any, history as any);

    const out = await svc.backfillAll();
    expect(out).toEqual([{ startupId: "s2", name: "Empty Co", created: false }]);
    expect(snapshots.rows).toHaveLength(0);
  });

  it("backfillAll tags a real backfilled row BACKFILLED_CURRENT_STATE", async () => {
    const snapshots = fakeRepo();
    const startups = fakeRepo([{ ...startup, id: "s3", name: "Real Co" }]);
    const features = fakeRepo([{ startupId: "s3", features: { teamSize: 5 }, provenance: {} }]);
    const history = fakeRepo();
    const svc = new MlSnapshotService(snapshots as any, startups as any, features as any, history as any);

    const out = await svc.backfillAll();
    expect(out).toEqual([{ startupId: "s3", name: "Real Co", created: true }]);
    expect(snapshots.rows).toHaveLength(1);
    expect(snapshots.rows[0].snapshotSource).toBe(MlSnapshotSource.BACKFILLED_CURRENT_STATE);
  });
});
