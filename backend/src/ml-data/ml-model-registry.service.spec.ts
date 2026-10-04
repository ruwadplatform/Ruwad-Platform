import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { MlModelStatus } from "../common/enums";
import { MlModelRegistryService } from "./ml-model-registry.service";
import type { RegisterMlModelDto } from "./dto/register-ml-model.dto";

function fakeRepo(seed: Record<string, any>[] = []) {
  const rows: Record<string, any>[] = [...seed];
  return {
    rows,
    find: jest.fn(async (opts?: any) => rows.filter((r) => matches(r, opts?.where))),
    findOne: jest.fn(async (opts: any) => rows.find((r) => matches(r, opts.where)) ?? null),
    create: jest.fn((x: any) => ({ id: `id-${rows.length + 1}`, ...x })),
    save: jest.fn(async (x: any) => {
      const i = rows.findIndex((r) => r.id === x.id);
      if (i >= 0) rows[i] = x;
      else rows.push(x);
      return x;
    }),
  };
}
function matches(row: any, where: any): boolean {
  if (!where) return true;
  const clauses = Array.isArray(where) ? where : [where];
  return clauses.some((w) => Object.entries(w).every(([k, v]) => row[k] === v));
}

function dto(over: Partial<RegisterMlModelDto> = {}): RegisterMlModelDto {
  return {
    modelVersion: "raisedNewRoundWithin12Months-12m-catboost-20260101000000", targetName: "raisedNewRoundWithin12Months",
    targetVersion: "v1", featureSchemaVersion: "ML-FEATURES-1.0", algorithm: "catboost", trainingRows: 100, validationRows: 20,
    testRows: 20, artifactLocation: "raisedNewRoundWithin12Months-12m-catboost-20260101000000", ...over,
  } as RegisterMlModelDto;
}

describe("MlModelRegistryService", () => {
  let repo: ReturnType<typeof fakeRepo>;
  let svc: MlModelRegistryService;

  beforeEach(() => {
    repo = fakeRepo();
    svc = new MlModelRegistryService(repo as any);
  });

  describe("register", () => {
    it("always registers a real run as CANDIDATE, never trusting a caller-supplied status", async () => {
      const row = await svc.register(dto({ isTestOnly: false }));
      expect(row.status).toBe(MlModelStatus.CANDIDATE);
    });

    it("always registers a synthetic run as TEST_ONLY", async () => {
      const row = await svc.register(dto({ isTestOnly: true }));
      expect(row.status).toBe(MlModelStatus.TEST_ONLY);
    });

    it("ignores any status-like field smuggled into the payload", async () => {
      const row = await svc.register({ ...dto(), status: MlModelStatus.ACTIVE } as any);
      expect(row.status).toBe(MlModelStatus.CANDIDATE);
    });

    it("rejects registering the same model version twice", async () => {
      await svc.register(dto());
      await expect(svc.register(dto())).rejects.toThrow(ConflictException);
    });
  });

  describe("updateStatus — transition guard", () => {
    it("TEST_ONLY is terminal — can never move to any other status, including ACTIVE", async () => {
      const testOnly = await svc.register(dto({ isTestOnly: true }));
      await expect(svc.updateStatus(testOnly.id, MlModelStatus.ACTIVE)).rejects.toThrow(BadRequestException);
      await expect(svc.updateStatus(testOnly.id, MlModelStatus.CANDIDATE)).rejects.toThrow(BadRequestException);
      await expect(svc.updateStatus(testOnly.id, MlModelStatus.SHADOW)).rejects.toThrow(BadRequestException);
    });

    it("an EXPERIMENTAL model (real data below the production gate) can never be promoted: only retired or rejected", async () => {
      const exp = await svc.register(dto({ isExperimental: true }));
      expect(exp.status).toBe(MlModelStatus.EXPERIMENTAL);
      for (const next of [MlModelStatus.CANDIDATE, MlModelStatus.SHADOW, MlModelStatus.ACTIVE]) {
        await expect(svc.updateStatus(exp.id, next)).rejects.toThrow(BadRequestException);
      }
      expect((await svc.updateStatus(exp.id, MlModelStatus.RETIRED)).status).toBe(MlModelStatus.RETIRED);
    });

    it("an experimental model is never eligible for shadow-prediction traffic", async () => {
      await svc.register(dto({ isExperimental: true }));
      expect(await svc.findEligibleForShadowPrediction()).toHaveLength(0);
    });

    it("a model cannot be both synthetic TEST_ONLY and EXPERIMENTAL", async () => {
      await expect(svc.register(dto({ isTestOnly: true, isExperimental: true }))).rejects.toThrow(BadRequestException);
    });

    it("a new (CANDIDATE) model can never jump straight to ACTIVE, only to SHADOW or REJECTED", async () => {
      const candidate = await svc.register(dto());
      await expect(svc.updateStatus(candidate.id, MlModelStatus.ACTIVE)).rejects.toThrow(BadRequestException);
      const shadowed = await svc.updateStatus(candidate.id, MlModelStatus.SHADOW);
      expect(shadowed.status).toBe(MlModelStatus.SHADOW);
    });

    it("allows the full legitimate path CANDIDATE -> SHADOW -> ACTIVE -> RETIRED", async () => {
      const candidate = await svc.register(dto());
      await svc.updateStatus(candidate.id, MlModelStatus.SHADOW);
      const active = await svc.updateStatus(candidate.id, MlModelStatus.ACTIVE);
      expect(active.status).toBe(MlModelStatus.ACTIVE);
      const retired = await svc.updateStatus(candidate.id, MlModelStatus.RETIRED);
      expect(retired.status).toBe(MlModelStatus.RETIRED);
    });

    it("RETIRED and REJECTED are terminal", async () => {
      const candidate = await svc.register(dto());
      await svc.updateStatus(candidate.id, MlModelStatus.SHADOW);
      const rejected = await svc.updateStatus(candidate.id, MlModelStatus.REJECTED);
      await expect(svc.updateStatus(rejected.id, MlModelStatus.CANDIDATE)).rejects.toThrow(BadRequestException);
    });

    it("throws NotFoundException for an unknown model id", async () => {
      await expect(svc.updateStatus("does-not-exist", MlModelStatus.SHADOW)).rejects.toThrow(NotFoundException);
    });
  });

  describe("findEligibleForShadowPrediction", () => {
    it("returns only SHADOW and ACTIVE models, never CANDIDATE/TEST_ONLY/REJECTED/RETIRED", async () => {
      const candidate = await svc.register(dto({ modelVersion: "v-candidate" }));
      const willBeShadow = await svc.register(dto({ modelVersion: "v-shadow" }));
      await svc.updateStatus(willBeShadow.id, MlModelStatus.SHADOW);
      await svc.register(dto({ modelVersion: "v-test-only", isTestOnly: true }));

      const eligible = await svc.findEligibleForShadowPrediction();
      const versions = eligible.map((m) => m.modelVersion);
      expect(versions).toContain("v-shadow");
      expect(versions).not.toContain(candidate.modelVersion);
      expect(versions).not.toContain("v-test-only");
    });
  });
});
