import { randomUUID } from "crypto";
import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UserRole } from "../common/enums";
import { IntroductionsController } from "../introductions/introductions.controller";
import { IntroductionsService } from "../introductions/introductions.service";
import { SubmissionsController } from "./submissions.controller";
import { SubmissionsService } from "./submissions.service";

/** Stands in for the JWT check only; the real RolesGuard, pipes and controllers run. */
class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    ctx.switchToHttp().getRequest().user = { userId: "u1", role: UserRole.RUWAD_ADMIN };
    return true;
  }
}

/** Any service method resolves to an empty object, and every call is recorded. `then` and the Nest lifecycle hooks must stay undefined,
 * otherwise the DI container treats the mock as a thenable / hook owner and never finishes compiling. */
function serviceMock() {
  const calls: string[] = [];
  const target = new Proxy({}, {
    get: (_t, name) => {
      if (typeof name !== "string" || name === "then" || name === "toJSON" || /^(on|before)[A-Z]/.test(name)) return undefined;
      return (...args: unknown[]) => { calls.push(`${name}(${args.length})`); return Promise.resolve({}); };
    },
  });
  return { mock: target, calls };
}

describe("malformed ids are a 400, not a 500", () => {
  let app: INestApplication;
  const submissions = serviceMock();
  const introductions = serviceMock();

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [SubmissionsController, IntroductionsController],
      providers: [{ provide: SubmissionsService, useValue: submissions.mock }, { provide: IntroductionsService, useValue: introductions.mock }],
    }).overrideGuard(JwtAuthGuard).useClass(AdminGuard).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  }, 60_000);
  afterAll(() => app.close());
  beforeEach(() => { submissions.calls.length = 0; introductions.calls.length = 0; });

  const bad = "not-a-uuid";
  const good = randomUUID();
  const routes: Array<[string, string]> = [
    ["get", `/submissions/${bad}`],
    ["get", `/submissions/${bad}/history`],
    ["get", `/submissions/admin/${bad}`],
    ["get", `/submissions/admin/${bad}/history`],
    ["post", `/submissions/admin/${bad}/start-review`],
    ["post", `/submissions/admin/${bad}/approve`],
    ["patch", `/submissions/${bad}`],
    ["delete", `/submissions/${bad}`],
    ["post", `/submissions/${bad}/submit`],
    ["get", `/introductions/${bad}`],
    ["patch", `/introductions/${bad}/status`],
  ];

  it.each(routes)("%s %s → 400 and the service is never reached", async (method, url) => {
    const res = await (request(app.getHttpServer()) as unknown as Record<string, (u: string) => request.Test>)[method](url).send({});
    expect(res.status).toBe(400);
    expect(submissions.calls).toEqual([]);
    expect(introductions.calls).toEqual([]);
  });

  it("a real UUID still reaches the service", async () => {
    expect((await request(app.getHttpServer()).get(`/submissions/${good}`)).status).toBe(200);
    expect((await request(app.getHttpServer()).get(`/submissions/admin/${good}`)).status).toBe(200);
    expect((await request(app.getHttpServer()).get(`/introductions/${good}`)).status).toBe(200);
    expect(submissions.calls.length).toBe(2);
    expect(introductions.calls.length).toBe(1);
  });

  it("literal routes declared before :id are unaffected", async () => {
    expect((await request(app.getHttpServer()).get("/submissions/admin/all")).status).toBe(200);
    expect((await request(app.getHttpServer()).get("/submissions/admin/kpis")).status).toBe(200);
    expect((await request(app.getHttpServer()).get("/introductions/admin/all")).status).toBe(200);
  });
});
