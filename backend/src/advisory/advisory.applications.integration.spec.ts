/* eslint-disable @typescript-eslint/no-var-requires */
import { randomUUID } from "crypto";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { Test } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import request from "supertest";
import { JwtStrategy } from "../auth/jwt.strategy";
import { UsersModule } from "../users/users.module";
import { EmailService } from "../email/email.service";
import { AdvisoryApplicationNotifier } from "./advisory-application-notifier";
import { AdvisoryModule } from "./advisory.module";

const { assertLocalDatabase, LOCAL_DATABASE_URL } = require("../../scripts/dev/local-db-guard");
const { Client } = require("pg");

/** INTEGRATION TESTS for "Become an Advisor" against the LOCAL embedded Postgres (npm run test:advisory). Skipped unless ADVISORY_INTEGRATION=1, and
 * refuses any database that is not on this machine. Creates its own users and applications and deletes every row it created. Email is mocked: the
 * EmailService is replaced, so even the "live mode" test cannot reach a real provider. */
const RUN = process.env.ADVISORY_INTEGRATION === "1";
const suite = RUN ? describe : describe.skip;

const SECRET = "advisory-integration-test-secret-not-a-real-one";
const tag = randomUUID().slice(0, 8);
const pdf = (marker = "cv") => Buffer.from(["%PDF-1.4", `% ${marker}`, "1 0 obj<<>>endobj", "trailer<<>>", "%%EOF", ""].join("\n"));
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fake photo bytes")]);

