import { randomUUID } from "crypto";
import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UserRole } from "../common/enums";
import { ReportGeneratorService } from "./report-generator.service";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

/** Stands in for the JWT check only: the role comes from a header. The REAL RolesGuard and controller run. */
class HeaderAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const role = req.headers["x-test-role"];
    if (!role) throw new UnauthorizedException();
    req.user = { id: "u1", role };
    return true;
  }
}

describe("Reports API permissions", () => {
  let app: INestApplication;
  const service = {
    findAll: jest.fn(async () => ({ items: [], total: 0 })), findAllAdmin: jest.fn(async () => []), findBySlugAdmin: jest.fn(async () => ({})),
    findBySlugOrThrow: jest.fn(async (slug: string) => ({ slug })), setPublished: jest.fn(async () => ({})), create: jest.fn(async () => ({})),
    update: jest.fn(async () => ({})), remove: jest.fn(async () => undefined),
  };
  const generator = { generate: jest.fn(async () => ({ id: "r1" })), refreshResearch: jest.fn(async () => ({ id: "r1" })) };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: service }, { provide: ReportGeneratorService, useValue: generator }],
    }).overrideGuard(JwtAuthGuard).useClass(HeaderAuthGuard).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  const id = randomUUID();
  const adminOnly: [string, string, () => request.Test][] = [
    ["generate", "POST /reports/generate", () => request(app.getHttpServer()).post("/reports/generate").send({ kind: "SECTOR_OVERVIEW" })],
    ["refresh research", "POST /reports/:id/refresh-research", () => request(app.getHttpServer()).post(`/reports/${id}/refresh-research`)],
    ["publish", "POST /reports/:id/publish", () => request(app.getHttpServer()).post(`/reports/${id}/publish`)],
    ["unpublish", "POST /reports/:id/unpublish", () => request(app.getHttpServer()).post(`/reports/${id}/unpublish`)],
    ["admin list", "GET /reports/admin/all", () => request(app.getHttpServer()).get("/reports/admin/all")],
    ["admin read (drafts)", "GET /reports/admin/by-slug/x", () => request(app.getHttpServer()).get("/reports/admin/by-slug/x")],
  ];

  describe.each(adminOnly)("%s", (_name, _route, call) => {
    it("rejects guests with 401", async () => { await call().expect(401); });
    it.each([UserRole.USER, UserRole.FOUNDER, UserRole.INVESTOR, UserRole.ORGANIZATION_ADMIN])("rejects a %s with 403", async (role) => {
      await call().set("x-test-role", role).expect(403);
    });
    it.each([UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN])("allows a %s", async (role) => {
      const res = await call().set("x-test-role", role);
      expect(res.status).toBeLessThan(300);
    });
  });

  it("never runs the generator or a publish for a rejected caller", async () => {
    await request(app.getHttpServer()).post("/reports/generate").send({ kind: "SECTOR_OVERVIEW" }).set("x-test-role", UserRole.USER).expect(403);
    await request(app.getHttpServer()).post(`/reports/${id}/publish`).expect(401);
    expect(generator.generate).not.toHaveBeenCalled();
    expect(service.setPublished).not.toHaveBeenCalled();
  });

  it("passes the requested kind, sector and startup to the generator", async () => {
    await request(app.getHttpServer()).post("/reports/generate").set("x-test-role", UserRole.RUWAD_ADMIN).send({ kind: "STARTUP_ANALYSIS", startupSlug: "clinicy" }).expect(201);
    expect(generator.generate).toHaveBeenCalledWith("STARTUP_ANALYSIS", { sector: undefined, startupSlug: "clinicy" });
  });

  it("validates the generate request", async () => {
    const admin = UserRole.RUWAD_ADMIN;
    await request(app.getHttpServer()).post("/reports/generate").set("x-test-role", admin).send({ kind: "MAKE_IT_UP" }).expect(400);
    await request(app.getHttpServer()).post("/reports/generate").set("x-test-role", admin).send({ kind: "STARTUP_ANALYSIS" }).expect(400);
    await request(app.getHttpServer()).post("/reports/generate").set("x-test-role", admin).send({ kind: "SECTOR_OVERVIEW", extra: 1 }).expect(400);
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it("lets anyone (including guests) read the public list and a single report", async () => {
    await request(app.getHttpServer()).get("/reports").expect(200);
    await request(app.getHttpServer()).get("/reports/some-published-report").expect(200);
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it("keeps create, edit and delete admin-only", async () => {
    await request(app.getHttpServer()).delete(`/reports/${id}`).expect(401);
    await request(app.getHttpServer()).delete(`/reports/${id}`).set("x-test-role", UserRole.USER).expect(403);
    expect(service.remove).not.toHaveBeenCalled();
  });
});
