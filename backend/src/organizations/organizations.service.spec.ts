import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { EntityKind, MembershipRole } from "../common/enums";
import { OrganizationsService } from "./organizations.service";

function fakeRepo(seed: Record<string, any>[] = []) {
  const rows: Record<string, any>[] = [...seed];
  return {
    rows,
    find: jest.fn(async (opts?: any) => rows.filter((r) => matches(r, opts?.where)).sort((a: any, b: any) => (opts?.order?.createdAt === "DESC" ? b.createdAt - a.createdAt : 0)),
    ),
    findOne: jest.fn(async (opts: any) => rows.find((r) => matches(r, opts.where)) ?? null),
    exists: jest.fn(async (opts: any) => rows.some((r) => matches(r, opts.where))),
    create: jest.fn((x: any) => ({ id: `id-${rows.length + 1}`, createdAt: rows.length, ...x })),
    save: jest.fn(async (x: any) => { const i = rows.findIndex((r) => r.id === x.id); if (i >= 0) rows[i] = x; else rows.push(x); return x; }),
    update: jest.fn(async (id: string, patch: any) => { const r = rows.find((x: any) => x.id === id); if (r) Object.assign(r, patch); }),
    delete: jest.fn(async (id: string) => { const i = rows.findIndex((r) => r.id === id); if (i >= 0) rows.splice(i, 1); }),
  };
}
function matches(row: any, where: any): boolean {
  if (!where) return true;
  const clauses = Array.isArray(where) ? where : [where];
  return clauses.some((w) => Object.entries(w).every(([k, v]) => row[k] === v));
}

describe("OrganizationsService — listing claims", () => {
  const STARTUP_ID = "startup-1";
  let membershipRepo: ReturnType<typeof fakeRepo>;
  let claimRepo: ReturnType<typeof fakeRepo>;
  let startupRepo: ReturnType<typeof fakeRepo>;
  let users: { findByIdOrThrow: jest.Mock };
  let svc: OrganizationsService;

  beforeEach(() => {
    membershipRepo = fakeRepo();
    claimRepo = fakeRepo();
    startupRepo = fakeRepo([{ id: STARTUP_ID, name: "Clinicy", slug: "clinicy", verified: "unclaimed" }]);
    users = { findByIdOrThrow: jest.fn(async (id: string) => ({ id, email: `${id}@example.com` })) };
    svc = new OrganizationsService(
      membershipRepo as any, claimRepo as any, startupRepo as any,
      fakeRepo() as any, fakeRepo() as any, fakeRepo() as any, fakeRepo() as any,
      users as any,
    );
  });

  it("lets a user submit a claim on an existing, unowned listing", async () => {
    const claim = await svc.submitClaim("user-1", { kind: EntityKind.STARTUP, entityId: STARTUP_ID, role: "Founder & CEO", note: "founder@clinicy.com" });
    expect(claim).toMatchObject({ userId: "user-1", kind: EntityKind.STARTUP, entityId: STARTUP_ID, status: "PENDING" });
  });

  it("refuses a claim on a listing that doesn't exist", async () => {
    await expect(svc.submitClaim("user-1", { kind: EntityKind.STARTUP, entityId: "nope", role: "CEO" })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a second claim while one is already pending on the same listing", async () => {
    await svc.submitClaim("user-1", { kind: EntityKind.STARTUP, entityId: STARTUP_ID, role: "CEO" });
    await expect(svc.submitClaim("user-2", { kind: EntityKind.STARTUP, entityId: STARTUP_ID, role: "COO" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a second claim from the same user while theirs is pending (one company claim per account)", async () => {
    startupRepo.rows.push({ id: "startup-2", name: "Other Co", slug: "other-co", verified: "unclaimed" });
    await svc.submitClaim("user-1", { kind: EntityKind.STARTUP, entityId: STARTUP_ID, role: "CEO" });
    await expect(svc.submitClaim("user-1", { kind: EntityKind.STARTUP, entityId: "startup-2", role: "CEO" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a claim on a listing that already has an owner", async () => {
    membershipRepo.rows.push({ id: "m-1", userId: "someone-else", kind: EntityKind.STARTUP, entityId: STARTUP_ID, role: MembershipRole.OWNER });
    await expect(svc.submitClaim("user-1", { kind: EntityKind.STARTUP, entityId: STARTUP_ID, role: "CEO" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("approving a claim creates an OWNER membership and moves the startup from unclaimed to self-reported", async () => {
    const claim = await svc.submitClaim("user-1", { kind: EntityKind.STARTUP, entityId: STARTUP_ID, role: "Founder & CEO" });
    const approved = await svc.approveClaim(claim.id, "admin-1");
    expect(approved.status).toBe("APPROVED");
    expect(approved.reviewedByUserId).toBe("admin-1");
    expect(membershipRepo.rows).toContainEqual(expect.objectContaining({ userId: "user-1", kind: EntityKind.STARTUP, entityId: STARTUP_ID, role: MembershipRole.OWNER }));
    expect(startupRepo.rows[0].verified).toBe("self-reported");
  });

  it("rejecting a claim records who rejected it and why, and creates no membership", async () => {
    const claim = await svc.submitClaim("user-1", { kind: EntityKind.STARTUP, entityId: STARTUP_ID, role: "CEO" });
    const rejected = await svc.rejectClaim(claim.id, "admin-1", "Could not verify affiliation");
    expect(rejected).toMatchObject({ status: "REJECTED", reviewedByUserId: "admin-1", rejectionReason: "Could not verify affiliation" });
    expect(membershipRepo.rows).toHaveLength(0);
  });

  it("refuses to review the same claim twice", async () => {
    const claim = await svc.submitClaim("user-1", { kind: EntityKind.STARTUP, entityId: STARTUP_ID, role: "CEO" });
    await svc.approveClaim(claim.id, "admin-1");
    await expect(svc.approveClaim(claim.id, "admin-1")).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.rejectClaim(claim.id, "admin-1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("after a rejection, the same user can submit a new claim", async () => {
    const first = await svc.submitClaim("user-1", { kind: EntityKind.STARTUP, entityId: STARTUP_ID, role: "CEO" });
    await svc.rejectClaim(first.id, "admin-1");
    await expect(svc.submitClaim("user-1", { kind: EntityKind.STARTUP, entityId: STARTUP_ID, role: "CEO" })).resolves.toMatchObject({ status: "PENDING" });
  });

  it("reports a pending claim's existence without the admin-only detail", async () => {
    expect(await svc.pendingClaimForEntity(EntityKind.STARTUP, STARTUP_ID)).toBe(false);
    await svc.submitClaim("user-1", { kind: EntityKind.STARTUP, entityId: STARTUP_ID, role: "CEO" });
    expect(await svc.pendingClaimForEntity(EntityKind.STARTUP, STARTUP_ID)).toBe(true);
  });

  it("lists every claim for admin review with the entity name and claimant email resolved", async () => {
    await svc.submitClaim("user-1", { kind: EntityKind.STARTUP, entityId: STARTUP_ID, role: "Founder & CEO", note: "LinkedIn: /in/founder" });
    const rows = await svc.findAllClaimsAdmin();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entityName: "Clinicy", claimantEmail: "user-1@example.com", role: "Founder & CEO" });
  });
});