suite("Become an Advisor: applications (local Postgres)", () => {
  let app: INestApplication;
  let live: INestApplication | null = null;
  let db: InstanceType<typeof Client>;
  const sendTransactional = jest.fn();
  const created = { users: [] as string[] };
  const tokenOf = new Map<string, string>();
  const idOf = new Map<string, string>();
  let jwt: JwtService;

  const auth = (who: string | null, r: request.Test) => (who ? r.set("Authorization", `Bearer ${tokenOf.get(who)}`) : r);
  const get = (who: string | null, p: string) => auth(who, request(app.getHttpServer()).get(`/api${p}`));
  const post = (who: string | null, p: string, body: object = {}) => auth(who, request(app.getHttpServer()).post(`/api${p}`)).send(body);

  const form = (name: string, over: Record<string, unknown> = {}) => ({
    name, email: `applicant-${tag}@example.test`, phone: "+966 55 123 4567", designation: "Professor of Cardiology", institution: "King Test University",
    location: "Riyadh, Saudi Arabia", specialization: "Cardiology", specializations: ["Heart failure", "Clinical trials"], yearsExperience: 14,
    about: "Fourteen years of clinical practice and research in cardiology, advising device and digital health teams on clinical validation.",
    researchAreas: ["Heart failure"], consultationServices: "Clinical validation reviews", preferredMinutes: 45,
    linkedinUrl: "https://www.linkedin.com/in/layla-test", websiteUrl: "https://scholar.google.com/citations?user=abc", declaration: true, ...over,
  });
  type Files = { cv?: Buffer | null; certificates?: Buffer[]; photo?: Buffer; cvName?: string; photoName?: string };
  const apply = (who: string | null, data: object | string, files: Files = { cv: pdf() }, server: INestApplication = app) => {
    let r = auth(who, request(server.getHttpServer()).post("/api/advisory/advisor/apply")).field("data", typeof data === "string" ? data : JSON.stringify(data));
    if (files.cv) r = r.attach("cv", files.cv, files.cvName ?? "cv.pdf");
    (files.certificates ?? []).forEach((c, i) => { r = r.attach("certificates", c, `cert-${i}.pdf`); });
    if (files.photo) r = r.attach("photo", files.photo, files.photoName ?? "me.png");
    return r;
  };

  /** Edit & Reapply: same multipart shape as applying. */
  const reapply = (who: string | null, data: object | string, files: Files = {}, server: INestApplication = app) => {
    let r = auth(who, request(server.getHttpServer()).post("/api/advisory/advisor/reapply")).field("data", typeof data === "string" ? data : JSON.stringify(data));
    if (files.cv) r = r.attach("cv", files.cv, files.cvName ?? "cv.pdf");
    (files.certificates ?? []).forEach((c, i) => { r = r.attach("certificates", c, `cert-new-${i}.pdf`); });
    if (files.photo) r = r.attach("photo", files.photo, files.photoName ?? "me.png");
    return r;
  };
  const docsOf = async (advisorId: string) => (await db.query(`SELECT id, kind, "fileName", size, data FROM advisory_application_documents WHERE "advisorId" = $1 ORDER BY "createdAt", id`, [advisorId])).rows as { id: string; kind: string; fileName: string; size: number; data: Buffer }[];
  const reject = (id: string, notes = "We could not verify your licence from the documents provided.") => post("admin", `/advisory/admin/advisors/${id}/reject`, { notes });

  async function makeUser(name: string, role = "USER") {
    const email = `app-it-${tag}-${name}@example.test`;
    const { rows } = await db.query(`INSERT INTO users ("firstName","lastName",email,"passwordHash",role) VALUES ($1,$2,$3,$4,$5) RETURNING id`, ["IT", name, email, "x", role]);
    created.users.push(rows[0].id);
    idOf.set(name, rows[0].id);
    tokenOf.set(name, jwt.sign({ sub: rows[0].id, email, role }));
    return rows[0].id as string;
  }

  async function build(extra: Record<string, string> = {}) {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET: SECRET, ADVISORY_ENABLED: "true", ADVISORY_EMAIL_MODE: "mock", NODE_ENV: "test", APP_URL: "https://app.ruwad.test", ...extra })] }),
        TypeOrmModule.forRoot({ type: "postgres", url: assertLocalDatabase(LOCAL_DATABASE_URL), ssl: false, autoLoadEntities: true, synchronize: false }),
        PassportModule,
        JwtModule.register({ secret: SECRET, signOptions: { expiresIn: "1h" } }),
        AdvisoryModule,
        UsersModule, // JwtStrategy checks the account is still ACTIVE through UsersService
      ],
      providers: [JwtStrategy],
    }).overrideProvider(EmailService).useValue({ sendTransactional }).compile();
    const a = moduleRef.createNestApplication({ rawBody: true });
    a.setGlobalPrefix("api");
    a.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    await a.init();
    return { app: a, jwt: moduleRef.get(JwtService) };
  }

  const advisorRow = async (who: string) => (await db.query(`SELECT * FROM advisory_advisors WHERE "userId" = $1`, [idOf.get(who)])).rows[0];
  const events = async (advisorId: string) => (await db.query(`SELECT * FROM advisory_application_events WHERE "advisorId" = $1 ORDER BY "createdAt", id`, [advisorId])).rows as { type: string; note: string | null; details: Record<string, unknown> | null; actorRole: string; fromStatus: string | null; toStatus: string | null; actorUserId: string | null }[];
  const notifications = async (advisorId: string) => (await events(advisorId)).filter((e) => e.type === "NOTIFICATION").map((e) => e.details as { kind: string; mode: string; recipient: string; subject: string; result: string });

  beforeAll(async () => {
    db = new Client({ connectionString: assertLocalDatabase(LOCAL_DATABASE_URL) });
    await db.connect();
    const built = await build();
    app = built.app;
    jwt = built.jwt;
    for (const n of ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "r1", "r2", "r3", "r4", "bystander"]) await makeUser(n);
    await makeUser("admin", "RUWAD_ADMIN");
    await makeUser("superAdmin", "SUPER_ADMIN");
  }, 120_000);

  afterAll(async () => {
    if (db && created.users.length) {
      const adv = (await db.query(`SELECT id FROM advisory_advisors WHERE "userId" = ANY($1)`, [created.users])).rows.map((r: { id: string }) => r.id);
      if (adv.length) {
        await db.query(`DELETE FROM advisory_application_documents WHERE "advisorId" = ANY($1)`, [adv]);
        await db.query(`DELETE FROM advisory_application_events WHERE "advisorId" = ANY($1)`, [adv]);
        await db.query(`DELETE FROM advisory_availability_rules WHERE "advisorId" = ANY($1)`, [adv]);
        await db.query(`DELETE FROM advisory_services WHERE "advisorId" = ANY($1)`, [adv]);
        await db.query(`DELETE FROM advisory_advisors WHERE id = ANY($1)`, [adv]);
      }
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    }
    await live?.close();
    await app?.close();
    await db?.end();
  });

  beforeEach(() => sendTransactional.mockReset().mockResolvedValue(true));

  // ---- signed out, validation -----------------------------------------------------------------------------------------------------------

  it("a signed-out visitor can't submit (and the public directory stays readable)", async () => {
    expect((await apply(null, form("Nobody"))).status).toBe(401);
    expect((await get(null, "/advisory/advisors")).status).toBe(200);
    expect((await get(null, "/advisory/advisor/me")).status).toBe(401);
  });

  it("validates the form on the server: every problem is reported, and nothing is saved", async () => {
    const res = await apply("a1", form("Dr. Invalid", { email: "not-an-email", phone: "abc", yearsExperience: -3, about: "short", preferredMinutes: 20, declaration: false, linkedinUrl: "https://example.com/x" }));
    expect(res.status).toBe(400);
    const text = (res.body.message as string[]).join(" | ");
    for (const part of ["email", "phone", "yearsExperience", "about", "preferredMinutes", "declaration", "linkedinUrl"]) expect(text).toContain(part);
    expect(await advisorRow("a1")).toBeUndefined();
  });

  it("the CV is required, and unreadable form data is refused", async () => {
    const noCv = await apply("a1", form("Dr. NoCv"), { cv: null });
    expect(noCv.status).toBe(400);
    expect((noCv.body.message as string[]).join(" ")).toMatch(/CV/);
    expect((await apply("a1", "{broken json")).status).toBe(400);
    // The old JSON-only call can no longer create a profile.
    expect((await post("a1", "/advisory/advisor/apply", form("Dr. Json"))).status).toBe(400);
    expect(await advisorRow("a1")).toBeUndefined();
  });

  it("validates files by type, content and size, and saves nothing when any fails", async () => {
    const wrongType = await apply("a1", form("Dr. Files"), { cv: pdf(), cvName: "cv.docx" });
    expect(wrongType.status).toBe(400);
    const fake = await apply("a1", form("Dr. Files"), { cv: Buffer.from("MZ not a pdf at all"), cvName: "cv.pdf" });
    expect(fake.status).toBe(400);
    expect((fake.body.message as string[]).join(" ")).toMatch(/isn't a valid PDF/);
    const badPhoto = await apply("a1", form("Dr. Files"), { cv: pdf(), photo: pdf(), photoName: "me.pdf" });
    expect(badPhoto.status).toBe(400);
    const huge = await apply("a1", form("Dr. Files"), { cv: Buffer.concat([pdf(), Buffer.alloc(2 * 1024 * 1024 + 10)]) });
    expect(huge.status).toBe(413);
    expect(await advisorRow("a1")).toBeUndefined();
  });

  it("refuses fields it doesn't know, so nobody can submit themselves as approved", async () => {
    const res = await apply("a1", { ...form("Dr. Sneaky"), status: "APPROVED", applicationReference: "ADV-2026-AAAAAA" });
    expect(res.status).toBe(400);
    expect(await advisorRow("a1")).toBeUndefined();
  });

  // ---- a successful submission ----------------------------------------------------------------------------------------------------------

  let a1Id = "";
  let a1Ref = "";
  const cvBytes = pdf("a1-cv-bytes");

  it("saves the application PENDING_REVIEW against the signed-in user, with documents, history and a (mock) admin notification", async () => {
    const res = await apply("a1", form(`Dr. Layla ${tag}`), { cv: cvBytes, certificates: [pdf("cert-1"), pdf("cert-2")], photo: png });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "PENDING_REVIEW" });
    a1Ref = res.body.reference;
    expect(a1Ref).toMatch(/^ADV-\d{4}-[A-Z2-9]{6}$/);

    const row = await advisorRow("a1");
    a1Id = row.id;
    expect(row).toMatchObject({
      userId: idOf.get("a1"), status: "PENDING_REVIEW", applicationReference: a1Ref, contactEmail: `applicant-${tag}@example.test`, phone: "+966 55 123 4567", name: `Dr. Layla ${tag}`,
      institution: "King Test University", designation: "Professor of Cardiology", location: "Riyadh, Saudi Arabia", specialization: "Cardiology", yearsExperience: 14,
      preferredMinutes: 45, linkedinUrl: "https://www.linkedin.com/in/layla-test", isDemo: false, affiliationVerified: false, reviewedAt: null,
    });
    expect(row.specializations).toEqual(["Heart failure", "Clinical trials"]);
    expect(row.submittedAt).toBeTruthy();
    expect(row.declarationAcceptedAt).toBeTruthy();

    const docs = (await db.query(`SELECT kind, "fileName", size, "mimeType" FROM advisory_application_documents WHERE "advisorId" = $1 ORDER BY kind, "fileName"`, [a1Id])).rows;
    expect(docs.map((d: { kind: string }) => d.kind)).toEqual(["CERTIFICATE", "CERTIFICATE", "CV", "PHOTO"]);

    const ev = await events(a1Id);
    expect(ev[0]).toMatchObject({ type: "SUBMITTED", actorRole: "APPLICANT", actorUserId: idOf.get("a1"), toStatus: "PENDING_REVIEW" });
    expect(await notifications(a1Id)).toEqual([{ kind: "ADMIN_NEW_APPLICATION", mode: "mock", recipient: "ADMIN", subject: "New Advisor Application – RUWĀD Advisory Services", result: "mock" }]);
    expect(sendTransactional).not.toHaveBeenCalled(); // mock mode: nothing leaves the building
  });

  it("is invisible to the public until approved: not in the directory, no profile page", async () => {
    const row = await advisorRow("a1");
    const list = (await get(null, "/advisory/advisors")).body as { id: string }[];
    expect(list.map((a) => a.id)).not.toContain(row.slug);
    expect((await get(null, `/advisory/advisors/${row.slug}`)).status).toBe(404);
  });

  it("a second application is refused (409), however it is made", async () => {
    const again = await apply("a1", form("Dr. Layla Again"));
    expect(again.status).toBe(409);
    expect(again.body.message).toContain(a1Ref);
    expect((await db.query(`SELECT count(*)::int AS n FROM advisory_advisors WHERE "userId" = $1`, [idOf.get("a1")])).rows[0].n).toBe(1);
  });

  it("two submissions at the same instant produce exactly one application", async () => {
    const results = await Promise.all([apply("a2", form(`Dr. Race ${tag}`)), apply("a2", form(`Dr. Race ${tag}`))]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const row = await advisorRow("a2");
    expect((await db.query(`SELECT count(*)::int AS n FROM advisory_advisors WHERE "userId" = $1`, [idOf.get("a2")])).rows[0].n).toBe(1);
    expect((await db.query(`SELECT count(*)::int AS n FROM advisory_application_documents WHERE "advisorId" = $1`, [row.id])).rows[0].n).toBe(1);
    expect((await events(row.id)).filter((e) => e.type === "SUBMITTED")).toHaveLength(1);
    expect((await notifications(row.id))).toHaveLength(1); // RUWĀD is told once
  });

  it("an email failure never loses the application", async () => {
    const notifier = app.get(AdvisoryApplicationNotifier);
    const spy = jest.spyOn(notifier, "newApplication").mockRejectedValueOnce(new Error("mail server down"));
    const res = await apply("a3", form(`Dr. Resilient ${tag}`));
    spy.mockRestore();
    expect(res.status).toBe(201);
    const row = await advisorRow("a3");
    expect(row.status).toBe("PENDING_REVIEW");
    expect((await events(row.id))[0]!.type).toBe("SUBMITTED");
  });

  // ---- the applicant's own view ---------------------------------------------------------------------------------------------------------

  it("the applicant sees their application status, without any internal notes", async () => {
    const me = (await get("a1", "/advisory/advisor/me")).body.advisor;
    expect(me.status).toBe("PENDING_REVIEW");
    expect(me.application).toMatchObject({ reference: a1Ref, stage: "PENDING_REVIEW", decidedAt: null, rejectionReason: null });
    expect(me.application.documents.map((d: { kind: string }) => d.kind).sort()).toEqual(["CERTIFICATE", "CERTIFICATE", "CV", "PHOTO"]);
    expect(me.application.timeline.map((t: { type: string }) => t.type)).toEqual(["SUBMITTED"]);
    // Their own answers come back (to prefill Edit & Reapply), but nothing the reviewers wrote and nothing internal.
    expect(JSON.stringify(me)).not.toMatch(/declaration|reviewedBy|reviewedAt|contactEmail|actorUserId/);
    expect(me.reviewNotes).toBeNull();
    expect((await get("bystander", "/advisory/advisor/me")).body).toEqual({ advisor: null });
  });

  it("a pending applicant can't use advisor tools or publish anything", async () => {
    expect((await get("a1", "/advisory/advisor/bookings")).status).toBe(403);
    expect((await auth("a1", request(app.getHttpServer()).put("/api/advisory/advisor/availability")).send({ windows: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }] })).status).toBe(403);
    expect((await post("a1", "/advisory/advisor/services", { typeId: "specialist", name: "x", description: "y", minutes: 30 })).status).toBe(403);
    expect((await auth("a1", request(app.getHttpServer()).patch("/api/advisory/advisor/me")).send({ status: "APPROVED" })).status).toBe(400);
  });

  // ---- administrators: list, detail, documents ------------------------------------------------------------------------------------------

  it("only administrators can see the applications", async () => {
    expect((await get(null, "/advisory/admin/applications")).status).toBe(401);
    for (const who of ["a1", "bystander"]) {
      expect((await get(who, "/advisory/admin/applications")).status).toBe(403);
      expect((await get(who, `/advisory/admin/applications/${a1Id}`)).status).toBe(403);
    }
    expect((await get("admin", "/advisory/admin/applications")).status).toBe(200);
    expect((await get("superAdmin", "/advisory/admin/applications")).status).toBe(200);
  });

  it("lists applications with the columns the admin needs, filters by status, and counts each", async () => {
    const all = (await get("admin", "/advisory/admin/applications")).body as { counts: Record<string, number>; applications: { id: string; reference: string; name: string; institution: string; specialization: string; email: string; submittedAt: string; status: string }[] };
    const mine = all.applications.find((a) => a.id === a1Id)!;
    expect(mine).toMatchObject({ reference: a1Ref, name: `Dr. Layla ${tag}`, institution: "King Test University", specialization: "Cardiology", email: `applicant-${tag}@example.test`, status: "PENDING_REVIEW" });
    expect(new Date(mine.submittedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(all.counts.ALL).toBeGreaterThanOrEqual(3);
    const pending = (await get("admin", "/advisory/admin/applications?status=PENDING_REVIEW")).body;
    expect(pending.applications.every((a: { status: string }) => a.status === "PENDING_REVIEW")).toBe(true);
    expect(pending.applications.some((a: { id: string }) => a.id === a1Id)).toBe(true);
    const approved = (await get("admin", "/advisory/admin/applications?status=APPROVED")).body;
    expect(approved.applications.some((a: { id: string }) => a.id === a1Id)).toBe(false);
    // Demonstration advisors never appear as applications.
    expect(all.applications.some((a) => (a as unknown as { isDemo?: boolean }).isDemo)).toBe(false);
    expect((await db.query(`SELECT count(*)::int AS n FROM advisory_advisors WHERE "isDemo" = true AND id = ANY($1)`, [all.applications.map((a) => a.id)])).rows[0].n).toBe(0);
  });

  it("shows the whole application and the documents on file", async () => {
    const d = (await get("admin", `/advisory/admin/applications/${a1Id}`)).body;
    expect(d).toMatchObject({
      reference: a1Ref, status: "PENDING_REVIEW", name: `Dr. Layla ${tag}`, email: `applicant-${tag}@example.test`, phone: "+966 55 123 4567", designation: "Professor of Cardiology",
      institution: "King Test University", location: "Riyadh, Saudi Arabia", specialization: "Cardiology", specializations: ["Heart failure", "Clinical trials"], yearsExperience: 14,
      researchAreas: ["Heart failure"], consultationServices: "Clinical validation reviews", preferredMinutes: 45, linkedinUrl: "https://www.linkedin.com/in/layla-test",
      websiteUrl: "https://scholar.google.com/citations?user=abc", review: null,
    });
    expect(d.about).toContain("Fourteen years");
    expect(d.declarationAcceptedAt).toBeTruthy();
    expect(d.account.email).toBe(`app-it-${tag}-a1@example.test`);
    expect(d.documents.map((x: { kind: string }) => x.kind).sort()).toEqual(["CERTIFICATE", "CERTIFICATE", "CV", "PHOTO"]);
    expect(d.documents[0]).not.toHaveProperty("data");
    expect(d.history[0]).toMatchObject({ type: "SUBMITTED", actorRole: "APPLICANT" });
    expect((await get("admin", `/advisory/admin/applications/${randomUUID()}`)).status).toBe(404);
  });

  it("serves documents only to administrators, only as a download, byte for byte", async () => {
    const d = (await get("admin", `/advisory/admin/applications/${a1Id}`)).body;
    const cv = d.documents.find((x: { kind: string }) => x.kind === "CV");
    const url = `/advisory/admin/applications/${a1Id}/documents/${cv.id}`;
    const ok = await get("admin", url).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on("data", (c: Buffer) => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks))); });
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toContain("application/pdf");
    expect(ok.headers["content-disposition"]).toMatch(/^attachment/);
    expect(ok.headers["x-content-type-options"]).toBe("nosniff");
    expect(ok.headers["cache-control"]).toContain("no-store");
    expect((ok.body as Buffer).equals(cvBytes)).toBe(true);
    // Everyone else: no.
    expect((await get(null, url)).status).toBe(401);
    expect((await get("a1", url)).status).toBe(403); // not even the applicant
    expect((await get("bystander", url)).status).toBe(403);
    // A document id only works through ITS OWN application.
    const other = await advisorRow("a2");
    expect((await get("admin", `/advisory/admin/applications/${other.id}/documents/${cv.id}`)).status).toBe(404);
    // No public route exposes a document.
    for (const p of [`/advisory/documents/${cv.id}`, `/advisory/advisors/${(await advisorRow("a1")).slug}/documents/${cv.id}`, `/advisory/advisor/documents/${cv.id}`]) expect([401, 403, 404]).toContain((await get(null, p)).status);
  });

  // ---- decisions: rejection -------------------------------------------------------------------------------------------------------------

  it("only an administrator can decide", async () => {
    for (const who of [null, "a1", "bystander"]) {
      expect((await post(who, `/advisory/admin/advisors/${a1Id}/approve`, {})).status).toBe(who ? 403 : 401);
      expect((await post(who, `/advisory/admin/advisors/${a1Id}/reject`, { notes: "A perfectly good reason." })).status).toBe(who ? 403 : 401);
    }
    expect((await advisorRow("a1")).status).toBe("PENDING_REVIEW");
  });

  it("rejection needs a real reason: nothing changes and nothing is sent without one", async () => {
    for (const body of [{}, { notes: "" }, { notes: "   " }, { notes: "no" }, { notes: "too short" }]) {
      const r = await post("admin", `/advisory/admin/advisors/${a1Id}/reject`, body);
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/reason/i);
    }
    expect((await advisorRow("a1")).status).toBe("PENDING_REVIEW");
    expect((await events(a1Id)).some((e) => e.type === "REJECTED")).toBe(false);
  });

  it("rejecting records the reason in the history, emails the applicant (mock), and publishes nothing", async () => {
    const reason = "We were unable to verify your clinical licence from the documents provided.";
    const r = await post("admin", `/advisory/admin/advisors/${a1Id}/reject`, { notes: reason });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe("REJECTED");
    const row = await advisorRow("a1");
    expect(row).toMatchObject({ status: "REJECTED", reviewNotes: reason, reviewedByUserId: idOf.get("admin") });
    expect(row.reviewedAt).toBeTruthy();

    const ev = await events(a1Id);
    const rejected = ev.filter((e) => e.type === "REJECTED");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ note: reason, actorRole: "ADMIN", actorUserId: idOf.get("admin"), fromStatus: "PENDING_REVIEW", toStatus: "REJECTED" });
    expect((await notifications(a1Id)).filter((n) => n.kind === "APPLICANT_REJECTED")).toEqual([{ kind: "APPLICANT_REJECTED", mode: "mock", recipient: "APPLICANT", subject: "Update on Your RUWĀD Advisor Application", result: "mock" }]);
    expect(sendTransactional).not.toHaveBeenCalled();

    expect((await get(null, "/advisory/advisors")).body.map((a: { id: string }) => a.id)).not.toContain(row.slug);
    expect((await get(null, `/advisory/advisors/${row.slug}`)).status).toBe(404);
  });

  it("the rejection reason is visible to the applicant only", async () => {
    const reason = "We were unable to verify your clinical licence from the documents provided.";
    const mine = (await get("a1", "/advisory/advisor/me")).body.advisor;
    expect(mine.application).toMatchObject({ stage: "REJECTED", rejectionReason: reason });
    expect(mine.application.decidedAt).toBeTruthy();
    expect(mine.application.timeline.map((t: { type: string }) => t.type)).toEqual(["SUBMITTED", "REJECTED"]);
    // Nobody else's view contains it.
    expect(JSON.stringify((await get("bystander", "/advisory/advisor/me")).body)).not.toContain("clinical licence");
    expect(JSON.stringify((await get("a2", "/advisory/advisor/me")).body)).not.toContain("clinical licence");
    expect(JSON.stringify((await get(null, "/advisory/advisors")).body)).not.toContain("clinical licence");
    // A rejected applicant still can't use advisor tools, and can't reapply to get around the decision.
    expect((await get("a1", "/advisory/advisor/bookings")).status).toBe(403);
    expect((await apply("a1", form("Dr. Layla Retry"))).status).toBe(409);
  });

  it("a decision can't be processed twice", async () => {
    const again = await post("admin", `/advisory/admin/advisors/${a1Id}/reject`, { notes: "A second rejection reason." });
    expect(again.status).toBe(409);
    const ev = await events(a1Id);
    expect(ev.filter((e) => e.type === "REJECTED")).toHaveLength(1);
    expect((await notifications(a1Id)).filter((n) => n.kind === "APPLICANT_REJECTED")).toHaveLength(1);
    expect((await advisorRow("a1")).reviewNotes).toMatch(/clinical licence/);
  });

  // ---- decisions: approval --------------------------------------------------------------------------------------------------------------

  let a4Id = "";
  let a4Slug = "";

  it("approving activates the profile, lists it publicly, records the note, and emails the applicant (mock)", async () => {
    expect((await apply("a4", form(`Dr. Approved ${tag}`), { cv: pdf("a4") })).status).toBe(201);
    const pre = await advisorRow("a4");
    a4Id = pre.id;
    a4Slug = pre.slug;
    const r = await post("admin", `/advisory/admin/advisors/${a4Id}/approve`, { notes: "Credentials checked against the SCFHS register." });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe("APPROVED");

    const row = await advisorRow("a4");
    expect(row).toMatchObject({ status: "APPROVED", reviewedByUserId: idOf.get("admin"), reviewNotes: "Credentials checked against the SCFHS register." });
    const ev = await events(a4Id);
    expect(ev.filter((e) => e.type === "APPROVED")).toHaveLength(1);
    expect(ev.find((e) => e.type === "APPROVED")).toMatchObject({ actorRole: "ADMIN", fromStatus: "PENDING_REVIEW", toStatus: "APPROVED", note: "Credentials checked against the SCFHS register." });
    expect((await notifications(a4Id)).filter((n) => n.kind === "APPLICANT_APPROVED")).toEqual([{ kind: "APPLICANT_APPROVED", mode: "mock", recipient: "APPLICANT", subject: "Your RUWĀD Advisor Application Has Been Approved", result: "mock" }]);
    expect(sendTransactional).not.toHaveBeenCalled();

    // Public directory: visible, and without anything private.
    const list = (await get(null, "/advisory/advisors")).body as { id: string }[];
    expect(list.map((a) => a.id)).toContain(a4Slug);
    const profile = JSON.stringify((await get(null, `/advisory/advisors/${a4Slug}`)).body);
    for (const secret of [`applicant-${tag}@example.test`, "+966 55 123 4567", "ADV-", "SCFHS", "reviewNotes", "contactEmail", "applicationReference", "phone"]) expect(profile).not.toContain(secret);
  });

  it("the approval note stays internal; the approved advisor gets the dashboard and can set up availability and services", async () => {
    const mine = (await get("a4", "/advisory/advisor/me")).body.advisor;
    expect(mine.status).toBe("APPROVED");
    expect(mine.reviewNotes).toBeNull();
    expect(mine.application).toMatchObject({ stage: "APPROVED", rejectionReason: null });
    expect(JSON.stringify(mine)).not.toContain("SCFHS");
    expect((await get("a4", "/advisory/advisor/bookings")).status).toBe(200);
    const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" }));
    expect((await auth("a4", request(app.getHttpServer()).put("/api/advisory/advisor/availability")).send({ windows: week })).status).toBe(200);
    expect((await post("a4", "/advisory/advisor/services", { typeId: "specialist", name: "Clinical review", description: "A focused review.", minutes: 30 })).status).toBe(201);
  });

  it("a decision can't be processed twice, even at the same instant", async () => {
    expect((await post("admin", `/advisory/admin/advisors/${a4Id}/approve`, {})).status).toBe(409);
    expect((await post("admin", `/advisory/admin/advisors/${a4Id}/reject`, { notes: "Changed my mind about this." })).status).toBe(409); // approved can't be rejected

    expect((await apply("a5", form(`Dr. Race ${tag} B`), { cv: pdf("a5") })).status).toBe(201);
    const id = (await advisorRow("a5")).id;
    const results = await Promise.all([post("admin", `/advisory/admin/advisors/${id}/approve`, {}), post("superAdmin", `/advisory/admin/advisors/${id}/approve`, {}), post("admin", `/advisory/admin/advisors/${id}/approve`, {})]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    const ev = await events(id);
    expect(ev.filter((e) => e.type === "APPROVED")).toHaveLength(1);
    expect((await notifications(id)).filter((n) => n.kind === "APPLICANT_APPROVED")).toHaveLength(1);

    expect((await apply("a6", form(`Dr. Race ${tag} C`), { cv: pdf("a6") })).status).toBe(201);
    const id6 = (await advisorRow("a6")).id;
    const mixed = await Promise.all([post("admin", `/advisory/admin/advisors/${id6}/approve`, {}), post("superAdmin", `/advisory/admin/advisors/${id6}/reject`, { notes: "Rejecting at the same moment." })]);
    expect(mixed.map((r) => r.status).sort()).toEqual([201, 409]); // exactly one decision wins
    const decided = (await events(id6)).filter((e) => e.type === "APPROVED" || e.type === "REJECTED");
    expect(decided).toHaveLength(1);
    const emails = (await notifications(id6)).filter((n) => n.kind !== "ADMIN_NEW_APPLICATION");
    expect(emails).toHaveLength(1);
    expect(emails[0]!.kind).toBe(decided[0]!.type === "APPROVED" ? "APPLICANT_APPROVED" : "APPLICANT_REJECTED");
  });

  it("an email failure doesn't undo or hide a decision", async () => {
    expect((await apply("a7", form(`Dr. Mailfail ${tag}`), { cv: pdf("a7") })).status).toBe(201);
    const id = (await advisorRow("a7")).id;
    const spy = jest.spyOn(app.get(AdvisoryApplicationNotifier), "approved").mockRejectedValueOnce(new Error("provider down"));
    const r = await post("admin", `/advisory/admin/advisors/${id}/approve`, {});
    spy.mockRestore();
    expect(r.status).toBe(201);
    expect(r.body.status).toBe("APPROVED");
    expect((await advisorRow("a7")).status).toBe("APPROVED");
    expect((await events(id)).filter((e) => e.type === "APPROVED")).toHaveLength(1);
  });

  it("suspension keeps its own rules: it needs an approved advisor and doesn't send an application email", async () => {
    expect((await post("admin", `/advisory/admin/advisors/${a4Id}/suspend`, { notes: "Under review." })).status).toBe(201);
    expect((await get(null, "/advisory/advisors")).body.map((a: { id: string }) => a.id)).not.toContain(a4Slug);
    expect((await notifications(a4Id)).filter((n) => n.kind === "APPLICANT_REJECTED")).toHaveLength(0);
    expect((await post("admin", `/advisory/admin/advisors/${a4Id}/suspend`, {})).status).toBe(409);
    expect((await events(a4Id)).some((e) => e.type === "SUSPENDED")).toBe(true);
    // Reinstating isn't an application decision, so there is no second "approved" email.
    expect((await post("admin", `/advisory/admin/advisors/${a4Id}/approve`, {})).status).toBe(201);
    expect((await notifications(a4Id)).filter((n) => n.kind === "APPLICANT_APPROVED")).toHaveLength(1);
  });

  it("the Advisors tab's existing approve/reject routes enforce the same rules", async () => {
    expect((await apply("a8", form(`Dr. Legacy ${tag}`), { cv: pdf("a8") })).status).toBe(201);
    const id = (await advisorRow("a8")).id;
    expect((await get("admin", `/advisory/admin/advisors?status=PENDING_REVIEW`)).body.some((a: { id: string }) => a.id === id)).toBe(true);
    expect((await post("admin", `/advisory/admin/advisors/${id}/reject`, {})).status).toBe(400);
    expect((await post("admin", `/advisory/admin/advisors/${id}/reject`, { notes: "Not a fit for the network at present." })).status).toBe(201);
  });

  // ---- Edit & Reapply -----------------------------------------------------------------------------------------------------------------------

  describe("Edit & Reapply", () => {
    let r1Id = "";
    let r1Ref = "";
    const oldCv = pdf("r1-old-cv");
    const newCv = pdf("r1-NEW-cv");
    const reason1 = "We could not verify your licence from the documents provided.";

    it("needs a signed-in owner of a REJECTED application: nobody else, nothing else", async () => {
      expect((await reapply(null, form("Nobody"), { cv: pdf() })).status).toBe(401);
      expect((await reapply("bystander", form("Nobody"), { cv: pdf() })).status).toBe(404); // no application at all
    });

    it("can't be used while an application is pending, or after it was approved", async () => {
      expect((await apply("r1", form(`Dr. Reapply ${tag}`, { institution: "Old Institute" }), { cv: oldCv, certificates: [pdf("r1-cert-a"), pdf("r1-cert-b")], photo: png })).status).toBe(201);
      const row = await advisorRow("r1");
      r1Id = row.id;
      r1Ref = row.applicationReference;
      const pending = await reapply("r1", form("Dr. Too Early"), { cv: pdf() });
      expect(pending.status).toBe(409);
      expect(pending.body.message).toMatch(/already been submitted/);
      // an approved advisor (a4, approved above) has nothing to reapply
      expect((await reapply("a4", form("Dr. Approved Again"), { cv: pdf() })).status).toBe(409);
    });

    it("the rejected applicant sees the reason, may reapply, and has their answers and documents to edit", async () => {
      expect((await reject(r1Id, reason1)).status).toBe(201);
      const me = (await get("r1", "/advisory/advisor/me")).body.advisor;
      const a = me.application;
      expect(a).toMatchObject({ stage: "REJECTED", canReapply: true, rejectionReason: reason1, attempts: 1, reference: r1Ref });
      expect(a.rejections).toHaveLength(1);
      expect(a.form).toMatchObject({ email: `applicant-${tag}@example.test`, phone: "+966 55 123 4567", preferredMinutes: 45, consultationServices: "Clinical validation reviews", linkedinUrl: "https://www.linkedin.com/in/layla-test" });
      expect(a.documents.map((d: { kind: string }) => d.kind).sort()).toEqual(["CERTIFICATE", "CERTIFICATE", "CV", "PHOTO"]);
      expect(a.documents.every((d: { id: string }) => /^[0-9a-f-]{36}$/.test(d.id))).toBe(true);
      expect(me.profile.institution).toBe("Old Institute");
    });

    it("refuses a bad update without changing anything: wrong files, someone else's document, no CV left, too many certificates, missing declaration", async () => {
      const before = await docsOf(r1Id);
      const cv = before.find((d) => d.kind === "CV")!;
      const certs = before.filter((d) => d.kind === "CERTIFICATE");
      const other = await advisorRow("a4");
      const foreign = (await docsOf(other.id))[0]!;
      const bad: [string, object, Files][] = [
        ["wrong CV type", form("Dr. X"), { cv: pdf(), cvName: "cv.docx" }],
        ["a fake PDF", form("Dr. X"), { cv: Buffer.from("MZ not a pdf"), cvName: "cv.pdf" }],
        ["a foreign document id", { ...form("Dr. X"), removeDocumentIds: [foreign.id] }, {}],
        ["removing the CV without a new one", { ...form("Dr. X"), removeDocumentIds: [cv.id] }, {}],
        ["more than five certificates in total", form("Dr. X"), { certificates: [pdf("1"), pdf("2"), pdf("3"), pdf("4")] }],
        ["declaration not ticked", { ...form("Dr. X"), declaration: false }, {}],
        ["an invalid email", { ...form("Dr. X"), email: "nope" }, {}],
        ["an unknown field (status)", { ...form("Dr. X"), status: "APPROVED" }, {}],
      ];
      for (const [label, data, files] of bad) {
        const res = await reapply("r1", data, files);
        expect({ label, status: res.status }).toEqual({ label, status: 400 });
      }
      const huge = await reapply("r1", form("Dr. X"), { cv: Buffer.concat([pdf(), Buffer.alloc(2 * 1024 * 1024 + 10)]) });
      expect(huge.status).toBe(413);
      expect(certs).toHaveLength(2);
      expect((await advisorRow("r1")).status).toBe("REJECTED");
      expect((await docsOf(r1Id)).map((d) => d.id)).toEqual(before.map((d) => d.id));
      expect((await events(r1Id)).some((e) => e.type === "RESUBMITTED")).toBe(false);
    });

    it("an email failure doesn't lose the resubmission", async () => {
      const spy = jest.spyOn(app.get(AdvisoryApplicationNotifier), "reapplication").mockRejectedValueOnce(new Error("mail server down"));
      const before = await docsOf(r1Id);
      const certA = before.find((d) => d.kind === "CERTIFICATE")!;
      const res = await reapply("r1", { ...form(`Dr. Reapply ${tag}`, { institution: "New Institute", yearsExperience: 15, about: "Updated biography: fifteen years of clinical practice and research, now including regulatory work for device companies." }), removeDocumentIds: [certA.id] }, { cv: newCv });
      spy.mockRestore();
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ reference: r1Ref, status: "PENDING_REVIEW", attempt: 2 });
      expect((await advisorRow("r1")).status).toBe("PENDING_REVIEW");
    });

    it("moves back to PENDING_REVIEW with the updates applied, documents replaced, and the history intact", async () => {
      const row = await advisorRow("r1");
      expect(row).toMatchObject({ status: "PENDING_REVIEW", reviewNotes: null, reviewedAt: null, reviewedByUserId: null, institution: "New Institute", yearsExperience: 15, applicationReference: r1Ref, affiliationVerified: false });
      expect(row.about).toContain("Updated biography");

      const docs = await docsOf(r1Id);
      expect(docs.map((d) => d.kind).sort()).toEqual(["CERTIFICATE", "CV", "PHOTO"]); // one certificate removed, CV replaced, photo kept
      expect(docs.find((d) => d.kind === "CV")!.data.equals(newCv)).toBe(true);
      expect(docs.some((d) => d.data.equals(oldCv))).toBe(false); // the replaced CV is gone

      const ev = await events(r1Id);
      expect(ev.map((e) => e.type === "NOTIFICATION" ? `N:${(e.details as { kind: string }).kind}` : e.type)).toEqual([
        "SUBMITTED", "N:ADMIN_NEW_APPLICATION", "REJECTED", "N:APPLICANT_REJECTED", "RESUBMITTED",
      ]); // the failed email left no notification row, but the resubmission is there
      const rejected = ev.find((e) => e.type === "REJECTED")!;
      expect(rejected.note).toBe(reason1); // the earlier reason is untouched
      const re = ev.find((e) => e.type === "RESUBMITTED")!;
      expect(re).toMatchObject({ actorRole: "APPLICANT", actorUserId: idOf.get("r1"), fromStatus: "REJECTED", toStatus: "PENDING_REVIEW" });
      expect(re.details).toMatchObject({ attempt: 2, reference: r1Ref });
    });

    it("the applicant's status shows it is under review again and keeps the earlier reason for reference", async () => {
      const a = (await get("r1", "/advisory/advisor/me")).body.advisor.application;
      expect(a).toMatchObject({ stage: "PENDING_REVIEW", canReapply: false, rejectionReason: null, attempts: 2, decidedAt: null });
      expect(a.rejections).toEqual([{ at: expect.any(String), reason: reason1 }]);
      expect(a.timeline.map((t: { type: string }) => t.type)).toEqual(["SUBMITTED", "REJECTED", "RESUBMITTED"]);
      expect((await reapply("r1", form("Dr. Again"), { cv: pdf() })).status).toBe(409); // pending: no duplicate
    });

    it("tells the administrator (mock mode), who sees it flagged as resubmitted with the full history", async () => {
      // the previous test's email failed on purpose; a second round proves the notification path
      const id2 = await (async () => {
        expect((await apply("r2", form(`Dr. Second ${tag}`), { cv: pdf("r2") })).status).toBe(201);
        const id = (await advisorRow("r2")).id;
        expect((await reject(id, "Please include evidence of clinical practice.")).status).toBe(201);
        const res = await reapply("r2", form(`Dr. Second ${tag}`, { institution: "Second Institute" }), {});
        expect(res.status).toBe(201);
        return id;
      })();
      const n = await notifications(id2);
      expect(n.map((x) => x.kind)).toEqual(["ADMIN_NEW_APPLICATION", "APPLICANT_REJECTED", "ADMIN_REAPPLICATION"]);
      expect(n[2]).toEqual({ kind: "ADMIN_REAPPLICATION", mode: "mock", recipient: "ADMIN", subject: "Updated Advisor Application – RUWĀD Advisory Services", result: "mock" });
      expect(sendTransactional).not.toHaveBeenCalled();

      const list = (await get("admin", "/advisory/admin/applications?status=PENDING_REVIEW")).body.applications as { id: string; resubmissions: number }[];
      expect(list.find((a) => a.id === id2)!.resubmissions).toBe(1);
      expect(list.find((a) => a.id === r1Id)!.resubmissions).toBe(1);
      const detail = (await get("admin", `/advisory/admin/applications/${id2}`)).body;
      expect(detail.history.map((h: { type: string }) => h.type)).toEqual(["SUBMITTED", "NOTIFICATION", "REJECTED", "NOTIFICATION", "RESUBMITTED", "NOTIFICATION"]);
      expect(detail.history.find((h: { type: string }) => h.type === "REJECTED").note).toBe("Please include evidence of clinical practice.");
    });

    it("the administrator can download the NEW CV (and the old one is no longer reachable)", async () => {
      const d = (await get("admin", `/advisory/admin/applications/${r1Id}`)).body;
      const cv = d.documents.find((x: { kind: string }) => x.kind === "CV");
      const bin = (r: request.Test) => r.buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on("data", (c: Buffer) => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks))); });
      const got = await bin(get("admin", `/advisory/admin/applications/${r1Id}/documents/${cv.id}`));
      expect(got.status).toBe(200);
      expect((got.body as Buffer).equals(newCv)).toBe(true);
      expect(d.documents).toHaveLength(3);
      expect((await get("a1", `/advisory/admin/applications/${r1Id}/documents/${cv.id}`)).status).toBe(403);
    });

    it("two resubmissions at the same instant produce exactly one, and one email to the administrator", async () => {
      expect((await apply("r3", form(`Dr. Third ${tag}`), { cv: pdf("r3") })).status).toBe(201);
      const id = (await advisorRow("r3")).id;
      expect((await reject(id, "Your biography needs more detail about your practice.")).status).toBe(201);
      const results = await Promise.all([reapply("r3", form(`Dr. Third ${tag}`), {}), reapply("r3", form(`Dr. Third ${tag}`), {})]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect((await events(id)).filter((e) => e.type === "RESUBMITTED")).toHaveLength(1);
      expect((await notifications(id)).filter((n) => n.kind === "ADMIN_REAPPLICATION")).toHaveLength(1);
      expect((await advisorRow("r3")).status).toBe("PENDING_REVIEW");
      expect((await db.query(`SELECT count(*)::int AS n FROM advisory_advisors WHERE "userId" = $1`, [idOf.get("r3")])).rows[0].n).toBe(1);
    });

    it("an administrator who approves the resubmission puts the updated advisor in the public directory", async () => {
      expect((await get(null, "/advisory/advisors")).body.map((a: { id: string }) => a.id)).not.toContain((await advisorRow("r1")).slug); // not yet
      const approve = await post("admin", `/advisory/admin/advisors/${r1Id}/approve`, { notes: "Updated documents verified." });
      expect(approve.status).toBe(201);
      const row = await advisorRow("r1");
      expect(row.status).toBe("APPROVED");
      const dir = (await get(null, "/advisory/advisors")).body as { id: string; institution: string; yearsExperience: number }[];
      const listed = dir.find((a) => a.id === row.slug)!;
      expect(listed).toMatchObject({ institution: "New Institute", yearsExperience: 15 });
      expect((await notifications(r1Id)).filter((n) => n.kind === "APPLICANT_APPROVED")).toHaveLength(1);
      const ev = (await events(r1Id)).filter((e) => e.type !== "NOTIFICATION").map((e) => e.type);
      expect(ev).toEqual(["SUBMITTED", "REJECTED", "RESUBMITTED", "APPROVED"]);
      // after approval, reapplying is no longer possible, and the applicant has the dashboard
      expect((await reapply("r1", form("Dr. Late"), {})).status).toBe(409);
      expect((await get("r1", "/advisory/advisor/bookings")).status).toBe(200);
    });

    it("a second rejection after reapplying works the same way, and the full chain of reasons is kept", async () => {
      const id = (await advisorRow("r2")).id;
      expect((await reject(id, "Still unable to confirm your clinical practice.")).status).toBe(201);
      const a = (await get("r2", "/advisory/advisor/me")).body.advisor.application;
      expect(a).toMatchObject({ stage: "REJECTED", canReapply: true, attempts: 2, rejectionReason: "Still unable to confirm your clinical practice." });
      expect(a.rejections.map((r: { reason: string }) => r.reason)).toEqual(["Please include evidence of clinical practice.", "Still unable to confirm your clinical practice."]);
      expect((await reapply("r2", form(`Dr. Second ${tag}`), {})).status).toBe(201);
      expect((await advisorRow("r2")).status).toBe("PENDING_REVIEW");
    });
  });

  // ---- live mode (still with a fake provider) -------------------------------------------------------------------------------------------

  it("LIVE mode with a fake provider: RUWĀD's inbox gets the new-application email with a sign-in link and no documents", async () => {
    const built = await build({ ADVISORY_EMAIL_MODE: "live" });
    live = built.app;
    const userId = await makeUser("liveApplicant");
    tokenOf.set("liveApplicant", built.jwt.sign({ sub: userId, email: `app-it-${tag}-liveApplicant@example.test`, role: "USER" }));
    const res = await apply("liveApplicant", form(`Dr. Live ${tag}`, { email: `live-${tag}@example.test` }), { cv: pdf("live"), certificates: [pdf("c")], photo: png }, live);
    expect(res.status).toBe(201);
    expect(sendTransactional).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendTransactional.mock.calls[0] as [string, string, string];
    expect(to).toBe("ruwadplatform@gmail.com");
    expect(subject).toBe("New Advisor Application – RUWĀD Advisory Services");
    expect(html).toContain(res.body.reference);
    expect(html).toContain(`live-${tag}@example.test`);
    const row = await advisorRow("liveApplicant");
    expect(html).toContain(`https://app.ruwad.test/admin/advisory?application=${row.id}`);
    expect(html).not.toMatch(/\.pdf|\.png|documents\//);

    // The decision emails go to the address on the form.
    sendTransactional.mockClear();
    const admin = built.jwt.sign({ sub: idOf.get("admin"), email: `app-it-${tag}-admin@example.test`, role: "RUWAD_ADMIN" });
    const rej = await request(live.getHttpServer()).post(`/api/advisory/admin/advisors/${row.id}/reject`).set("Authorization", `Bearer ${admin}`).send({ notes: "Thank you, but we need more evidence of clinical practice." });
    expect(rej.status).toBe(201);
    const [to2, subject2, html2] = sendTransactional.mock.calls[0] as [string, string, string];
    expect(to2).toBe(`live-${tag}@example.test`);
    expect(subject2).toBe("Update on Your RUWĀD Advisor Application");
    expect(html2).toContain("we need more evidence of clinical practice");
    expect((await notifications(row.id)).map((n) => `${n.kind}:${n.result}`)).toEqual(["ADMIN_NEW_APPLICATION:sent", "APPLICANT_REJECTED:sent"]);

    // Reapplying: RUWĀD's inbox is told, with the earlier reason, and still no document in the email.
    sendTransactional.mockClear();
    const again = await reapply("liveApplicant", form(`Dr. Live ${tag}`, { email: `live-${tag}@example.test`, institution: "Live Institute 2" }), {}, live);
    expect(again.status).toBe(201);
    expect(sendTransactional).toHaveBeenCalledTimes(1);
    const [to3, subject3, html3] = sendTransactional.mock.calls[0] as [string, string, string];
    expect(to3).toBe("ruwadplatform@gmail.com");
    expect(subject3).toBe("Updated Advisor Application – RUWĀD Advisory Services");
    expect(html3).toContain("we need more evidence of clinical practice");
    expect(html3).toContain(`https://app.ruwad.test/admin/advisory?application=${row.id}`);
    expect(html3).not.toMatch(/\.pdf|\.png|documents\//);
    expect((await notifications(row.id)).map((n) => `${n.kind}:${n.result}`)).toEqual(["ADMIN_NEW_APPLICATION:sent", "APPLICANT_REJECTED:sent", "ADMIN_REAPPLICATION:sent"]);
  });
});
