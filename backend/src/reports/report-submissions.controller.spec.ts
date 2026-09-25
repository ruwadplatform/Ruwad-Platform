import { randomUUID } from "crypto";
import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UserRole } from "../common/enums";
import { ReportGeneratorService } from "./report-generator.service";
import { ReportLibraryService } from "./library/report-library.service";
import { ReportSubmissionsController } from "./report-submissions.controller";
import { ReportSubmissionsService } from "./report-submissions.service";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

class HeaderAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const role = req.headers["x-test-role"];
    if (!role) throw new UnauthorizedException();
    req.user = { userId: String(req.headers["x-test-user"] ?? "u1"), email: "u@x.test", role };
    return true;
  }
}

const body = () => ({
  idempotencyKey: randomUUID(), title: "Saudi Digital Health Market Report 2026", reportType: "Market Intelligence", sector: "Digital Health", geography: "Saudi Arabia",
  description: "A review of the Saudi digital health market.", executiveSummary: "x".repeat(80), authorName: "Sara Khalid", organizationName: "Example Org",
  authorEmail: "sara@example.com", reportUrl: "https://example.org/report", declaration: true,
});

describe("Report submissions API", () => {
  let app: INestApplication;
  const submissions = {
    saveFile: jest.fn(async () => ({ fileId: randomUUID(), fileName: "r.pdf", size: 10 })), submit: jest.fn(async () => ({ id: "s1", status: "PENDING_REVIEW" })),
    listMine: jest.fn(async () => []), getMine: jest.fn(async () => ({})), ownerFile: jest.fn(), adminList: jest.fn(async () => []), resendReviewEmail: jest.fn(async () => ({ sent: true })),
    reviewInfo: jest.fn(async () => ({ title: "t" })), reviewFile: jest.fn(), decide: jest.fn(async () => ({ status: "PUBLISHED" })), publishedFile: jest.fn(),
  };
  const reports = { findAll: jest.fn(async () => ({ items: [], total: 0 })), findBySlugOrThrow: jest.fn(async (slug: string) => ({ slug })) };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [ReportSubmissionsController, ReportsController],
      providers: [{ provide: ReportSubmissionsService, useValue: submissions }, { provide: ReportsService, useValue: reports }, { provide: ReportGeneratorService, useValue: {} }, { provide: ReportLibraryService, useValue: {} }],
    }).overrideGuard(JwtAuthGuard).useClass(HeaderAuthGuard).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());
  const http = () => request(app.getHttpServer());

  describe("submitting (any signed-in user, never a guest)", () => {
    it("rejects guests with 401", async () => {
      await http().post("/reports/submissions").send(body()).expect(401);
      await http().post("/reports/submissions/file").expect(401);
      await http().get("/reports/my-submissions").expect(401);
      await http().get(`/reports/my-submissions/${randomUUID()}`).expect(401);
      expect(submissions.submit).not.toHaveBeenCalled();
    });

    it.each([UserRole.USER, UserRole.FOUNDER, UserRole.INVESTOR, UserRole.ORGANIZATION_ADMIN, UserRole.RUWAD_ADMIN])("lets a %s submit and list their own", async (role) => {
      await http().post("/reports/submissions").set("x-test-role", role).set("x-test-user", "user-a").send(body()).expect(201);
      expect(submissions.submit).toHaveBeenCalledWith("user-a", expect.objectContaining({ title: "Saudi Digital Health Market Report 2026" }));
      await http().get("/reports/my-submissions").set("x-test-role", role).set("x-test-user", "user-a").expect(200);
      expect(submissions.listMine).toHaveBeenCalledWith("user-a");
    });

    it("always acts as the signed-in user, ignoring any userId in the body", async () => {
      await http().post("/reports/submissions").set("x-test-role", UserRole.USER).set("x-test-user", "user-a").send({ ...body(), userId: "user-b" }).expect(400); // unknown field refused
      expect(submissions.submit).not.toHaveBeenCalled();
    });

    it("validates the form", async () => {
      const as = () => http().post("/reports/submissions").set("x-test-role", UserRole.USER);
      await as().send({ ...body(), declaration: false }).expect(400);
      await as().send({ ...body(), title: "no" }).expect(400);
      await as().send({ ...body(), reportType: "Made up" }).expect(400);
      await as().send({ ...body(), authorEmail: "not-an-email" }).expect(400);
      await as().send({ ...body(), reportUrl: "javascript:alert(1)" }).expect(400);
      await as().send({ ...body(), sources: [{ title: "x", url: "ftp://files.example.org/a" }] }).expect(400);
      await as().send({ ...body(), idempotencyKey: "abc" }).expect(400);
      expect(submissions.submit).not.toHaveBeenCalled();
    });

    it("`my-submissions` is not swallowed by the public :slug route", async () => {
      await http().get("/reports/my-submissions").set("x-test-role", UserRole.USER).expect(200);
      expect(reports.findBySlugOrThrow).not.toHaveBeenCalled();
    });
  });

  describe("admin-only monitoring and retry", () => {
    const id = randomUUID();
    it("rejects guests (401) and normal users (403)", async () => {
      await http().get("/reports/submissions/admin").expect(401);
      await http().post(`/reports/submissions/${id}/resend-review-email`).expect(401);
      await http().get("/reports/submissions/admin").set("x-test-role", UserRole.USER).expect(403);
      await http().post(`/reports/submissions/${id}/resend-review-email`).set("x-test-role", UserRole.USER).expect(403);
      expect(submissions.resendReviewEmail).not.toHaveBeenCalled();
    });
    it("lets admins", async () => {
      await http().get("/reports/submissions/admin").set("x-test-role", UserRole.RUWAD_ADMIN).expect(200);
      await http().post(`/reports/submissions/${id}/resend-review-email`).set("x-test-role", UserRole.SUPER_ADMIN).expect(200);
    });
  });

  describe("the emailed review link (no login, token only)", () => {
    const token = "A".repeat(43);
    it("works without a session: view, accept, reject", async () => {
      await http().get(`/reports/review/${token}`).expect(200);
      await http().post(`/reports/review/${token}/accept`).expect(200);
      await http().post(`/reports/review/${token}/reject`).send({ reason: "Out of scope" }).expect(200);
      expect(submissions.decide).toHaveBeenNthCalledWith(1, token, "ACCEPT");
      expect(submissions.decide).toHaveBeenNthCalledWith(2, token, "REJECT", "Out of scope");
    });

    it("GET only reads — a state change needs a POST", async () => {
      await http().get(`/reports/review/${token}?action=accept`).expect(200);
      await http().get(`/reports/review/${token}/accept`).expect(404);
      expect(submissions.decide).not.toHaveBeenCalled();
    });
  });

  it("the public list and report pages stay public", async () => {
    await http().get("/reports").expect(200);
    await http().get("/reports/some-slug").expect(200);
  });
});
