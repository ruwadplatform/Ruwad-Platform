import { ForbiddenException, ValidationPipe } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { OwnershipGuard } from "../common/guards/ownership.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { ROLES_KEY } from "../common/decorators/roles.decorator";
import { OWNED_ENTITY_KIND_KEY } from "../common/decorators/owned-entity.decorator";
import { EntityKind, UserRole } from "../common/enums";
import { FounderHistoricalDataController } from "./founder-historical-data.controller";
import { ReadinessAdminController } from "./readiness-admin.controller";
import { MlDataController } from "./ml-data.controller";
import { ResubmitHistoricalEntryDto, ReviewHistoricalEntryDto, SubmitHistoricalEntryDto, DeclareApplicabilityDto } from "./dto/readiness-v2.dto";

type Ctor = new (...args: never[]) => unknown;
const guardsOf = (c: Ctor): Ctor[] => Reflect.getMetadata("__guards__", c) ?? [];
const rolesOf = (c: Ctor): UserRole[] => Reflect.getMetadata(ROLES_KEY, c) ?? [];
const names = (fs: Ctor[]) => fs.map((f) => f.name);

describe("access control — historical financial/customer data stays private", () => {
  it("the founder routes require login, a role, AND ownership of the startup in the URL; admins pass", () => {
    expect(names(guardsOf(FounderHistoricalDataController))).toEqual(["JwtAuthGuard", "RolesGuard", "OwnershipGuard"]);
    expect(Reflect.getMetadata(OWNED_ENTITY_KIND_KEY, FounderHistoricalDataController)).toBe(EntityKind.STARTUP);
    expect(rolesOf(FounderHistoricalDataController)).not.toContain(UserRole.USER);
    expect(rolesOf(FounderHistoricalDataController)).not.toContain(UserRole.INVESTOR);
  });
  it("a founder who does NOT own the startup is refused by the ownership guard", async () => {
    const organizations = { isOwner: jest.fn(async () => false) };
    const guard = new OwnershipGuard(new Reflector(), organizations as any);
    const ctx: any = { getHandler: () => FounderHistoricalDataController.prototype.list, getClass: () => FounderHistoricalDataController, switchToHttp: () => ({ getRequest: () => ({ user: { userId: "u", role: UserRole.FOUNDER }, params: { id: "someone-elses-startup" } }) }) };
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(organizations.isOwner).toHaveBeenCalledWith("u", EntityKind.STARTUP, "someone-elses-startup");
  });
  it("the owner passes the ownership guard", async () => {
    const guard = new OwnershipGuard(new Reflector(), { isOwner: async () => true } as any);
    const ctx: any = { getHandler: () => FounderHistoricalDataController.prototype.list, getClass: () => FounderHistoricalDataController, switchToHttp: () => ({ getRequest: () => ({ user: { userId: "u", role: UserRole.FOUNDER }, params: { id: "mine" } }) }) };
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
  it("an investor or plain user is rejected by the roles guard on the founder routes", () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    for (const role of [UserRole.INVESTOR, UserRole.USER]) {
      const ctx: any = { getHandler: () => FounderHistoricalDataController.prototype.list, getClass: () => FounderHistoricalDataController, switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }) };
      expect(guard.canActivate(ctx)).toBe(false);
    }
  });
  it("the review queue, applicability, coverage, eligibility and dashboard routes are admin-only", () => {
    expect(names(guardsOf(ReadinessAdminController))).toEqual(["JwtAuthGuard", "RolesGuard"]);
    expect(rolesOf(ReadinessAdminController).sort()).toEqual([UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN].sort());
  });
  it("the readiness/export controller stays admin-only", () => {
    expect(rolesOf(MlDataController).sort()).toEqual([UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN].sort());
  });
  it("no public startup controller exposes the historical data (it lives only under admin ml-data and the owner route)", () => {
    expect(Reflect.getMetadata("path", FounderHistoricalDataController)).toBe("startups/:id/historical-data");
    expect(Reflect.getMetadata("path", ReadinessAdminController)).toBe("ml-data/historical");
  });
});

describe("a founder cannot smuggle provenance or review state through the request body", () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
  const run = (dto: Ctor, body: unknown) => pipe.transform(body, { type: "body", metatype: dto as never });

  it("extra fields such as source, verified, reviewStatus or submittedBy are rejected, not ignored", async () => {
    const good = { kind: "REVENUE", entry: { revenueType: "RECOGNIZED", periodStart: "2023-01-01", periodEnd: "2023-12-31", amount: 1, currency: "SAR" } };
    await expect(run(SubmitHistoricalEntryDto, good)).resolves.toBeDefined();
    for (const extra of [{ source: "ADMIN_ENTERED" }, { verified: true }, { reviewStatus: "VERIFIED" }, { submittedBy: "someone" }, { startupId: "x" }]) {
      await expect(run(SubmitHistoricalEntryDto, { ...good, ...extra })).rejects.toBeDefined();
      await expect(run(ResubmitHistoricalEntryDto, { entry: good.entry, ...extra })).rejects.toBeDefined();
    }
  });
  it("review actions are limited to the three defined ones", async () => {
    await expect(run(ReviewHistoricalEntryDto, { action: "VERIFY" })).resolves.toBeDefined();
    await expect(run(ReviewHistoricalEntryDto, { action: "DELETE_EVERYTHING" })).rejects.toBeDefined();
  });
  it("applicability cannot be declared with a founder source, even by an admin request body", async () => {
    await expect(run(DeclareApplicabilityDto, { featureKey: "regulatoryMilestone", status: "APPLICABLE", effectiveDate: "2024-01-01", source: "FOUNDER_SUBMITTED" })).rejects.toBeDefined();
    await expect(run(DeclareApplicabilityDto, { featureKey: "regulatoryMilestone", status: "APPLICABLE", effectiveDate: "2024-01-01", source: "ADMIN_ENTERED" })).resolves.toBeDefined();
  });
});

describe("the founder's own view hides reviewer internals", () => {
  it("the controller maps submissions to a view without reviewedBy/submittedBy/materialized", async () => {
    const row: any = { id: "1", kind: "REVENUE", payload: {}, effectiveDate: "2023-12-31", reviewStatus: "VERIFIED", reviewNotes: "ok", reviewedBy: "admin-secret-id", submittedBy: "u", materialized: { evidence: ["e"] }, createdAt: new Date(), reviewedAt: new Date() };
    const svc: any = { listForStartup: async () => [row] };
    const out = await new FounderHistoricalDataController(svc).list("11111111-1111-4111-8111-111111111111");
    expect(Object.keys(out[0])).not.toContain("reviewedBy");
    expect(Object.keys(out[0])).not.toContain("submittedBy");
    expect(Object.keys(out[0])).not.toContain("materialized");
    expect(out[0].reviewNotes).toBe("ok");
  });
});
