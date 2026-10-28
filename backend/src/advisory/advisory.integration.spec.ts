/* eslint-disable @typescript-eslint/no-var-requires */
import { randomUUID } from "crypto";
import { INestApplication, Logger, ValidationPipe } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { Test } from "@nestjs/testing";
import { TypeOrmModule, getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import request from "supertest";
import { JwtStrategy } from "../auth/jwt.strategy";
import { UsersModule } from "../users/users.module";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const passport = require("passport");
import { EmailService } from "../email/email.service";
import { AdvisoryAutomationService, AdvisoryAutomationService as AutomationService } from "./advisory-automation.service";
import { AdvisoryAttendanceService } from "./advisory-attendance.service";
import { AdvisoryMeetingService } from "./advisory-meeting.service";
import { AdvisoryNotifier } from "./advisory-notifier";
import { MockVideoProvider } from "./video/mock-video-provider";
import { VIDEO_PROVIDER } from "./video/video-provider";
import * as http from "http";
import { AdvisoryBooking } from "./advisory.entities";
import { AdvisoryModule } from "./advisory.module";
import { addDays, riyadhDate, ymdKey } from "./advisory-time";
import { signDailyWebhook } from "./attendance-logic";

const { assertLocalDatabase, LOCAL_DATABASE_URL } = require("../../scripts/dev/local-db-guard");
// pg ships no type declarations and this repo has no @types/pg; these are only used for fixtures and raw SQL in this spec.
const { Client, Pool } = require("pg");

/** INTEGRATION TESTS against the LOCAL embedded Postgres (npm run db:local, port 55432). They are skipped unless ADVISORY_INTEGRATION=1 (use
 * `npm run test:advisory`), and refuse to run against any database that is not on this machine. They create their own users, startups, advisors
 * and bookings, and delete every row they created afterwards. Nothing here can reach the hosted database. */
const RUN = process.env.ADVISORY_INTEGRATION === "1";
const suite = RUN ? describe : describe.skip;

const SECRET = "advisory-integration-test-secret-not-a-real-one";
const tag = randomUUID().slice(0, 8);

suite("Advisory Services — integration (local Postgres)", () => {
  let app: INestApplication;
  let db: InstanceType<typeof Client>;
  let pool: InstanceType<typeof Pool>;
  let jwt: JwtService;
  const sendTransactional = jest.fn();

  const created = { users: [] as string[], startups: [] as string[], advisors: [] as string[] };
  const tokenOf = new Map<string, string>();

  const api = (who: string | null) => {
    const auth = (r: request.Test) => (who ? r.set("Authorization", `Bearer ${tokenOf.get(who)}`) : r);
    const base = () => request(app.getHttpServer());
    return {
      get: (p: string) => auth(base().get(`/api${p}`)),
      post: (p: string, body: object = {}) => auth(base().post(`/api${p}`)).send(body),
      put: (p: string, body: object = {}) => auth(base().put(`/api${p}`)).send(body),
      patch: (p: string, body: object = {}) => auth(base().patch(`/api${p}`)).send(body),
      del: (p: string) => auth(base().delete(`/api${p}`)),
      /** The application endpoint: multipart, the form as JSON in `data`, plus optional files. */
      apply: (form: object, files: { cv?: Buffer; certificates?: Buffer[]; photo?: Buffer } = {}, names: { cv?: string; photo?: string } = {}) => {
        let r = auth(base().post("/api/advisory/advisor/apply")).field("data", JSON.stringify(form));
        if (files.cv) r = r.attach("cv", files.cv, names.cv ?? "cv.pdf");
        (files.certificates ?? []).forEach((c, i) => { r = r.attach("certificates", c, `cert-${i}.pdf`); });
        if (files.photo) r = r.attach("photo", files.photo, names.photo ?? "me.png");
        return r;
      },
    };
  };

  async function makeUser(name: string, role = "USER") {
    const email = `adv-it-${tag}-${name}@example.test`;
    const { rows } = await db.query(`INSERT INTO users ("firstName","lastName",email,"passwordHash",role) VALUES ($1,$2,$3,$4,$5) RETURNING id`, ["IT", name, email, "x", role]);
    const id = rows[0].id as string;
    created.users.push(id);
    tokenOf.set(name, jwt.sign({ sub: id, email, role }));
    return id;
  }

  /** Clones an existing local startup row under a new id/slug/name, so these tests don't have to know every required startup column. */
  async function makeStartup(name: string) {
    const { rows, fields } = await db.query(`SELECT * FROM startups LIMIT 1`);
    if (!rows[0]) throw new Error("The local database has no startups to clone for a fixture.");
    const row = { ...rows[0], id: randomUUID(), slug: `it-${tag}-${name}`, name: `IT ${name} ${tag}` };
    const jsonCols = new Set(fields.filter((f: { dataTypeID: number; name: string }) => f.dataTypeID === 114 || f.dataTypeID === 3802).map((f: { name: string }) => f.name));
    const cols = Object.keys(row);
    const vals = cols.map((c) => (jsonCols.has(c) && row[c] !== null ? JSON.stringify(row[c]) : row[c]));
    await db.query(`INSERT INTO startups (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")})`, vals);
    created.startups.push(row.id);
    return row.id as string;
  }

  const member = (userId: string, startupId: string, role: string) =>
    db.query(`INSERT INTO entity_memberships ("userId",kind,"entityId",role) VALUES ($1,'STARTUP',$2,$3)`, [userId, startupId, role]);

  /** A valid application through the real endpoint (multipart: the form as JSON plus a tiny but genuine PDF). */
  const pdf = Buffer.from(["%PDF-1.4", "1 0 obj<<>>endobj", "trailer<<>>", "%%EOF", ""].join("\n"));
  const application = (name: string, over: Record<string, unknown> = {}) => ({
    name, email: `apply-${tag}@example.test`, phone: "+966 55 123 4567", designation: "Tester", institution: "Test Institute", location: "Riyadh, Saudi Arabia", specialization: "Testing",
    specializations: ["Testing"], yearsExperience: 12, about: "An integration-test advisor profile created by an automated test, long enough to pass the biography check.",
    researchAreas: ["Integration testing"], declaration: true, ...over,
  });
  const applyAs = (who: string, name: string) => api(who).apply(application(name), { cv: pdf });

  let ids: Record<string, string> = {};
  let advSlug = "";
  let advId = "";
  let svc30 = "";
  let svc60 = "";
  let demoSlug = "";
  let demoSvc = "";
  let startupA = "";
  let startupB = "";
  let startupForEditor = "";

  /** The Nth day from today in Riyadh as a key; every test uses its own day so none of them touch another's slots. */
  const day = (n: number) => ymdKey(addDays(riyadhDate(new Date()), n));
  const slots = async (slug: string, serviceId: string, date: string) => (await api(null).get(`/advisory/advisors/${slug}/slots?serviceId=${serviceId}&date=${date}`)).body.slots as { time: string; startsAt: string }[];
  const book = (who: string, startupId: string, startsAt: string, serviceId = svc30, advisor = advSlug, extra: object = {}) =>
    api(who).post("/advisory/bookings", { advisor, serviceId, startupId, startsAt, ...extra });

  async function buildApp(enabled: boolean, extra: Record<string, string> = {}) {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET: SECRET, ADVISORY_ENABLED: enabled ? "true" : undefined, ADVISORY_EMAIL_MODE: "mock", NODE_ENV: "test", ...extra })] }),
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
    // Passport keeps ONE global strategy named "jwt", and JwtStrategy now looks the account up in the database. When an extra app built here is closed its
    // connection goes away, so hand the strategy back to the main app or its next request fails with "Driver not Connected". (Production runs one app per process.)
    const closeApp = a.close.bind(a);
    a.close = async () => { await closeApp(); if (app && app !== a) passport.use("jwt", app.get(JwtStrategy) as never); };
    return { app: a, jwt: moduleRef.get(JwtService) };
  }

  beforeAll(async () => {
    const url = assertLocalDatabase(LOCAL_DATABASE_URL);
    db = new Client({ connectionString: url });
    await db.connect();
    pool = new Pool({ connectionString: url, max: 14 });
    const built = await buildApp(true);
    app = built.app;
    jwt = built.jwt;

    ids = {
      owner: await makeUser("owner"), adminMember: await makeUser("adminMember"), editor: await makeUser("editor"), outsider: await makeUser("outsider"),
      owner2: await makeUser("owner2"), advisorUser: await makeUser("advisorUser"), otherAdvisorUser: await makeUser("otherAdvisorUser"), pendingAdvisorUser: await makeUser("pendingAdvisorUser"),
      admin: await makeUser("admin", "RUWAD_ADMIN"),
    };
    startupA = await makeStartup("A");
    startupB = await makeStartup("B");
    startupForEditor = await makeStartup("E");
    await member(ids.owner!, startupA, "OWNER");
    await member(ids.adminMember!, startupA, "ADMIN");
    await member(ids.editor!, startupA, "EDITOR");
    await member(ids.owner2!, startupB, "OWNER");
    await member(ids.editor!, startupForEditor, "EDITOR");

    // The real onboarding flow, through the API: apply → administrator approves → advisor sets hours and services.
    const applied = await applyAs("advisorUser", `Dr. Itest ${tag}`);
    expect(applied.status).toBe(201);
    advId = (await db.query(`SELECT id, slug FROM advisory_advisors WHERE "userId" = $1`, [ids.advisorUser])).rows[0].id;
    advSlug = (await db.query(`SELECT slug FROM advisory_advisors WHERE id = $1`, [advId])).rows[0].slug;
    created.advisors.push(advId);
    expect((await api("admin").post(`/advisory/admin/advisors/${advId}/approve`, { notes: "ok" })).status).toBe(201);
    const week = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" }));
    expect((await api("advisorUser").put("/advisory/advisor/availability", { windows: week })).status).toBe(200);
    svc30 = (await api("advisorUser").post("/advisory/advisor/services", { typeId: "specialist", name: "Itest 30", description: "thirty", minutes: 30 })).body.id;
    svc60 = (await api("advisorUser").post("/advisory/advisor/services", { typeId: "advisory", name: "Itest 60", description: "sixty", minutes: 60 })).body.id;

    await applyAs("otherAdvisorUser", `Dr. Other ${tag}`);
    const other = (await db.query(`SELECT id FROM advisory_advisors WHERE "userId" = $1`, [ids.otherAdvisorUser])).rows[0].id;
    created.advisors.push(other);
    await api("admin").post(`/advisory/admin/advisors/${other}/approve`, {});
    await applyAs("pendingAdvisorUser", `Dr. Pending ${tag}`);
    created.advisors.push((await db.query(`SELECT id FROM advisory_advisors WHERE "userId" = $1`, [ids.pendingAdvisorUser])).rows[0].id);

    // A demonstration advisor of our own (not the seeded six), flagged isDemo with no user account.
    demoSlug = `it-demo-${tag}`;
    const demo = (await db.query(
      `INSERT INTO advisory_advisors (slug,name,institution,"institutionFull",designation,location,specialization,expertise,about,"isDemo",status)
       VALUES ($1,'Dr. Demo It','Demo','Demo Institute','Demo','Riyadh','Demo','Demo','A fictional demonstration profile.',true,'APPROVED') RETURNING id`, [demoSlug])).rows[0].id as string;
    created.advisors.push(demo);
    demoSvc = (await db.query(`INSERT INTO advisory_services ("advisorId","typeId",name,description,minutes) VALUES ($1,'specialist','Demo 30','d',30) RETURNING id`, [demo])).rows[0].id;
    for (let wd = 0; wd < 7; wd++) await db.query(`INSERT INTO advisory_availability_rules ("advisorId",weekday,"startTime","endTime") VALUES ($1,$2,'09:00','17:00')`, [demo, wd]);
  }, 120_000);

  afterAll(async () => {
    const adv = created.advisors;
    if (db && adv.length) {
      await db.query(`DELETE FROM advisory_meeting_attendance WHERE "bookingId" IN (SELECT id FROM advisory_bookings WHERE "advisorId" = ANY($1))`, [adv]);
      await db.query(`DELETE FROM advisory_booking_events WHERE "bookingId" IN (SELECT id FROM advisory_bookings WHERE "advisorId" = ANY($1))`, [adv]);
      await db.query(`DELETE FROM advisory_bookings WHERE "advisorId" = ANY($1)`, [adv]);
      await db.query(`DELETE FROM advisory_availability_exceptions WHERE "advisorId" = ANY($1)`, [adv]);
      await db.query(`DELETE FROM advisory_availability_rules WHERE "advisorId" = ANY($1)`, [adv]);
      await db.query(`DELETE FROM advisory_services WHERE "advisorId" = ANY($1)`, [adv]);
      await db.query(`DELETE FROM advisory_application_documents WHERE "advisorId" = ANY($1)`, [adv]);
      await db.query(`DELETE FROM advisory_application_events WHERE "advisorId" = ANY($1)`, [adv]);
      await db.query(`DELETE FROM advisory_advisors WHERE id = ANY($1)`, [adv]);
    }
    if (db) await db.query(`DELETE FROM advisory_webhook_events WHERE id LIKE $1 OR id LIKE $2`, [`${tag}-%`, `%|${tag}-%`]);
    if (db && created.users.length) await db.query(`DELETE FROM entity_memberships WHERE "userId" = ANY($1)`, [created.users]);
    if (db && created.startups.length) await db.query(`DELETE FROM startups WHERE id = ANY($1)`, [created.startups]);
    if (db && created.users.length) await db.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    await app?.close();
    await pool?.end();
    await db?.end();
  });

  // ---- slots and a successful booking ---------------------------------------------------------------------------------------------------------

  it("serves real-time slots to anyone, and a held slot disappears for everyone", async () => {
    const d = day(3);
    const before = await slots(advSlug, svc30, d);
    expect(before.length).toBeGreaterThan(8);
    const res = await book("owner", startupA, before[0]!.startsAt);
    expect(res.status).toBe(201);
    const after = await slots(advSlug, svc30, d);
    expect(after.map((s) => s.startsAt)).not.toContain(before[0]!.startsAt);
    expect(after.length).toBe(before.length - 1);
  });

  it("books successfully: PENDING, with a reference, the chosen startup and an audit trail", async () => {
    const [s] = await slots(advSlug, svc30, day(4));
    const res = await book("owner", startupA, s!.startsAt, svc30, advSlug, { description: "  We would like to discuss our device.  " });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "PENDING", serviceName: "Itest 30", minutes: 30, startupId: startupA, isDemo: false, description: "We would like to discuss our device." });
    expect(res.body.reference).toMatch(/^ADV-[A-Z2-9]{6}$/);
    const detail = await api("owner").get(`/advisory/bookings/${res.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.viewerRole).toBe("FOUNDER");
    expect(detail.body.history.map((h: { type: string }) => h.type)).toEqual(expect.arrayContaining(["CREATED", "NOTIFICATION"]));
    const mine = await api("owner").get("/advisory/bookings/mine");
    expect(mine.body.map((b: { id: string }) => b.id)).toContain(res.body.id);
  });

  it("an ADMIN member of the startup may book too, and sees the booking in their list", async () => {
    const [s] = await slots(advSlug, svc30, day(5));
    const res = await book("adminMember", startupA, s!.startsAt);
    expect(res.status).toBe(201);
    expect((await api("owner").get("/advisory/bookings/mine")).body.map((b: { id: string }) => b.id)).toContain(res.body.id); // a fellow member sees it
  });

  it("lists only startups the caller may book for", async () => {
    expect((await api("owner").get("/advisory/my-startups")).body.map((s: { id: string }) => s.id)).toEqual([startupA]);
    expect((await api("editor").get("/advisory/my-startups")).body).toEqual([]);
    expect((await api("outsider").get("/advisory/my-startups")).body).toEqual([]);
  });

  // ---- security ---------------------------------------------------------------------------------------------------------------------------------

  it("refuses an unauthenticated booking, and unauthenticated access to every protected area", async () => {
    const [s] = await slots(advSlug, svc30, day(6));
    expect((await api(null).post("/advisory/bookings", { advisor: advSlug, serviceId: svc30, startupId: startupA, startsAt: s!.startsAt })).status).toBe(401);
    expect((await api(null).get("/advisory/bookings/mine")).status).toBe(401);
    expect((await api(null).get("/advisory/advisor/me")).status).toBe(401);
    expect((await api(null).get("/advisory/admin/advisors")).status).toBe(401);
  });

  it("refuses a booking without startup ownership: outsider, EDITOR, a different startup, and an unknown startup", async () => {
    const [s] = await slots(advSlug, svc30, day(6));
    expect((await book("outsider", startupA, s!.startsAt)).status).toBe(403);
    expect((await book("editor", startupA, s!.startsAt)).status).toBe(403); // member, but only an EDITOR
    expect((await book("owner", startupB, s!.startsAt)).status).toBe(403); // owns A, not B
    expect((await book("owner", randomUUID(), s!.startsAt)).status).toBe(404);
    expect((await slots(advSlug, svc30, day(6))).map((x) => x.startsAt)).toContain(s!.startsAt); // none of those held the slot
  });

  it("validates input server-side: bad shapes, unknown fields, off-grid and past times, an unavailable service", async () => {
    const [s] = await slots(advSlug, svc30, day(6));
    expect((await api("owner").post("/advisory/bookings", { advisor: advSlug, serviceId: "nope", startupId: startupA, startsAt: s!.startsAt })).status).toBe(400);
    expect((await api("owner").post("/advisory/bookings", { advisor: advSlug, serviceId: svc30, startupId: startupA, startsAt: "tomorrow" })).status).toBe(400);
    expect((await api("owner").post("/advisory/bookings", { advisor: advSlug, serviceId: svc30, startupId: startupA, startsAt: s!.startsAt, role: "ADMIN" })).status).toBe(400); // unknown field
    expect((await book("owner", startupA, s!.startsAt, svc30, advSlug, { description: "x".repeat(1001) })).status).toBe(400);
    const offGrid = new Date(new Date(s!.startsAt).getTime() + 15 * 60_000).toISOString();
    expect((await book("owner", startupA, offGrid)).status).toBe(409);
    expect((await book("owner", startupA, new Date(Date.now() - 86_400_000).toISOString())).status).toBe(409);
    expect((await book("owner", startupA, new Date(Date.now() + 30 * 60_000).toISOString())).status).toBe(409); // inside the two-hour notice
    expect((await book("owner", startupA, s!.startsAt, randomUUID())).status).toBe(404);
    expect((await book("owner", startupA, s!.startsAt, svc30, "no-such-advisor")).status).toBe(404);
    expect((await api(null).get(`/advisory/advisors/${advSlug}/slots?serviceId=${svc30}&date=2026-02-31`)).status).toBe(400);
  });

  it("an advisor can't book themselves", async () => {
    const own = await makeStartup("own");
    await member(ids.advisorUser!, own, "OWNER");
    const [s] = await slots(advSlug, svc30, day(7));
    expect((await book("advisorUser", own, s!.startsAt)).status).toBe(403);
  });

  // ---- double booking and concurrency --------------------------------------------------------------------------------------------------------

  it("refuses a double booking, including an overlapping slot of a different length", async () => {
    const d = day(8);
    const s30 = await slots(advSlug, svc30, d);
    const first = await book("owner", startupA, s30[2]!.startsAt); // 10:00 + 30
    expect(first.status).toBe(201);
    expect((await book("owner2", startupB, s30[2]!.startsAt)).status).toBe(409); // the same slot
    const s60 = await slots(advSlug, svc60, d);
    const start10 = s60.find((s) => s.startsAt === s30[2]!.startsAt);
    expect(start10).toBeUndefined(); // a 60-minute slot at 10:00 isn't offered: it would overlap
    const clash = new Date(new Date(s30[2]!.startsAt).getTime() - 30 * 60_000).toISOString(); // 09:30 + 60 min overlaps 10:00
    expect((await book("owner2", startupB, clash, svc60)).status).toBe(409);
  });

  it("the DATABASE refuses overlapping holds on its own, even if the server's checks were bypassed", async () => {
    const [s] = await slots(advSlug, svc30, day(9));
    const start = new Date(s!.startsAt);
    const insert = (startsAt: Date, endsAt: Date, status = "PENDING") => pool.query(
      `INSERT INTO advisory_bookings (reference,"groupId","advisorId","serviceId","startupId","requestedByUserId","startsAt","endsAt",minutes,"serviceName","serviceTypeId","startupName",status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,30,'x','specialist','x',$9)`, [`DB-${randomUUID().slice(0, 8)}`, randomUUID(), advId, svc30, startupA, ids.owner, startsAt, endsAt, status]);
    await insert(start, new Date(start.getTime() + 30 * 60_000));
    await expect(insert(new Date(start.getTime() + 10 * 60_000), new Date(start.getTime() + 40 * 60_000))).rejects.toMatchObject({ code: "23P01" });
    await insert(new Date(start.getTime() + 30 * 60_000), new Date(start.getTime() + 60 * 60_000)); // adjacent: fine
    await insert(start, new Date(start.getTime() + 30 * 60_000), "CANCELLED"); // a cancelled booking holds nothing
  });

  it("concurrent requests for one slot produce exactly one booking", async () => {
    const [s] = await slots(advSlug, svc30, day(10));
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? book("owner", startupA, s!.startsAt) : book("owner2", startupB, s!.startsAt))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(11); // everyone else is told the slot is gone, never a 500
    const held = await db.query(`SELECT count(*)::int n FROM advisory_bookings WHERE "advisorId" = $1 AND "startsAt" = $2 AND status IN ('PENDING','CONFIRMED')`, [advId, s!.startsAt]);
    expect(held.rows[0].n).toBe(1);
  });

  it("concurrent raw inserts (no server checks at all) also yield exactly one winner", async () => {
    const [s] = await slots(advSlug, svc30, day(11));
    const start = new Date(s!.startsAt);
    const attempts = await Promise.allSettled(Array.from({ length: 12 }, () => pool.query(
      `INSERT INTO advisory_bookings (reference,"groupId","advisorId","serviceId","startupId","requestedByUserId","startsAt","endsAt",minutes,"serviceName","serviceTypeId","startupName",status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,30,'x','specialist','x','PENDING')`, [`RACE-${randomUUID().slice(0, 7)}`, randomUUID(), advId, svc30, startupA, ids.owner, start, new Date(start.getTime() + 30 * 60_000)])));
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    for (const a of attempts) if (a.status === "rejected") expect((a.reason as { code: string }).code).toBe("23P01");
  });

  // ---- approval, rejection ------------------------------------------------------------------------------------------------------------------

  it("the advisor approves; nobody else can", async () => {
    const [s] = await slots(advSlug, svc30, day(12));
    const b = (await book("owner", startupA, s!.startsAt)).body;
    expect((await api("owner").post(`/advisory/advisor/bookings/${b.id}/approve`)).status).toBe(403); // a founder
    expect((await api("outsider").post(`/advisory/advisor/bookings/${b.id}/approve`)).status).toBe(403);
    expect((await api("otherAdvisorUser").post(`/advisory/advisor/bookings/${b.id}/approve`)).status).toBe(403); // an approved advisor, but not this one's
    expect((await api("admin").post(`/advisory/advisor/bookings/${b.id}/approve`)).status).toBe(403); // not an advisor, so can't even reach the route
    expect((await api("advisorUser").post(`/advisory/advisor/bookings/${b.id}/approve`)).status).toBe(201);
    expect((await api("owner").get(`/advisory/bookings/${b.id}`)).body.booking.status).toBe("CONFIRMED");
    expect((await api("advisorUser").post(`/advisory/advisor/bookings/${b.id}/approve`)).status).toBe(409); // not twice
  });

  it("the advisor rejects with a note; the slot is released and the founder sees the decision", async () => {
    const [s] = await slots(advSlug, svc30, day(13));
    const b = (await book("owner", startupA, s!.startsAt)).body;
    expect((await slots(advSlug, svc30, day(13))).map((x) => x.startsAt)).not.toContain(s!.startsAt);
    const rej = await api("advisorUser").post(`/advisory/advisor/bookings/${b.id}/reject`, { note: "Outside my expertise" });
    expect(rej.status).toBe(201);
    expect(rej.body).toMatchObject({ status: "REJECTED", decisionNote: "Outside my expertise" });
    expect((await slots(advSlug, svc30, day(13))).map((x) => x.startsAt)).toContain(s!.startsAt);
    expect((await api("owner").post(`/advisory/advisor/bookings/${b.id}/approve`)).status).toBe(403);
    expect((await api("advisorUser").post(`/advisory/advisor/bookings/${b.id}/approve`)).status).toBe(409); // a rejected booking is final
  });

  it("an unapproved (pending) advisor can't use advisor endpoints, and isn't in the public directory", async () => {
    expect((await api("pendingAdvisorUser").get("/advisory/advisor/bookings")).status).toBe(403);
    expect((await api("pendingAdvisorUser").put("/advisory/advisor/availability", { windows: [] })).status).toBe(403);
    const me = await api("pendingAdvisorUser").get("/advisory/advisor/me");
    expect(me.body.advisor.status).toBe("PENDING_REVIEW");
    const list = (await api(null).get("/advisory/advisors")).body as { name: string }[];
    expect(list.some((a) => a.name.includes(`Pending ${tag}`))).toBe(false);
    expect(list.some((a) => a.name.includes(`Itest ${tag}`))).toBe(true);
  });

  // ---- cancellation ------------------------------------------------------------------------------------------------------------------------

  it("a founder cancels; the slot returns; a stranger can't; a cancelled booking can't be cancelled again", async () => {
    const [s] = await slots(advSlug, svc30, day(14));
    const b = (await book("owner", startupA, s!.startsAt)).body;
    expect((await api("outsider").post(`/advisory/bookings/${b.id}/cancel`, { reason: "x" })).status).toBe(403);
    expect((await api("editor").post(`/advisory/bookings/${b.id}/cancel`, {})).status).toBe(403); // can see it, can't change it
    const res = await api("owner").post(`/advisory/bookings/${b.id}/cancel`, { reason: "Plans changed" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "CANCELLED", cancelledBy: "FOUNDER", cancelReason: "Plans changed" });
    expect((await slots(advSlug, svc30, day(14))).map((x) => x.startsAt)).toContain(s!.startsAt);
    expect((await api("owner").post(`/advisory/bookings/${b.id}/cancel`, {})).status).toBe(409);
  });

  it("the advisor and an administrator can cancel too, recorded under their own role", async () => {
    const s = await slots(advSlug, svc30, day(15));
    const b1 = (await book("owner", startupA, s[0]!.startsAt)).body;
    const b2 = (await book("owner", startupA, s[1]!.startsAt)).body;
    expect((await api("advisorUser").post(`/advisory/bookings/${b1.id}/cancel`, { reason: "Unwell" })).body).toMatchObject({ status: "CANCELLED", cancelledBy: "ADVISOR" });
    expect((await api("admin").post(`/advisory/admin/bookings/${b2.id}/cancel`, { reason: "Policy" })).body).toMatchObject({ status: "CANCELLED", cancelledBy: "ADMIN" });
  });

  // ---- the directory's Next Available -----------------------------------------------------------------------------------------------------

  const directoryEntry = async (slug: string) => ((await api(null).get("/advisory/advisors")).body as { id: string; nextAvailable: { startsAt: string; minutes: number } | null }[]).find((a) => a.id === slug);

  it("Next Available is the first slot the booking calendar really offers, and booking it moves it on (then cancelling gives it back)", async () => {
    const first = (await directoryEntry(advSlug))!.nextAvailable!;
    expect(first.minutes).toBe(30); // the advisor's shortest service
    const dates = (await api(null).get(`/advisory/advisors/${advSlug}/dates?serviceId=${svc30}`)).body.dates as string[];
    expect((await slots(advSlug, svc30, dates[0]!))[0]!.startsAt).toBe(first.startsAt);

    const booked = await book("owner", startupA, first.startsAt);
    expect(booked.status).toBe(201);
    const after = (await directoryEntry(advSlug))!.nextAvailable!;
    expect(new Date(after.startsAt).getTime()).toBeGreaterThan(new Date(first.startsAt).getTime());
    expect(after.startsAt).not.toBe(first.startsAt);
    const firstDayAfter = (await api(null).get(`/advisory/advisors/${advSlug}/dates?serviceId=${svc30}`)).body.dates[0] as string;
    expect((await slots(advSlug, svc30, firstDayAfter))[0]!.startsAt).toBe(after.startsAt); // still agrees with the calendar

    expect((await api("owner").post(`/advisory/bookings/${booked.body.id}/cancel`, {})).status).toBe(201);
    expect((await directoryEntry(advSlug))!.nextAvailable!.startsAt).toBe(first.startsAt);
  });

  it("Next Available skips a day the advisor has taken off, and comes back when the time off is removed", async () => {
    const first = (await directoryEntry(advSlug))!.nextAvailable!;
    const firstDay = (await api(null).get(`/advisory/advisors/${advSlug}/dates?serviceId=${svc30}`)).body.dates[0] as string;
    const off = await api("advisorUser").post("/advisory/advisor/availability/time-off", { date: firstDay, reason: "Conference" });
    expect(off.status).toBe(201);
    const moved = (await directoryEntry(advSlug))!.nextAvailable!;
    expect(moved.startsAt).not.toBe(first.startsAt);
    expect(new Date(moved.startsAt).getTime()).toBeGreaterThan(new Date(first.startsAt).getTime() + 3 * 3_600_000);
    const entry = off.body.timeOff.find((t: { date: string }) => t.date === firstDay);
    expect((await api("advisorUser").del(`/advisory/advisor/availability/time-off/${entry.id}`)).status).toBe(200);
    expect((await directoryEntry(advSlug))!.nextAvailable!.startsAt).toBe(first.startsAt);
  });

  it("an advisor with no active service has no Next Available, and a suspended one isn't listed at all", async () => {
    const other = (await db.query(`SELECT slug FROM advisory_advisors WHERE "userId" = $1`, [ids.otherAdvisorUser])).rows[0].slug as string;
    expect((await directoryEntry(other))!.nextAvailable).toBeNull(); // approved, but nothing to book yet
    expect((await directoryEntry("no-such-advisor"))).toBeUndefined();
  });

  // ---- rescheduling by mutual agreement ----------------------------------------------------------------------------------------------------

  async function confirmed(dayN: number, idx = 0, serviceId = svc30, who = "owner", startup = startupA) {
    const s = await slots(advSlug, serviceId, day(dayN));
    const b = (await book(who, startup, s[idx]!.startsAt, serviceId)).body;
    expect((await api("advisorUser").post(`/advisory/advisor/bookings/${b.id}/approve`)).status).toBe(201);
    return b as { id: string; startsAt: string };
  }
  const slotOf = async (who: string, id: string, n: number, idx: number) => (await api(who).get(`/advisory/bookings/${id}/reschedule/slots?date=${day(n)}`)).body.slots[idx] as { startsAt: string };

  it("a founder's proposal keeps the original CONFIRMED and holds the new time; the founder can't accept their own proposal; an admin can't either; the advisor can", async () => {
    const b = await confirmed(16, 0);
    const target = await slotOf("owner", b.id, 17, 3);
    const prop = await api("owner").post(`/advisory/bookings/${b.id}/reschedule`, { startsAt: target.startsAt, note: "Clash with a demo day" });
    expect(prop.status).toBe(201);
    expect(prop.body.status).toBe("CONFIRMED"); // the original is untouched
    expect(prop.body.startsAt).toBe(b.startsAt);
    expect(prop.body.pendingReschedule).toMatchObject({ startsAt: target.startsAt, proposedBy: "FOUNDER" });
    // the original time is still reserved, and so is the proposed one
    expect((await slots(advSlug, svc30, day(16))).map((x) => x.startsAt)).not.toContain(b.startsAt);
    expect((await slots(advSlug, svc30, day(17))).map((x) => x.startsAt)).not.toContain(target.startsAt);
    // neither the proposer nor an administrator can confirm it for the other side
    expect((await api("owner").post(`/advisory/bookings/${b.id}/reschedule/accept`)).status).toBe(403);
    expect((await api("adminMember").post(`/advisory/bookings/${b.id}/reschedule/accept`)).status).toBe(403);
    expect((await api("admin").post(`/advisory/bookings/${b.id}/reschedule/accept`)).status).toBe(403);
    expect((await api("outsider").post(`/advisory/bookings/${b.id}/reschedule/accept`)).status).toBe(403);
    expect((await api("otherAdvisorUser").post(`/advisory/bookings/${b.id}/reschedule/accept`)).status).toBe(403);
    expect((await api("owner").get(`/advisory/bookings/${b.id}`)).body.booking.status).toBe("CONFIRMED");
    // the advisor accepts: now (and only now) the times swap, atomically
    const acc = await api("advisorUser").post(`/advisory/bookings/${b.id}/reschedule/accept`);
    expect(acc.status).toBe(201);
    expect(acc.body).toMatchObject({ status: "CONFIRMED", startsAt: target.startsAt });
    expect(acc.body.reference).toMatch(/-R\d+$/);
    const old = await api("owner").get(`/advisory/bookings/${b.id}`);
    expect(old.body.booking.status).toBe("RESCHEDULED");
    expect(old.body.history.map((h: { type: string }) => h.type)).toEqual(expect.arrayContaining(["CREATED", "CONFIRMED", "RESCHEDULE_PROPOSED", "RESCHEDULE_ACCEPTED"]));
    expect((await slots(advSlug, svc30, day(16))).map((x) => x.startsAt)).toContain(b.startsAt); // the old time is free again
  });

  it("an advisor's proposal needs the FOUNDER's acceptance; the advisor can't accept their own, nor can an administrator", async () => {
    const b = await confirmed(18, 0);
    const target = await slotOf("advisorUser", b.id, 19, 2);
    const prop = await api("advisorUser").post(`/advisory/bookings/${b.id}/reschedule`, { startsAt: target.startsAt });
    expect(prop.status).toBe(201);
    expect(prop.body.pendingReschedule.proposedBy).toBe("ADVISOR");
    expect((await api("advisorUser").post(`/advisory/bookings/${b.id}/reschedule/accept`)).status).toBe(403);
    expect((await api("admin").post(`/advisory/bookings/${b.id}/reschedule/accept`)).status).toBe(403);
    expect((await api("editor").post(`/advisory/bookings/${b.id}/reschedule/accept`)).status).toBe(403); // an EDITOR is not a party who can act
    expect((await api("owner").get(`/advisory/bookings/${b.id}`)).body.booking.status).toBe("CONFIRMED");
    const acc = await api("adminMember").post(`/advisory/bookings/${b.id}/reschedule/accept`); // any OWNER/ADMIN of the startup may answer
    expect(acc.status).toBe(201);
    expect(acc.body.startsAt).toBe(target.startsAt);
  });

  it("a declined proposal leaves the original CONFIRMED and frees the proposed time", async () => {
    const b = await confirmed(20, 0);
    const target = await slotOf("owner", b.id, 21, 1);
    await api("owner").post(`/advisory/bookings/${b.id}/reschedule`, { startsAt: target.startsAt });
    expect((await api("owner").post(`/advisory/bookings/${b.id}/reschedule/decline`)).status).toBe(403); // the proposer can't "decline" their own
    const dec = await api("advisorUser").post(`/advisory/bookings/${b.id}/reschedule/decline`, { note: "Not that day" });
    expect(dec.status).toBe(201);
    expect(dec.body).toMatchObject({ status: "CONFIRMED", startsAt: b.startsAt, pendingReschedule: null });
    expect((await slots(advSlug, svc30, day(21))).map((x) => x.startsAt)).toContain(target.startsAt);
    expect((await api("advisorUser").post(`/advisory/bookings/${b.id}/reschedule/accept`)).status).toBe(404); // nothing left to accept
  });

  it("the proposer can withdraw; only the proposer can", async () => {
    const b = await confirmed(22, 0);
    const target = await slotOf("advisorUser", b.id, 23, 1);
    await api("advisorUser").post(`/advisory/bookings/${b.id}/reschedule`, { startsAt: target.startsAt });
    expect((await api("owner").post(`/advisory/bookings/${b.id}/reschedule/withdraw`)).status).toBe(403);
    const w = await api("advisorUser").post(`/advisory/bookings/${b.id}/reschedule/withdraw`);
    expect(w.status).toBe(201);
    expect(w.body.pendingReschedule).toBeNull();
    expect((await slots(advSlug, svc30, day(23))).map((x) => x.startsAt)).toContain(target.startsAt);
  });

  it("only one proposal can be open at a time, and the other side can't pile on", async () => {
    const b = await confirmed(24, 0);
    const t1 = await slotOf("owner", b.id, 25, 1);
    const t2 = await slotOf("owner", b.id, 25, 5);
    expect((await api("owner").post(`/advisory/bookings/${b.id}/reschedule`, { startsAt: t1.startsAt })).status).toBe(201);
    expect((await api("owner").post(`/advisory/bookings/${b.id}/reschedule`, { startsAt: t2.startsAt })).status).toBe(409);
    expect((await api("advisorUser").post(`/advisory/bookings/${b.id}/reschedule`, { startsAt: t2.startsAt })).status).toBe(409);
  });

  it("a proposal can overlap the booking it would replace (a 30-minute shift), but never another booking", async () => {
    const b = await confirmed(26, 4, svc60);
    const shifted = new Date(new Date(b.startsAt).getTime() + 30 * 60_000).toISOString();
    expect((await api("owner").post(`/advisory/bookings/${b.id}/reschedule`, { startsAt: shifted })).status).toBe(201);
    // someone else can't take the shifted time while it's held
    expect((await book("owner2", startupB, shifted, svc60)).status).toBe(409);
    // …nor can a second booking be proposed onto another booking's time
    const other = await confirmed(26, 10, svc60, "owner2", startupB);
    const b2 = await confirmed(27, 0);
    expect((await api("owner").post(`/advisory/bookings/${b2.id}/reschedule`, { startsAt: other.startsAt })).status).toBe(409);
  });

  it("only a CONFIRMED booking can be rescheduled; a pending request can't, nor can an outsider", async () => {
    const s = await slots(advSlug, svc30, day(28));
    const pending = (await book("owner", startupA, s[0]!.startsAt)).body;
    expect((await api("owner").post(`/advisory/bookings/${pending.id}/reschedule`, { startsAt: s[3]!.startsAt })).status).toBe(409);
    const b = await confirmed(29, 0);
    const t = await slotOf("owner", b.id, 30, 2);
    expect((await api("outsider").post(`/advisory/bookings/${b.id}/reschedule`, { startsAt: t.startsAt })).status).toBe(403);
    expect((await api("outsider").get(`/advisory/bookings/${b.id}/reschedule/slots?date=${day(30)}`)).status).toBe(403);
    expect((await api("owner").post(`/advisory/bookings/${b.id}/reschedule`, { startsAt: b.startsAt })).status).toBe(400); // the same time
    expect((await api("owner").post(`/advisory/bookings/${b.id}/reschedule`, { startsAt: "2020-01-01T00:00:00Z" })).status).toBe(409); // not an offered slot
  });

  it("cancelling the original closes its open proposal and releases both times", async () => {
    const b = await confirmed(31, 0);
    const t = await slotOf("owner", b.id, 32, 2);
    await api("owner").post(`/advisory/bookings/${b.id}/reschedule`, { startsAt: t.startsAt });
    expect((await api("owner").post(`/advisory/bookings/${b.id}/cancel`, { reason: "Dropping it" })).status).toBe(201);
    expect((await slots(advSlug, svc30, day(31))).map((x) => x.startsAt)).toContain(b.startsAt);
    expect((await slots(advSlug, svc30, day(32))).map((x) => x.startsAt)).toContain(t.startsAt);
    const open = await db.query(`SELECT count(*)::int n FROM advisory_bookings WHERE "rescheduledFromId" = $1 AND status = 'RESCHEDULE_PROPOSED'`, [b.id]);
    expect(open.rows[0].n).toBe(0);
  });

  // ---- timezone, history, visibility -------------------------------------------------------------------------------------------------------

  it("times are exact instants in UTC and the slot list is in Riyadh time (UTC+3)", async () => {
    const s = await slots(advSlug, svc30, day(33));
    expect(s[0]!.time).toBe("09:00");
    expect(new Date(s[0]!.startsAt).getUTCHours()).toBe(6); // 09:00 Riyadh = 06:00 UTC
    const b = (await book("owner", startupA, s[0]!.startsAt)).body;
    expect(new Date(b.startsAt).toISOString()).toBe(s[0]!.startsAt);
    expect((await api(null).get(`/advisory/advisors/${advSlug}/slots?serviceId=${svc30}&date=${day(33)}`)).body.timeZone).toBe("Asia/Riyadh");
  });

  it("keeps a complete, ordered history, and notifications are mocked (nothing was emailed)", async () => {
    const b = await confirmed(34, 0);
    const t = await slotOf("owner", b.id, 35, 0);
    await api("owner").post(`/advisory/bookings/${b.id}/reschedule`, { startsAt: t.startsAt });
    await api("advisorUser").post(`/advisory/bookings/${b.id}/reschedule/accept`);
    const history = (await api("owner").get(`/advisory/bookings/${b.id}`)).body.history as { type: string; createdAt: string; details: { mode?: string } | null; actorRole: string }[];
    const types = history.map((h) => h.type);
    expect(types.indexOf("CREATED")).toBeLessThan(types.indexOf("CONFIRMED"));
    expect(types.indexOf("RESCHEDULE_PROPOSED")).toBeLessThan(types.indexOf("RESCHEDULE_ACCEPTED"));
    expect([...history].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((h) => h.type)).toEqual(types);
    const notes = history.filter((h) => h.type === "NOTIFICATION");
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((n) => n.details?.mode === "mock" && n.actorRole === "SYSTEM")).toBe(true);
    expect(JSON.stringify(history)).not.toContain("example.test"); // no email addresses in the audit trail
    expect(sendTransactional).not.toHaveBeenCalled();
  });

  it("booking details are private to the participants and administrators", async () => {
    const b = await confirmed(36, 0);
    expect((await api("owner").get(`/advisory/bookings/${b.id}`)).status).toBe(200);
    expect((await api("editor").get(`/advisory/bookings/${b.id}`)).status).toBe(200); // a startup member can read
    expect((await api("advisorUser").get(`/advisory/bookings/${b.id}`)).status).toBe(200);
    expect((await api("admin").get(`/advisory/bookings/${b.id}`)).status).toBe(200);
    expect((await api("outsider").get(`/advisory/bookings/${b.id}`)).status).toBe(404);
    expect((await api("owner2").get(`/advisory/bookings/${b.id}`)).status).toBe(404);
    expect((await api("otherAdvisorUser").get(`/advisory/bookings/${b.id}`)).status).toBe(404);
    expect((await api("outsider").get("/advisory/bookings/mine")).body.map((x: { id: string }) => x.id)).not.toContain(b.id);
    expect((await api("advisorUser").get("/advisory/advisor/bookings")).body.map((x: { id: string }) => x.id)).toContain(b.id);
    expect((await api("otherAdvisorUser").get("/advisory/advisor/bookings")).body.map((x: { id: string }) => x.id)).not.toContain(b.id);
    expect((await api("owner").get("/advisory/bookings/not-a-uuid")).status).toBe(400);
  });

  it("the advisor marks a consultation completed only after it has ended", async () => {
    const b = await confirmed(37, 0);
    expect((await api("advisorUser").post(`/advisory/advisor/bookings/${b.id}/complete`)).status).toBe(409); // still in the future
    // make it a past consultation directly in the local DB, then complete it
    await db.query(`UPDATE advisory_bookings SET "startsAt" = now() - interval '2 hours', "endsAt" = now() - interval '90 minutes' WHERE id = $1`, [b.id]);
    expect((await api("owner").post(`/advisory/advisor/bookings/${b.id}/complete`)).status).toBe(403);
    const done = await api("advisorUser").post(`/advisory/advisor/bookings/${b.id}/complete`);
    expect(done.status).toBe(201);
    expect(done.body.status).toBe("COMPLETED");
    expect((await api("owner").post(`/advisory/bookings/${b.id}/cancel`, {})).status).toBe(409);
  });

  // ---- advisor self-management ------------------------------------------------------------------------------------------------------------

  it("availability: overlapping windows are refused; time off removes slots and can be removed again", async () => {
    expect((await api("advisorUser").put("/advisory/advisor/availability", { windows: [{ weekday: 1, startTime: "09:00", endTime: "12:00" }, { weekday: 1, startTime: "11:00", endTime: "13:00" }] })).status).toBe(400);
    expect((await api("advisorUser").put("/advisory/advisor/availability", { windows: [{ weekday: 1, startTime: "12:00", endTime: "09:00" }] })).status).toBe(400);
    expect((await api("advisorUser").put("/advisory/advisor/availability", { windows: [{ weekday: 9, startTime: "09:00", endTime: "10:00" }] })).status).toBe(400);
    const d = day(40);
    expect((await slots(advSlug, svc30, d)).length).toBeGreaterThan(0);
    const off = await api("advisorUser").post("/advisory/advisor/availability/time-off", { date: d, reason: "Conference" });
    expect(off.status).toBe(201);
    expect(await slots(advSlug, svc30, d)).toEqual([]);
    expect((await api("advisorUser").del(`/advisory/advisor/availability/time-off/${off.body.timeOff[0].id}`)).status).toBe(200);
    expect((await slots(advSlug, svc30, d)).length).toBeGreaterThan(0);
    expect((await api("advisorUser").post("/advisory/advisor/availability/time-off", { date: d, startTime: "10:00" })).status).toBe(400); // both times or neither
    expect((await api("owner").get("/advisory/advisor/availability")).status).toBe(403);
  });

  it("services: update and deactivate; a deactivated service can't be booked, and existing bookings keep their snapshot", async () => {
    const created = (await api("advisorUser").post("/advisory/advisor/services", { typeId: "review", name: "Temp service", description: "temporary", minutes: 45 })).body;
    const s = await slots(advSlug, created.id, day(38));
    const b = (await book("owner", startupA, s[0]!.startsAt, created.id)).body;
    expect((await api("advisorUser").patch(`/advisory/advisor/services/${created.id}`, { name: "Renamed" })).body.name).toBe("Renamed");
    expect((await api("advisorUser").del(`/advisory/advisor/services/${created.id}`)).body.active).toBe(false);
    expect((await book("owner", startupA, s[1]!.startsAt, created.id)).status).toBe(404);
    expect((await api("owner").get(`/advisory/bookings/${b.id}`)).body.booking.serviceName).toBe("Temp service"); // the snapshot
    expect((await api("owner").post("/advisory/advisor/services", { typeId: "review", name: "x", description: "y", minutes: 30 })).status).toBe(403);
    expect((await api("advisorUser").post("/advisory/advisor/services", { typeId: "bogus", name: "x", description: "y", minutes: 30 })).status).toBe(400);
    expect((await api("advisorUser").post("/advisory/advisor/services", { typeId: "review", name: "x", description: "y", minutes: 5 })).status).toBe(400);
  });

  it("an advisor can edit their profile; changing the institution clears any verification", async () => {
    await db.query(`UPDATE advisory_advisors SET "affiliationVerified" = true WHERE id = $1`, [advId]);
    const res = await api("advisorUser").patch("/advisory/advisor/me", { institution: "Another Institute" });
    expect(res.status).toBe(200);
    expect(res.body.advisor.affiliationVerified).toBe(false);
    expect((await api("owner").patch("/advisory/advisor/me", { name: "Hacked" })).body).toEqual({ advisor: null });
    expect((await api("advisorUser").patch("/advisory/advisor/me", { status: "APPROVED" })).status).toBe(400); // can't set their own status
    expect((await applyAs("advisorUser", "Dr. Twice")).status).toBe(409);
  });

  // ---- administrators ------------------------------------------------------------------------------------------------------------------------

  it("admin endpoints are closed to everyone who isn't an administrator", async () => {
    for (const who of ["owner", "advisorUser", "editor", "outsider"]) {
      expect((await api(who).get("/advisory/admin/advisors")).status).toBe(403);
      expect((await api(who).get("/advisory/admin/stats")).status).toBe(403);
      expect((await api(who).get("/advisory/admin/bookings")).status).toBe(403);
      expect((await api(who).post(`/advisory/admin/advisors/${advId}/suspend`, {})).status).toBe(403);
    }
    expect((await api("admin").get("/advisory/admin/advisors")).status).toBe(200);
  });

  it("an administrator reviews advisors: a suspended advisor leaves the directory and can't be booked; reinstating brings them back", async () => {
    const s = await slots(advSlug, svc30, day(39));
    expect((await api("admin").post(`/advisory/admin/advisors/${advId}/suspend`, { notes: "Review" })).body.status).toBe("SUSPENDED");
    expect((await api(null).get(`/advisory/advisors/${advSlug}`)).status).toBe(404);
    expect((await api(null).get("/advisory/advisors")).body.some((a: { id: string }) => a.id === advSlug)).toBe(false);
    expect((await book("owner", startupA, s[0]!.startsAt)).status).toBe(404);
    expect((await api("advisorUser").get("/advisory/advisor/bookings")).status).toBe(403);
    expect((await api("admin").post(`/advisory/admin/advisors/${advId}/suspend`, {})).status).toBe(409); // already suspended
    expect((await api("admin").post(`/advisory/admin/advisors/${advId}/approve`, {})).body.status).toBe("APPROVED");
    expect((await api(null).get(`/advisory/advisors/${advSlug}`)).status).toBe(200);
  });

  it("only an administrator can mark an affiliation verified", async () => {
    expect((await api("advisorUser").patch(`/advisory/admin/advisors/${advId}/verification`, { affiliationVerified: true })).status).toBe(403);
    expect((await api("admin").patch(`/advisory/admin/advisors/${advId}/verification`, { affiliationVerified: true })).body.affiliationVerified).toBe(true);
    expect((await api(null).get(`/advisory/advisors/${advSlug}`)).body.affiliationVerified).toBe(true);
    await api("admin").patch(`/advisory/admin/advisors/${advId}/verification`, { affiliationVerified: false });
  });

  it("an administrator can manage an advisor's hours and services on their behalf", async () => {
    const other = (await db.query(`SELECT id FROM advisory_advisors WHERE "userId" = $1`, [ids.otherAdvisorUser])).rows[0].id;
    expect((await api("admin").put(`/advisory/admin/advisors/${other}/availability`, { windows: [{ weekday: 2, startTime: "10:00", endTime: "12:00" }] })).status).toBe(200);
    const svc = await api("admin").post(`/advisory/admin/advisors/${other}/services`, { typeId: "specialist", name: "Admin-made", description: "made by an admin", minutes: 30 });
    expect(svc.status).toBe(201);
    expect((await api("admin").patch(`/advisory/admin/advisors/${other}/services/${svc.body.id}`, { active: false })).body.active).toBe(false);
    expect((await api("owner").put(`/advisory/admin/advisors/${other}/availability`, { windows: [] })).status).toBe(403);
  });

  // ---- demonstration data ---------------------------------------------------------------------------------------------------------------------

  it("demonstration advisors are labelled; their bookings are flagged, never emailed and left out of statistics unless asked", async () => {
    const profileRes = await api(null).get(`/advisory/advisors/${demoSlug}`);
    expect(profileRes.body).toMatchObject({ isDemo: true, affiliationVerified: false, publications: [], reviews: [] });
    const s = await slots(demoSlug, demoSvc, day(12));
    const demoBooking = await book("owner", startupA, s[0]!.startsAt, demoSvc, demoSlug);
    expect(demoBooking.status).toBe(201);
    expect(demoBooking.body.isDemo).toBe(true);
    const history = (await api("owner").get(`/advisory/bookings/${demoBooking.body.id}`)).body.history as { type: string; details: { skipped?: string } | null }[];
    expect(history.find((h) => h.type === "NOTIFICATION")?.details?.skipped).toContain("demonstration");
    expect(sendTransactional).not.toHaveBeenCalled();
    const withoutDemo = (await api("admin").get("/advisory/admin/bookings")).body as { id: string }[];
    expect(withoutDemo.map((x) => x.id)).not.toContain(demoBooking.body.id);
    const withDemo = (await api("admin").get("/advisory/admin/bookings?includeDemo=true")).body as { id: string }[];
    expect(withDemo.map((x) => x.id)).toContain(demoBooking.body.id);
    const demoOn = (await api("admin").get("/advisory/admin/stats?includeDemo=true")).body;
    const demoOff = (await api("admin").get("/advisory/admin/stats")).body;
    expect(demoOff.includesDemo).toBe(false);
    expect(demoOn.bookings.total).toBeGreaterThan(demoOff.bookings.total);
    expect(demoOff.topAdvisors.every((a: { isDemo: boolean }) => !a.isDemo)).toBe(true);
  });

  it("statistics report booking and advisor counts by status", async () => {
    const st = (await api("admin").get("/advisory/admin/stats")).body;
    expect(st.bookings.total).toBeGreaterThan(0);
    expect(st.bookings.byStatus).toEqual(expect.objectContaining({ PENDING: expect.any(Number), CONFIRMED: expect.any(Number), CANCELLED: expect.any(Number), RESCHEDULED: expect.any(Number) }));
    expect(st.advisors.byStatus.APPROVED).toBeGreaterThan(0);
  });

  // ---- automation: expiry, warnings, reminders, proposal expiry (the scheduler, driven by hand at chosen moments) ---------------------------------

  const automation = () => app.get(AdvisoryAutomationService);
  const row = async (id: string) => (await db.query(`SELECT * FROM advisory_bookings WHERE id = $1`, [id])).rows[0] as Record<string, any>;
  const history = async (id: string) => (await db.query(`SELECT type, details FROM advisory_booking_events WHERE "bookingId" = $1 ORDER BY "createdAt"`, [id])).rows as { type: string; details: Record<string, any> | null }[];
  const notified = async (id: string, kind: string) => (await history(id)).filter((h) => h.type === "NOTIFICATION" && h.details?.kind === kind);
  const minutesAfter = (iso: Date | string, m: number) => new Date(new Date(iso).getTime() + m * 60_000);

  it("the scheduler is off by default, and the admin status says so", async () => {
    expect(automation().status()).toMatchObject({ schedulerEnabled: false, autoComplete: false, requestExpiryHours: 72, cutoffMinutes: 30, expiryWarningHours: 24 });
    const res = await api("admin").get("/advisory/admin/automation/status");
    expect(res.status).toBe(200);
    expect(res.body.schedulerEnabled).toBe(false);
    for (const who of ["owner", "advisorUser", "outsider"]) expect((await api(who).get("/advisory/admin/automation/status")).status).toBe(403);
    expect((await api(null).post("/advisory/admin/automation/run")).status).toBe(401);
  });

  it("a request's expiry is 72 hours after it is made, or 30 minutes before it starts if that is sooner", async () => {
    const far = (await slots(advSlug, svc30, day(50)))[0]!;
    const farBooking = (await book("owner", startupA, far.startsAt)).body;
    const farRow = await row(farBooking.id);
    expect(Math.abs(new Date(farRow.expiresAt).getTime() - new Date(farRow.createdAt).getTime() - 72 * 3_600_000)).toBeLessThan(5_000); // the app's clock vs the database's now()
    expect(farBooking.expiresAt).toBe(new Date(farRow.expiresAt).toISOString()); // the API shows it too

    const soonSlots = await slots(advSlug, svc30, day(1));
    const soon = soonSlots.at(-1)!;
    const soonBooking = (await book("owner", startupA, soon.startsAt)).body;
    const soonRow = await row(soonBooking.id);
    expect(new Date(soonRow.expiresAt).getTime()).toBe(new Date(soon.startsAt).getTime() - 30 * 60_000);
  });

  it("a dry run reports what it would do and changes nothing; the admin can run it, nobody else", async () => {
    const [s] = await slots(advSlug, svc30, day(51));
    const b = (await book("owner", startupA, s!.startsAt)).body;
    const expiresAt = (await row(b.id)).expiresAt as Date;
    const dry = await automation().runOnce(minutesAfter(expiresAt, 5), { dryRun: true });
    expect(dry.dryRun).toBe(true);
    expect(dry.references).toContain((await row(b.id)).reference);
    expect((await row(b.id)).status).toBe("PENDING"); // untouched
    expect(sendTransactional).not.toHaveBeenCalled();
    expect((await api("owner").post("/advisory/admin/automation/run")).status).toBe(403);
    const viaAdmin = await api("admin").post("/advisory/admin/automation/run");
    expect(viaAdmin.status).toBe(201);
    expect(viaAdmin.body.dryRun).toBe(true); // a dry run unless ?dryRun=false is given
  });

  it("an unanswered request expires: the slot is released, both sides are told (mock), and a late approval is refused", async () => {
    const [s] = await slots(advSlug, svc30, day(52));
    const b = (await book("owner", startupA, s!.startsAt)).body;
    const expiresAt = (await row(b.id)).expiresAt as Date;
    expect((await slots(advSlug, svc30, day(52))).map((x) => x.startsAt)).not.toContain(s!.startsAt); // held while pending

    // just before it expires: nothing happens
    await automation().runOnce(minutesAfter(expiresAt, -1), { dryRun: false });
    expect((await row(b.id)).status).toBe("PENDING");

    const report = await automation().runOnce(minutesAfter(expiresAt, 1), { dryRun: false });
    expect(report.expired).toBeGreaterThanOrEqual(1);
    expect((await row(b.id)).status).toBe("EXPIRED");
    expect((await slots(advSlug, svc30, day(52))).map((x) => x.startsAt)).toContain(s!.startsAt); // free again
    const h = await history(b.id);
    expect(h.map((e) => e.type)).toContain("EXPIRED");
    const told = await notified(b.id, "EXPIRED");
    expect(told).toHaveLength(1);
    expect(told[0]!.details).toMatchObject({ mode: "mock", recipients: expect.arrayContaining(["FOUNDER", "ADVISOR"]) });
    expect(sendTransactional).not.toHaveBeenCalled();
    expect((await api("advisorUser").post(`/advisory/advisor/bookings/${b.id}/approve`)).status).toBe(409); // too late
    expect((await api("owner").get("/advisory/bookings/mine")).body.find((x: { id: string }) => x.id === b.id).status).toBe("EXPIRED");
    expect((await book("owner", startupA, s!.startsAt)).status).toBe(201); // the founder can request the freed time again

    // running again does nothing more for it
    const again = await automation().runOnce(minutesAfter(expiresAt, 2), { dryRun: false });
    expect(again.references).not.toContain(b.reference);
    expect((await notified(b.id, "EXPIRED"))).toHaveLength(1);
  });

  it("an answered request never expires: approving it first wins", async () => {
    const [s] = await slots(advSlug, svc30, day(53));
    const b = (await book("owner", startupA, s!.startsAt)).body;
    expect((await api("advisorUser").post(`/advisory/advisor/bookings/${b.id}/approve`)).status).toBe(201);
    const expiresAt = (await row(b.id)).expiresAt as Date;
    await automation().runOnce(minutesAfter(expiresAt, 60), { dryRun: false });
    expect((await row(b.id)).status).toBe("CONFIRMED");
  });

  it("the advisor is warned once, 24 hours before a request expires", async () => {
    const [s] = await slots(advSlug, svc30, day(54));
    const b = (await book("owner", startupA, s!.startsAt)).body;
    const expiresAt = (await row(b.id)).expiresAt as Date;
    const early = await automation().runOnce(minutesAfter(expiresAt, -25 * 60), { dryRun: false });
    expect(early.references).not.toContain(b.reference); // 25 hours before: too early
    const warned = await automation().runOnce(minutesAfter(expiresAt, -23 * 60), { dryRun: false });
    expect(warned.expiryWarnings).toBeGreaterThanOrEqual(1);
    expect(warned.references).toContain(b.reference);
    expect((await row(b.id)).expiryWarningSentAt).not.toBeNull();
    const notes = await notified(b.id, "EXPIRY_WARNING");
    expect(notes).toHaveLength(1);
    expect(notes[0]!.details).toMatchObject({ recipients: ["ADVISOR"] });
    await automation().runOnce(minutesAfter(expiresAt, -22 * 60), { dryRun: false });
    expect(await notified(b.id, "EXPIRY_WARNING")).toHaveLength(1); // not repeated
    expect((await row(b.id)).status).toBe("PENDING");
  });

  it("reminders go out 24 hours and 1 hour before a confirmed consultation, once each, and not after it starts", async () => {
    const [s] = await slots(advSlug, svc30, day(55));
    const b = (await book("owner", startupA, s!.startsAt)).body;
    expect((await api("advisorUser").post(`/advisory/advisor/bookings/${b.id}/approve`)).status).toBe(201);
    const start = new Date(s!.startsAt);
    const at = (minsBefore: number) => minutesAfter(start, -minsBefore);

    expect((await automation().runOnce(at(24 * 60 + 5), { dryRun: false })).references).not.toContain(b.reference); // too early
    expect((await automation().runOnce(at(23 * 60), { dryRun: false })).reminders24h).toBeGreaterThanOrEqual(1);
    expect(await notified(b.id, "REMINDER_24H")).toHaveLength(1);
    expect((await row(b.id)).reminder24hSentAt).not.toBeNull();
    await automation().runOnce(at(20 * 60), { dryRun: false });
    expect(await notified(b.id, "REMINDER_24H")).toHaveLength(1); // once
    expect(await notified(b.id, "REMINDER_1H")).toHaveLength(0);

    expect((await automation().runOnce(at(59), { dryRun: false })).reminders1h).toBeGreaterThanOrEqual(1);
    expect(await notified(b.id, "REMINDER_1H")).toHaveLength(1);
    await automation().runOnce(at(30), { dryRun: false });
    expect(await notified(b.id, "REMINDER_1H")).toHaveLength(1);
    expect((await notified(b.id, "REMINDER_1H"))[0]!.details).toMatchObject({ mode: "mock", recipients: expect.arrayContaining(["FOUNDER", "ADVISOR"]) });
    expect(sendTransactional).not.toHaveBeenCalled();
  });

  it("a consultation confirmed after the 24-hour moment doesn't get a 24-hour reminder, but does get the 1-hour one", async () => {
    const [s] = await slots(advSlug, svc30, day(56));
    const b = (await book("owner", startupA, s!.startsAt)).body;
    expect((await api("advisorUser").post(`/advisory/advisor/bookings/${b.id}/approve`)).status).toBe(201);
    const start = new Date(s!.startsAt);
    // pretend it was approved only 10 hours before the start
    await db.query(`UPDATE advisory_bookings SET "decidedAt" = $1 WHERE id = $2`, [minutesAfter(start, -10 * 60), b.id]);
    await automation().runOnce(minutesAfter(start, -9 * 60), { dryRun: false });
    expect(await notified(b.id, "REMINDER_24H")).toHaveLength(0);
    await automation().runOnce(minutesAfter(start, -59), { dryRun: false });
    expect(await notified(b.id, "REMINDER_1H")).toHaveLength(1);
  });

  it("an unanswered reschedule proposal expires; the original stays CONFIRMED and the proposed time is released", async () => {
    const b = await confirmed(57, 0);
    const target = await slotOf("owner", b.id, 58, 2);
    expect((await api("owner").post(`/advisory/bookings/${b.id}/reschedule`, { startsAt: target.startsAt })).status).toBe(201);
    const proposal = (await db.query(`SELECT id, "expiresAt" FROM advisory_bookings WHERE "rescheduledFromId" = $1 AND status = 'RESCHEDULE_PROPOSED'`, [b.id])).rows[0];
    expect(new Date(proposal.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + 72 * 3_600_000 + 5_000);
    expect((await slots(advSlug, svc30, day(58))).map((x) => x.startsAt)).not.toContain(target.startsAt);

    const report = await automation().runOnce(minutesAfter(proposal.expiresAt, 1), { dryRun: false });
    expect(report.proposalsExpired).toBeGreaterThanOrEqual(1);
    expect((await row(proposal.id)).status).toBe("EXPIRED");
    const original = await api("owner").get(`/advisory/bookings/${b.id}`);
    expect(original.body.booking).toMatchObject({ status: "CONFIRMED", startsAt: b.startsAt, pendingReschedule: null });
    expect(original.body.history.map((h: { type: string }) => h.type)).toContain("RESCHEDULE_EXPIRED");
    expect((await slots(advSlug, svc30, day(58))).map((x) => x.startsAt)).toContain(target.startsAt);
    expect((await api("advisorUser").post(`/advisory/bookings/${b.id}/reschedule/accept`)).status).toBe(404); // nothing left to accept
    expect((await api("owner").post(`/advisory/bookings/${b.id}/reschedule`, { startsAt: target.startsAt })).status).toBe(201); // and a new one can be proposed
  });

  it("two runners at once handle every booking exactly once: no double expiry, no double email", async () => {
    const made: { id: string; reference: string }[] = [];
    for (let i = 0; i < 4; i++) {
      const s = (await slots(advSlug, svc30, day(60)))[i]!;
      made.push((await book(i % 2 ? "owner" : "owner2", i % 2 ? startupA : startupB, s.startsAt)).body);
    }
    const expiresAt = (await row(made[0]!.id)).expiresAt as Date;
    const second = new AutomationService(app.get(ConfigService), app.get(DataSource), app.get(getRepositoryToken(AdvisoryBooking)), app.get(AdvisoryNotifier), app.get(AdvisoryMeetingService), app.get(AdvisoryAttendanceService));
    const now = minutesAfter(expiresAt, 10);
    const [a, b] = await Promise.all([automation().runOnce(now, { dryRun: false }), second.runOnce(now, { dryRun: false })]);
    for (const m of made) expect((await row(m.id)).status).toBe("EXPIRED");
    const mine = (r: { references: string[] }) => r.references.filter((ref) => made.some((m) => m.reference === ref));
    expect([...mine(a), ...mine(b)].sort()).toEqual(made.map((m) => m.reference).sort()); // each one reported by exactly one runner
    for (const m of made) {
      const expiredEvents = (await db.query(`SELECT count(*)::int n FROM advisory_booking_events WHERE "bookingId" = $1 AND type = 'EXPIRED'`, [m.id])).rows[0].n;
      expect(expiredEvents).toBe(1);
      expect(await notified(m.id, "EXPIRED")).toHaveLength(1);
    }
  });

  it("demonstration bookings expire like any other, but are never emailed", async () => {
    const [s] = await slots(demoSlug, demoSvc, day(59));
    const b = (await book("owner", startupA, s!.startsAt, demoSvc, demoSlug)).body;
    const expiresAt = (await row(b.id)).expiresAt as Date;
    await automation().runOnce(minutesAfter(expiresAt, 1), { dryRun: false });
    expect((await row(b.id)).status).toBe("EXPIRED");
    const told = await notified(b.id, "EXPIRED");
    expect(told).toHaveLength(1);
    expect(told[0]!.details?.skipped).toContain("demonstration");
    expect(sendTransactional).not.toHaveBeenCalled();
  });

  // ---- video meetings: who may join, when, and with what ----------------------------------------------------------------------------------------

  const mockVideo = () => app.get(VIDEO_PROVIDER) as MockVideoProvider;
  const joinAs = (who: string, id: string) => api(who).post(`/advisory/bookings/${id}/meeting/join`);
  /** Moves a booking's consultation to "starts in 5 minutes, lasts 30", so its meeting window is open right now. */
  // Every "open now" booking holds the same real-time window for the same advisor, so each one is released (cancelled) after its test.
  const opened: string[] = [];
  const openNow = (id: string) => { opened.push(id); return db.query(`UPDATE advisory_bookings SET "startsAt" = now() + interval '5 minutes', "endsAt" = now() + interval '35 minutes' WHERE id = $1`, [id]); };
  afterEach(async () => {
    if (!opened.length) return;
    await db.query(`UPDATE advisory_bookings SET status = 'CANCELLED' WHERE id = ANY($1)`, [opened]);
    opened.length = 0;
  });

  it("a consultation that is far off isn't open yet: the status says so and joining is refused", async () => {
    const b = await confirmed(41, 0);
    const st = await api("owner").get(`/advisory/bookings/${b.id}/meeting`);
    expect(st.status).toBe(200);
    expect(st.body).toMatchObject({ state: "NOT_OPEN", canJoin: false, mode: "simulated", recording: false, available: true });
    expect(st.body.notice).toMatch(/not recorded/i);
    expect(new Date(st.body.opensAt).getTime()).toBe(new Date(b.startsAt).getTime() - 10 * 60_000);
    expect((await joinAs("owner", b.id)).status).toBe(409);
    expect((await joinAs("advisorUser", b.id)).status).toBe(409);
  });

  it("there is no meeting for a request nobody has approved, or one that was cancelled", async () => {
    const [s] = await slots(advSlug, svc30, day(42));
    const pending = (await book("owner", startupA, s!.startsAt)).body;
    await openNow(pending.id);
    expect((await api("owner").get(`/advisory/bookings/${pending.id}/meeting`)).body.state).toBe("NOT_CONFIRMED");
    expect((await joinAs("owner", pending.id)).status).toBe(409);
    expect((await joinAs("advisorUser", pending.id)).status).toBe(409);
  });

  it("when it is open, both the startup and the advisor get a short-lived single-room token; the advisor alone is owner", async () => {
    const b = await confirmed(43, 0);
    await openNow(b.id);
    const st = await api("owner").get(`/advisory/bookings/${b.id}/meeting`);
    expect(st.body).toMatchObject({ state: "OPEN", canJoin: true });

    const mine = mockVideo().tokens.length;
    const f = await joinAs("owner", b.id);
    const a = await joinAs("advisorUser", b.id);
    expect(f.status).toBe(201);
    expect(a.status).toBe(201);
    expect(f.body).toMatchObject({ mode: "simulated", roomUrl: null, recording: false });
    expect(f.body.token).not.toBe(a.body.token);
    expect(f.body.notice).toMatch(/not recorded/i);
    expect(new Date(f.body.tokenExpiresAt).getTime()).toBe(new Date(f.body.closesAt).getTime());

    const issued = mockVideo().tokens.slice(mine);
    expect(issued).toHaveLength(2);
    expect(new Set(issued.map((t) => t.roomName)).size).toBe(1); // one room for the consultation
    expect(issued.find((t) => t.userId === ids.advisorUser)!.isOwner).toBe(true);
    expect(issued.find((t) => t.userId === ids.owner)!.isOwner).toBe(false);
    for (const t of issued) expect(t.expiresAt.getTime()).toBe(new Date(f.body.closesAt).getTime());

    const stored = await row(b.id);
    expect(stored.meetingRoomName).toBe(issued[0]!.roomName);
    expect(stored.meetingRoomName).toMatch(/^ruwad-[a-z2-7]{20}$/);
    expect(stored.meetingProvider).toBe("mock");
    expect(JSON.stringify(stored)).not.toContain(f.body.token); // no token is ever stored
    const kinds = (await history(b.id)).filter((h) => h.type === "JOIN_REQUESTED");
    expect(kinds).toHaveLength(2);
  });

  it("only the advisor and the startup's owner/admin can join; members can look, strangers can't even see it", async () => {
    const b = await confirmed(44, 0);
    await openNow(b.id);
    expect((await joinAs("adminMember", b.id)).status).toBe(201); // an ADMIN member of the startup
    expect((await joinAs("editor", b.id)).status).toBe(403); // a member, but only an EDITOR
    expect((await joinAs("outsider", b.id)).status).toBe(403);
    expect((await joinAs("owner2", b.id)).status).toBe(403); // owns a different startup
    expect((await joinAs("otherAdvisorUser", b.id)).status).toBe(403); // an approved advisor, but not this one
    expect((await joinAs("admin", b.id)).status).toBe(403); // administrators oversee; they don't join
    expect((await api(null).post(`/advisory/bookings/${b.id}/meeting/join`)).status).toBe(401);

    expect((await api("editor").get(`/advisory/bookings/${b.id}/meeting`)).body).toMatchObject({ state: "OPEN", canJoin: false }); // can see, can't join
    expect((await api("admin").get(`/advisory/bookings/${b.id}/meeting`)).body.canJoin).toBe(false);
    expect((await api("outsider").get(`/advisory/bookings/${b.id}/meeting`)).status).toBe(404);
    expect((await api("owner2").get(`/advisory/bookings/${b.id}/meeting`)).status).toBe(404);
  });

  it("the window closes: after the end plus the grace period the meeting is ENDED and can't be joined", async () => {
    const b = await confirmed(45, 0);
    opened.push(b.id);
    await db.query(`UPDATE advisory_bookings SET "startsAt" = now() - interval '100 minutes', "endsAt" = now() - interval '70 minutes' WHERE id = $1`, [b.id]);
    expect((await api("owner").get(`/advisory/bookings/${b.id}/meeting`)).body).toMatchObject({ state: "ENDED", canJoin: false });
    expect((await joinAs("owner", b.id)).status).toBe(409);
    // still inside the 15 minute grace after the end: open
    await db.query(`UPDATE advisory_bookings SET "startsAt" = now() - interval '40 minutes', "endsAt" = now() - interval '10 minutes' WHERE id = $1`, [b.id]);
    expect((await joinAs("owner", b.id)).status).toBe(201);
  });

  it("a cancelled consultation can't be joined", async () => {
    const b = await confirmed(46, 0);
    expect((await api("owner").post(`/advisory/bookings/${b.id}/cancel`, { reason: "No longer needed" })).status).toBe(201);
    await openNow(b.id); // even with its time right now, a cancelled consultation has no meeting
    expect((await api("owner").get(`/advisory/bookings/${b.id}/meeting`)).body.state).toBe("NOT_CONFIRMED");
    expect((await joinAs("owner", b.id)).status).toBe(409);
    expect((await joinAs("advisorUser", b.id)).status).toBe(409);
  });

  it("both parties joining at once still produce exactly one room", async () => {
    const b = await confirmed(47, 0);
    await openNow(b.id);
    const before = mockVideo().rooms.size;
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => joinAs(i % 2 ? "owner" : "advisorUser", b.id)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    const name = (await row(b.id)).meetingRoomName as string;
    expect([...mockVideo().rooms.keys()].filter((n) => n === name)).toHaveLength(1);
    expect(mockVideo().rooms.size).toBe(before + 1);
  });

  it("a demonstration booking always gets a simulated room", async () => {
    const [s] = await slots(demoSlug, demoSvc, day(58));
    const d = (await book("owner", startupA, s!.startsAt, demoSvc, demoSlug)).body;
    opened.push(d.id);
    await db.query(`UPDATE advisory_bookings SET status = 'CONFIRMED', "startsAt" = now() + interval '5 minutes', "endsAt" = now() + interval '35 minutes' WHERE id = $1`, [d.id]);
    const res = await joinAs("owner", d.id);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ mode: "simulated", roomUrl: null });
  });

  it("the scheduler tidies up the room of a consultation that ended long ago (and a dry run changes nothing)", async () => {
    const b = await confirmed(48, 0);
    await openNow(b.id);
    await joinAs("owner", b.id);
    const name = (await row(b.id)).meetingRoomName as string;
    const longAfter = new Date(Date.now() + 5 * 3_600_000);
    const dry = await automation().runOnce(longAfter, { dryRun: true });
    expect(dry.roomsClosed).toBeGreaterThanOrEqual(1);
    expect((await row(b.id)).meetingRoomClosedAt).toBeNull();
    expect(mockVideo().deleted).not.toContain(name);

    const real = await automation().runOnce(longAfter, { dryRun: false });
    expect(real.roomsClosed).toBeGreaterThanOrEqual(1);
    expect((await row(b.id)).meetingRoomClosedAt).not.toBeNull();
    expect(mockVideo().deleted).toContain(name);
    const again = await automation().runOnce(minutesAfter(longAfter, 1), { dryRun: false });
    expect(mockVideo().deleted.filter((n) => n === name)).toHaveLength(1); // not deleted twice
    expect(again.roomsClosed).toBe(0);
  });

  it("with Daily requested but no credentials, a real booking can't start a meeting (it is NOT silently faked); a demo one still can", async () => {
    const b = await confirmed(49, 0);
    await openNow(b.id);
    const s = await buildApp(true, { ADVISORY_VIDEO_PROVIDER: "daily" });
    try {
      const call = (path: string, id: string, method: "get" | "post" = "post") => request(s.app.getHttpServer())[method](`/api/advisory/bookings/${id}${path}`).set("Authorization", `Bearer ${tokenOf.get("owner")}`).send();
      const st = await call("/meeting", b.id, "get");
      expect(st.body).toMatchObject({ available: false, canJoin: false });
      const j = await call("/meeting/join", b.id);
      expect(j.status).toBe(503);
      expect(JSON.stringify(j.body)).not.toMatch(/key|token|daily\.co/i);
    } finally { await s.app.close(); }
  });

  it("with Daily configured (a fake Daily), a real booking gets a real-mode token and URL, and a demonstration booking never reaches Daily", async () => {
    const seen: { method: string; url: string; body: any; auth?: string }[] = [];
    const fake = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = raw ? JSON.parse(raw) : undefined;
        seen.push({ method: req.method!, url: req.url!, body, auth: req.headers.authorization });
        res.setHeader("content-type", "application/json");
        if (req.url === "/v1/rooms") res.end(JSON.stringify({ name: body.name, url: `https://fake.daily.co/${body.name}` }));
        else res.end(JSON.stringify({ token: "fake-daily-token" }));
      });
    });
    await new Promise<void>((r) => fake.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(fake.address() as { port: number }).port}/v1`;
    const real = await confirmed(2, 0);
    await openNow(real.id);
    const [ds] = await slots(demoSlug, demoSvc, day(57));
    const demo = (await book("owner", startupA, ds!.startsAt, demoSvc, demoSlug)).body;
    opened.push(demo.id);
    await db.query(`UPDATE advisory_bookings SET status = 'CONFIRMED', "startsAt" = now() + interval '5 minutes', "endsAt" = now() + interval '35 minutes' WHERE id = $1`, [demo.id]);

    const s = await buildApp(true, { ADVISORY_VIDEO_PROVIDER: "daily", DAILY_API_KEY: "fake-key-for-tests", DAILY_DOMAIN: "fakedomain", DAILY_API_BASE: base });
    try {
      const join = (id: string, who: string) => request(s.app.getHttpServer()).post(`/api/advisory/bookings/${id}/meeting/join`).set("Authorization", `Bearer ${tokenOf.get(who)}`).send();
      const r = await join(real.id, "advisorUser");
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ mode: "daily", token: "fake-daily-token", recording: false });
      expect(r.body.roomUrl).toMatch(/^https:\/\/fake\.daily\.co\/ruwad-/);
      expect(seen.map((x) => `${x.method} ${x.url}`)).toEqual(["POST /v1/rooms", "POST /v1/meeting-tokens"]);
      expect(seen[0]!.auth).toBe("Bearer fake-key-for-tests");
      expect(seen[0]!.body.privacy).toBe("private");
      expect(seen[1]!.body.properties).toMatchObject({ is_owner: true, eject_at_token_exp: true });
      expect(JSON.stringify(seen)).not.toMatch(/record|transcri/i);
      expect((await row(real.id)).meetingProvider).toBe("daily");

      const before = seen.length;
      const d = await join(demo.id, "owner");
      expect(d.status).toBe(201);
      expect(d.body.mode).toBe("simulated"); // demo bookings never reach Daily, even when it is configured
      expect(seen.length).toBe(before);
    } finally {
      await s.app.close();
      await new Promise<void>((r) => fake.close(() => r()));
    }
  });

  // ---- attendance, Needs Review, and recording what happened -------------------------------------------------------------------------------------

  const WHSEC = Buffer.from("integration-test-webhook-secret-not-real").toString("base64");
  /** A CONFIRMED consultation that ended `hoursAgo` hours ago (30 minutes long). Distinct offsets keep the advisor's past bookings from overlapping. */
  const ended = async (dayN: number, hoursAgo: number) => {
    const b = await confirmed(dayN, 0);
    await db.query(`UPDATE advisory_bookings SET "startsAt" = now() - ($2::numeric * interval '1 hour'), "endsAt" = now() - ($2::numeric * interval '1 hour') + interval '30 minutes' WHERE id = $1`, [b.id, hoursAgo]);
    return b;
  };
  const presence = (id: string, userId: string, role: "FOUNDER" | "ADVISOR", joinedMinAfterStart: number, leftMinAfterStart: number | null) =>
    db.query(
      `INSERT INTO advisory_meeting_attendance ("bookingId", "userId", role, "sessionKey", "joinedAt", "leftAt", source)
       SELECT $1, $2, $3, 'it-' || gen_random_uuid()::text, "startsAt" + ($4::numeric * interval '1 minute'), CASE WHEN $5::numeric IS NULL THEN NULL ELSE "startsAt" + ($5::numeric * interval '1 minute') END, 'WEBHOOK' FROM advisory_bookings WHERE id = $1`,
      [id, userId, role, joinedMinAfterStart, leftMinAfterStart]);
  const attendanceOf = async (id: string) => (await db.query(`SELECT * FROM advisory_meeting_attendance WHERE "bookingId" = $1 ORDER BY "joinedAt"`, [id])).rows as Record<string, any>[];
  const sign = (body: string, ts = String(Math.floor(Date.now() / 1000)), secret = WHSEC) => ({ "x-webhook-timestamp": ts, "x-webhook-signature": signDailyWebhook(secret, ts, body), "content-type": "application/json" });
  const post = (a: INestApplication, body: string, headers: Record<string, string>) => request(a.getHttpServer()).post("/api/advisory/webhooks/daily").set(headers).send(body);

  it("a simulated room records who joined and left; the status shows who is in the room and who attended", async () => {
    const b = await confirmed(41, 0);
    await openNow(b.id);
    expect((await api("owner").post(`/advisory/bookings/${b.id}/meeting/presence`, { event: "joined" })).status).toBe(201);
    expect((await api("owner").post(`/advisory/bookings/${b.id}/meeting/presence`, { event: "joined" })).status).toBe(201); // again: still one open stay
    expect((await attendanceOf(b.id)).filter((r) => r.userId === ids.owner)).toHaveLength(1);
    let st = (await api("advisorUser").get(`/advisory/bookings/${b.id}/meeting`)).body.attendance;
    expect(st.founder).toMatchObject({ present: true, hasRecord: true });
    expect(st.advisor.hasRecord).toBe(false);
    expect((await api("advisorUser").post(`/advisory/bookings/${b.id}/meeting/presence`, { event: "joined" })).status).toBe(201);
    expect((await api("owner").post(`/advisory/bookings/${b.id}/meeting/presence`, { event: "left" })).status).toBe(201);
    st = (await api("owner").get(`/advisory/bookings/${b.id}/meeting`)).body.attendance;
    expect(st.founder.present).toBe(false);
    expect(st.founder.lastLeftAt).not.toBeNull();
    expect(st.advisor.present).toBe(true);
    expect((await api("owner").post(`/advisory/bookings/${b.id}/meeting/presence`, { event: "left" })).status).toBe(201); // leaving twice is harmless
    expect((await attendanceOf(b.id)).every((r) => r.source === "MOCK")).toBe(true);
  });

  it("presence reports are accepted only from the two parties, only while the meeting is open, and never for a real (Daily) meeting", async () => {
    const b = await confirmed(42, 0);
    expect((await api("owner").post(`/advisory/bookings/${b.id}/meeting/presence`, { event: "joined" })).status).toBe(409); // not open yet
    await openNow(b.id);
    for (const who of ["outsider", "editor", "owner2", "otherAdvisorUser", "admin"]) expect((await api(who).post(`/advisory/bookings/${b.id}/meeting/presence`, { event: "joined" })).status).toBe(403);
    expect((await api(null).post(`/advisory/bookings/${b.id}/meeting/presence`, { event: "joined" })).status).toBe(401);
    expect((await api("owner").post(`/advisory/bookings/${b.id}/meeting/presence`, { event: "arrived" })).status).toBe(400);
    expect(await attendanceOf(b.id)).toHaveLength(0);

    const s = await buildApp(true, { ADVISORY_VIDEO_PROVIDER: "daily", DAILY_API_KEY: "fake-key-for-tests", DAILY_DOMAIN: "fakedomain" });
    try {
      const r = await request(s.app.getHttpServer()).post(`/api/advisory/bookings/${b.id}/meeting/presence`).set("Authorization", `Bearer ${tokenOf.get("owner")}`).send({ event: "joined" });
      expect(r.status).toBe(409); // a browser can't claim attendance at a real meeting
      expect(await attendanceOf(b.id)).toHaveLength(0);
    } finally { await s.app.close(); }
  });

  it("Daily's webhook: 404 unless a secret is configured; unsigned, mis-signed and stale requests are refused and record nothing", async () => {
    const body = JSON.stringify({ id: "evt-x", type: "participant.joined", payload: { room: "r", user_id: ids.owner } });
    expect((await post(app, body, sign(body))).status).toBe(404); // the main test app has no webhook secret
    const s = await buildApp(true, { DAILY_WEBHOOK_SECRET: WHSEC });
    try {
      expect((await post(s.app, body, { "content-type": "application/json" })).status).toBe(401); // no signature
      expect((await post(s.app, body, sign(body, undefined, Buffer.from("another secret").toString("base64")))).status).toBe(401); // wrong secret
      expect((await post(s.app, body.replace("evt-x", "evt-y"), sign(body))).status).toBe(401); // body changed after signing
      expect((await post(s.app, body, sign(body, String(Math.floor(Date.now() / 1000) - 3600)))).status).toBe(401); // an hour old: replay
      expect((await db.query(`SELECT count(*)::int n FROM advisory_webhook_events WHERE id IN ('evt-x','evt-y')`)).rows[0].n).toBe(0);
      const ping = JSON.stringify({ test: "test" });
      const ok = await post(s.app, ping, sign(ping));
      expect(ok.status).toBe(200);
      expect(ok.body).toEqual({ status: "test" });
    } finally { await s.app.close(); }
  });

  it("signed joined/left events are recorded against the right person; duplicates, strangers and unknown rooms change nothing; out-of-order events still add up", async () => {
    const b = await confirmed(43, 0);
    await openNow(b.id);
    await joinAs("owner", b.id); // gives the booking its (unguessable) room name
    const room = (await row(b.id)).meetingRoomName as string;
    const start = new Date((await row(b.id)).startsAt).getTime();
    const sec = (min: number) => Math.floor((start + min * 60_000) / 1000);
    const evt = (id: string, type: string, userId: string, session: string, extra: Record<string, unknown> = {}, roomName = room) =>
      JSON.stringify({ id, type, event_ts: extra.event_ts ?? sec(1), payload: { room: roomName, user_id: userId, session_id: session, ...extra } });

    const s = await buildApp(true, { DAILY_WEBHOOK_SECRET: WHSEC });
    try {
      const send = async (body: string) => (await post(s.app, body, sign(body))).body.status as string;
      expect(await send(evt(`${tag}-e1`, "participant.joined", ids.owner!, `${tag}-sess-f`, { joined_at: sec(2), event_ts: sec(2) }))).toBe("processed");
      expect(await send(evt(`${tag}-e1`, "participant.joined", ids.owner!, `${tag}-sess-f`, { joined_at: sec(2), event_ts: sec(2) }))).toBe("duplicate"); // Daily redelivered it
      expect(await send(evt(`${tag}-e2`, "participant.left", ids.owner!, `${tag}-sess-f`, { joined_at: sec(2), duration: 20 * 60, event_ts: sec(22) }))).toBe("processed");
      // the advisor's LEAVE arrives before their JOIN (out of order)
      expect(await send(evt(`${tag}-e3`, "participant.left", ids.advisorUser!, `${tag}-sess-a`, { joined_at: sec(0), duration: 28 * 60, event_ts: sec(28) }))).toBe("processed");
      expect(await send(evt(`${tag}-e4`, "participant.joined", ids.advisorUser!, `${tag}-sess-a`, { joined_at: sec(0), event_ts: sec(0) }))).toBe("processed");
      // not recorded: a stranger, an EDITOR member, an unknown room, other event types
      expect(await send(evt(`${tag}-e5`, "participant.joined", ids.outsider!, `${tag}-sess-x`, { joined_at: sec(3) }))).toBe("ignored");
      expect(await send(evt(`${tag}-e6`, "participant.joined", ids.editor!, `${tag}-sess-y`, { joined_at: sec(3) }))).toBe("ignored");
      expect(await send(evt(`${tag}-e7`, "participant.joined", ids.owner!, `${tag}-sess-z`, { joined_at: sec(3) }, "ruwad-no-such-room"))).toBe("ignored");
      expect(await send(JSON.stringify({ id: `${tag}-e8`, type: "meeting.started", event_ts: sec(0), payload: { room } }))).toBe("ignored");

      const rows = await attendanceOf(b.id);
      expect(rows).toHaveLength(2);
      const f = rows.find((r) => r.userId === ids.owner)!;
      const a = rows.find((r) => r.userId === ids.advisorUser)!;
      expect(f).toMatchObject({ role: "FOUNDER", source: "WEBHOOK", sessionKey: `${tag}-sess-f` });
      expect(new Date(f.leftAt).getTime() - new Date(f.joinedAt).getTime()).toBe(20 * 60_000);
      expect(a).toMatchObject({ role: "ADVISOR" });
      expect(Math.abs(new Date(a.joinedAt).getTime() - start)).toBeLessThan(1000); // the late join moved the start back to when they really arrived (webhook times are whole seconds)
      expect(new Date(a.leftAt).getTime() - new Date(a.joinedAt).getTime()).toBe(28 * 60_000);

      const sum = (await api("owner").get(`/advisory/bookings/${b.id}/meeting`)).body.attendance;
      expect(sum.advisor.minutes).toBe(28);
      expect(sum.founder.minutes).toBe(20);
      expect(sum.overlapMinutes).toBe(20);
    } finally { await s.app.close(); }
  });

  // ---- Daily's webhook: the cases its documentation calls out (fractional seconds, lost / late / duplicate events, retries) ----------------------------
  /** An event shaped like Daily's documentation: the envelope (version, type, id, payload, event_ts), times in unix SECONDS with a fraction. */
  const dailyEvent = (type: string, id: string, payload: Record<string, unknown>, eventTs: number) => JSON.stringify({ version: "1.0.0", type, id, payload, event_ts: eventTs });
  /** Session ids are part of Daily's duplicate key (type + session_id) and are kept forever, so each run's carry its own tag. */
  const sid = (name: string) => `${tag}-${name}`;
  /** Seconds with a fraction, as Daily sends them (for example 1708972291.567). */
  const at = (startMs: number, minutes: number, extraMs = 567) => (startMs + minutes * 60_000 + extraMs) / 1000;
  /** A confirmed consultation whose meeting is open and whose room exists (the founder joined once through the app). */
  const withRoom = async (dayN: number) => {
    const b = await confirmed(dayN, 0);
    await openNow(b.id);
    await joinAs("owner", b.id);
    const r = await row(b.id);
    return { id: b.id, room: r.meetingRoomName as string, start: new Date(r.startsAt).getTime() };
  };

  it("Daily-shaped events: a lost JOIN doesn't erase a stay, repeated visits add up, duplicates (even under a different event id) change nothing, and no webhook changes the status", async () => {
    const { id, room, start } = await withRoom(50);
    const s = await buildApp(true, { DAILY_WEBHOOK_SECRET: WHSEC });
    try {
      const send = async (body: string) => (await post(s.app, body, sign(body))).body.status as string;
      const joined = (u: string, session: string, min: number, evId: string) => dailyEvent("participant.joined", evId, { room, user_id: u, session_id: session, joined_at: at(start, min), owner: false }, at(start, min));
      const left = (u: string, session: string, from: number, to: number, evId: string) => dailyEvent("participant.left", evId, { room, user_id: u, session_id: session, joined_at: at(start, from), duration: (to - from) * 60 + 0.419, owner: false }, at(start, to));

      // the founder's JOIN event is lost: only the LEAVE arrives, and it still carries the whole stay (joined_at + duration)
      expect(await send(left(ids.owner!, sid("f1"), 2, 22, `${tag}-t1-a`))).toBe("processed");
      expect(await send(joined(ids.advisorUser!, sid("a1"), 0, `${tag}-t1-b`))).toBe("processed");
      expect(await send(left(ids.advisorUser!, sid("a1"), 0, 28, `${tag}-t1-c`))).toBe("processed");
      // the founder's connection dropped and they came back as a NEW session
      expect(await send(joined(ids.owner!, sid("f2"), 24, `${tag}-t1-d`))).toBe("processed");
      expect(await send(left(ids.owner!, sid("f2"), 24, 27, `${tag}-t1-e`))).toBe("processed");
      // duplicates: the very same event, and the same type + session under a DIFFERENT id (Daily's documentation says that can happen)
      expect(await send(left(ids.owner!, sid("f1"), 2, 22, `${tag}-t1-a`))).toBe("duplicate");
      expect(await send(left(ids.owner!, sid("f1"), 2, 22, `${tag}-t1-a-again`))).toBe("duplicate");
      expect(await send(joined(ids.advisorUser!, sid("a1"), 0, `${tag}-t1-b-again`))).toBe("duplicate");

      const rows = await attendanceOf(id);
      expect(rows).toHaveLength(3); // f1, f2 and a1: nothing was recorded twice
      expect(rows.every((r) => r.source === "WEBHOOK")).toBe(true);
      const f1 = rows.find((r) => r.sessionKey === sid("f1"))!;
      expect(Math.round((new Date(f1.leftAt).getTime() - new Date(f1.joinedAt).getTime()) / 1000)).toBe(20 * 60); // the whole stay, not zero
      const sum = (await api("owner").get(`/advisory/bookings/${id}/meeting`)).body.attendance;
      expect(sum.founder.minutes).toBe(23); // 20 + 3: the gap between the two visits isn't counted
      expect(sum.advisor.minutes).toBe(28);
      expect(sum.overlapMinutes).toBe(23);

      // odd or missing fields never crash the endpoint (and never produce a 500)
      const odd = dailyEvent("participant.left", `${tag}-t1-odd`, { room, user_id: ids.advisorUser!, joined_at: "not-a-number", duration: -5 }, at(start, 28));
      expect((await post(s.app, odd, sign(odd))).status).toBe(200);
      // a webhook only records attendance: the consultation itself is untouched
      expect(await row(id)).toMatchObject({ status: "CONFIRMED", needsReview: false, attendanceOutcome: null, completedAt: null });
    } finally { await s.app.close(); }
  });

  it("a webhook that fails halfway isn't lost: Daily's retry is processed (the 'seen' markers roll back with the attendance), and only after that do repeats count as duplicates", async () => {
    const { id, room, start } = await withRoom(51);
    const s = await buildApp(true, { DAILY_WEBHOOK_SECRET: WHSEC });
    const spy = jest.spyOn(s.app.get(AdvisoryAttendanceService) as unknown as { upsertPresence: () => Promise<void> }, "upsertPresence").mockRejectedValueOnce(new Error("database unavailable"));
    try {
      const body = dailyEvent("participant.joined", `${tag}-t2`, { room, user_id: ids.advisorUser!, session_id: sid("a-retry"), joined_at: at(start, 1) }, at(start, 1));
      expect((await post(s.app, body, sign(body))).status).toBe(500); // processing failed: Daily will retry
      expect((await db.query(`SELECT count(*)::int n FROM advisory_webhook_events WHERE id IN ($1, $2)`, [`${tag}-t2`, `participant.joined|${sid("a-retry")}`])).rows[0].n).toBe(0); // nothing marked as seen
      expect(await attendanceOf(id)).toHaveLength(0);
      expect((await post(s.app, body, sign(body))).body.status).toBe("processed"); // the retry is NOT thrown away as a duplicate
      expect(await attendanceOf(id)).toHaveLength(1);
      expect((await post(s.app, body, sign(body))).body.status).toBe("duplicate");
      expect(await attendanceOf(id)).toHaveLength(1);
    } finally { spy.mockRestore(); await s.app.close(); }
  });

  it("delayed events for a consultation already waiting for review bring its suggestion up to date (with a history entry) but never complete it, and a concluded one is left alone", async () => {
    const b = await ended(52, 13);
    const room = `ruwad-it-${tag}-late`;
    await db.query(`UPDATE advisory_bookings SET "meetingRoomName" = $2, "meetingProvider" = 'daily' WHERE id = $1`, [b.id, room]);
    const r0 = await row(b.id);
    const start = new Date(r0.startsAt).getTime(), end = new Date(r0.endsAt);
    const s = await buildApp(true, { DAILY_WEBHOOK_SECRET: WHSEC });
    try {
      const send = async (body: string) => (await post(s.app, body, sign(body))).body.status as string;
      const stay = (u: string, session: string, from: number, to: number, evId: string) => dailyEvent("participant.left", evId, { room, user_id: u, session_id: session, joined_at: at(start, from), duration: (to - from) * 60 }, at(start, to));
      expect(await send(stay(ids.advisorUser!, sid("a-late"), 0, 30, `${tag}-t3-a`))).toBe("processed"); // only the advisor's events have arrived so far
      await automation().runOnce(minutesAfter(end, 60), { dryRun: false });
      expect(await row(b.id)).toMatchObject({ status: "CONFIRMED", needsReview: true, attendanceOutcome: "FOUNDER_NO_SHOW" }); // flagged with what was known

      expect(await send(stay(ids.owner!, sid("f-late"), 1, 29, `${tag}-t3-b`))).toBe("processed"); // the founder's events were delayed
      expect(await row(b.id)).toMatchObject({ status: "CONFIRMED", needsReview: true, attendanceOutcome: "ATTENDED_BOTH", completedAt: null }); // suggestion updated; NOT completed
      const updated = (await history(b.id)).filter((h) => h.type === "SUGGESTION_UPDATED");
      expect(updated).toHaveLength(1);
      expect(updated[0]!.details).toMatchObject({ from: "FOUNDER_NO_SHOW", to: "ATTENDED_BOTH" });
      expect(await send(stay(ids.owner!, sid("f-late"), 1, 29, `${tag}-t3-b2`))).toBe("duplicate");
      expect((await history(b.id)).filter((h) => h.type === "SUGGESTION_UPDATED")).toHaveLength(1); // no change, no new entry

      // a person concludes it; an even later event is recorded as attendance but changes nothing about the consultation
      expect((await api("advisorUser").post(`/advisory/bookings/${b.id}/outcome`, { outcome: "ATTENDED_BOTH" })).status).toBe(201);
      expect(await send(stay(ids.owner!, sid("f-later"), 29, 30, `${tag}-t3-c`))).toBe("processed");
      expect(await row(b.id)).toMatchObject({ status: "COMPLETED", attendanceOutcome: "ATTENDED_BOTH", needsReview: false });
      expect((await history(b.id)).filter((h) => h.type === "SUGGESTION_UPDATED")).toHaveLength(1);
      expect(await attendanceOf(b.id)).toHaveLength(3);
    } finally { await s.app.close(); }
  });

  it("a webhook can only touch the booking whose room it names: not an unrelated booking, not a participant of a different one, and recording events are ignored", async () => {
    const a = await confirmed(53, 0);
    const bk = await confirmed(54, 0, svc30, "owner2", startupB);
    const roomA = `ruwad-it-${tag}-iso-a`, roomB = `ruwad-it-${tag}-iso-b`;
    await db.query(`UPDATE advisory_bookings SET "meetingRoomName" = $2 WHERE id = $1`, [a.id, roomA]);
    await db.query(`UPDATE advisory_bookings SET "meetingRoomName" = $2 WHERE id = $1`, [bk.id, roomB]);
    const t0 = Date.now();
    const s = await buildApp(true, { DAILY_WEBHOOK_SECRET: WHSEC });
    try {
      const send = async (body: string) => (await post(s.app, body, sign(body))).body.status as string;
      const ev = (type: string, evId: string, room: string, u: string) => dailyEvent(type, evId, { room, user_id: u, session_id: evId, joined_at: at(t0, 0), duration: 60 }, at(t0, 1));
      // the founder of startup B is not a participant of booking A: ignored, and nothing is written for either booking
      expect(await send(ev("participant.joined", `${tag}-t4-a`, roomA, ids.owner2!))).toBe("ignored");
      expect(await send(ev("participant.left", `${tag}-t4-b`, roomA, ids.owner2!))).toBe("ignored");
      // an EDITOR (not an owner or admin) of startup A, and a stranger, are ignored too
      expect(await send(ev("participant.joined", `${tag}-t4-c`, roomA, ids.editor!))).toBe("ignored");
      expect(await send(ev("participant.joined", `${tag}-t4-d`, roomA, ids.outsider!))).toBe("ignored");
      expect(await attendanceOf(a.id)).toHaveLength(0);
      expect(await attendanceOf(bk.id)).toHaveLength(0);
      // the advisor is on both consultations: an event naming room A is recorded against booking A ONLY
      expect(await send(ev("participant.joined", `${tag}-t4-e`, roomA, ids.advisorUser!))).toBe("processed");
      expect(await attendanceOf(a.id)).toHaveLength(1);
      expect(await attendanceOf(bk.id)).toHaveLength(0);
      // recording and other event types are never acted on (recording stays off; the webhook has no use for them)
      for (const [i, type] of ["recording.started", "recording.ready-to-download", "meeting.ended", "participant.something-new"].entries()) {
        expect(await send(dailyEvent(type, `${tag}-t4-r${i}`, { room: roomA, user_id: ids.advisorUser! }, at(t0, 2)))).toBe("ignored");
      }
      expect(await attendanceOf(a.id)).toHaveLength(1);
      expect(await row(a.id)).toMatchObject({ status: "CONFIRMED", needsReview: false, attendanceOutcome: null });
      expect(await row(bk.id)).toMatchObject({ status: "CONFIRMED", needsReview: false, attendanceOutcome: null });
    } finally { await s.app.close(); }
  });

  it("webhook logging carries reasons and counts only: no secret, signature, timestamp header, token or room name ever reaches a log, and the refusal reason is clear", async () => {
    const { room, start } = await withRoom(55);
    const lines: string[] = [];
    const record = (...args: unknown[]) => { lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")); };
    const spies = (["log", "warn", "error", "debug", "verbose"] as const).map((k) => jest.spyOn(Logger.prototype, k).mockImplementation(record as never));
    const s = await buildApp(true, { DAILY_WEBHOOK_SECRET: WHSEC });
    try {
      const body = dailyEvent("participant.joined", `${tag}-t5`, { room, user_id: ids.advisorUser!, session_id: sid("a-log"), joined_at: at(start, 1) }, at(start, 1));
      const goodHeaders = sign(body);
      const oldTs = String(Math.floor(Date.now() / 1000) - 3600);
      const staleHeaders = sign(body, oldTs);
      expect((await post(s.app, body, staleHeaders)).status).toBe(401);
      expect((await post(s.app, body, sign(body, undefined, Buffer.from("another secret").toString("base64")))).status).toBe(401);
      expect((await post(s.app, body, { "content-type": "application/json" })).status).toBe(401);
      expect((await post(s.app, body, goodHeaders)).body.status).toBe("processed");
      const all = lines.join("\n");
      expect(all).toMatch(/Daily webhook refused: stale-timestamp \(timestamp -?\d+s from now, allowed 300s\)/);
      expect(all).toMatch(/Daily webhook refused: signature-mismatch/);
      expect(all).toMatch(/Daily webhook refused: missing-header/);
      expect(all).toMatch(/Daily webhook participant\.joined: processed \(advisor joined ADV-/);
      for (const secret of [WHSEC, Buffer.from(WHSEC, "base64").toString(), goodHeaders["x-webhook-signature"], staleHeaders["x-webhook-signature"], goodHeaders["x-webhook-timestamp"], tokenOf.get("owner")!, tokenOf.get("advisorUser")!, room]) {
        expect(all).not.toContain(secret);
      }
      expect(all).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // no JWT / meeting token
    } finally { spies.forEach((sp) => sp.mockRestore()); await s.app.close(); }
  });

  it("the replay window follows DAILY_WEBHOOK_TOLERANCE_SECONDS: a 10 minute old event is refused by default and accepted when the window is widened (Daily's documentation names no window)", async () => {
    const { room, start } = await withRoom(56);
    const body = dailyEvent("participant.joined", `${tag}-t6`, { room, user_id: ids.advisorUser!, session_id: sid("a-tol"), joined_at: at(start, 1) }, at(start, 1));
    const tenMinutesOld = String(Math.floor(Date.now() / 1000) - 600);
    const strict = await buildApp(true, { DAILY_WEBHOOK_SECRET: WHSEC });
    const wide = await buildApp(true, { DAILY_WEBHOOK_SECRET: WHSEC, DAILY_WEBHOOK_TOLERANCE_SECONDS: "900" });
    try {
      expect((await post(strict.app, body, sign(body, tenMinutesOld))).status).toBe(401);
      expect((await post(wide.app, body, sign(body, tenMinutesOld))).body.status).toBe("processed");
      const tooWide = await buildApp(true, { DAILY_WEBHOOK_SECRET: WHSEC, DAILY_WEBHOOK_TOLERANCE_SECONDS: "999999" }); // out of range: falls back to the default
      try { expect((await post(tooWide.app, body, sign(body, tenMinutesOld))).status).toBe(401); } finally { await tooWide.app.close(); }
    } finally { await wide.app.close(); await strict.app.close(); }
  });

  it("an ended consultation goes into Needs Review with what attendance suggests, once, and only after the grace period", async () => {
    const b = await ended(44, 3);
    await presence(b.id, ids.advisorUser!, "ADVISOR", 0, 28);
    await presence(b.id, ids.owner!, "FOUNDER", 2, 27);
    const end = new Date((await row(b.id)).endsAt);

    await automation().runOnce(minutesAfter(end, 10), { dryRun: false }); // meeting window still open
    expect((await row(b.id)).needsReview).toBe(false);
    await automation().runOnce(minutesAfter(end, 30), { dryRun: false }); // closed, but inside the 30 minute grace
    expect((await row(b.id)).needsReview).toBe(false);
    const dry = await automation().runOnce(minutesAfter(end, 50), { dryRun: true });
    expect(dry.references).toContain((await row(b.id)).reference);
    expect((await row(b.id)).needsReview).toBe(false); // a dry run changes nothing

    const report = await automation().runOnce(minutesAfter(end, 50), { dryRun: false });
    expect(report.needsReview).toBeGreaterThanOrEqual(1);
    const flagged = await row(b.id);
    expect(flagged).toMatchObject({ needsReview: true, attendanceOutcome: "ATTENDED_BOTH", status: "CONFIRMED" }); // flagged, NOT completed
    expect((await history(b.id)).map((h) => h.type)).toContain("NEEDS_REVIEW");
    const told = await notified(b.id, "NEEDS_REVIEW");
    expect(told).toHaveLength(1);
    expect(told[0]!.details).toMatchObject({ mode: "mock", recipients: ["ADVISOR"] });
    await automation().runOnce(minutesAfter(end, 60), { dryRun: false });
    expect(await notified(b.id, "NEEDS_REVIEW")).toHaveLength(1); // once
    expect(sendTransactional).not.toHaveBeenCalled();
  });

  it("automatic completion is OFF: even a consultation both parties attended is left for a person to confirm", async () => {
    expect(automation().status().autoComplete).toBe(false);
    const b = await ended(45, 4);
    await presence(b.id, ids.advisorUser!, "ADVISOR", 0, 30);
    await presence(b.id, ids.owner!, "FOUNDER", 0, 30);
    const report = await automation().runOnce(minutesAfter(new Date((await row(b.id)).endsAt), 60), { dryRun: false });
    expect(report.autoCompleted).toBe(0);
    expect(await row(b.id)).toMatchObject({ status: "CONFIRMED", needsReview: true, attendanceOutcome: "ATTENDED_BOTH" });
  });

  it("with auto-completion switched on (it isn't approved; this only proves the safeguards), only a clear 'both attended' completes; no-shows and unknowns never do", async () => {
    const both = await ended(46, 5);
    await presence(both.id, ids.advisorUser!, "ADVISOR", 0, 30);
    await presence(both.id, ids.owner!, "FOUNDER", 1, 29);
    const alone = await confirmed(47, 0);
    await db.query(`UPDATE advisory_bookings SET "startsAt" = now() - interval '6 hours', "endsAt" = now() - interval '330 minutes' WHERE id = $1`, [alone.id]);
    await presence(alone.id, ids.advisorUser!, "ADVISOR", 0, 30); // the startup never came
    const nobody = await confirmed(48, 0);
    await db.query(`UPDATE advisory_bookings SET "startsAt" = now() - interval '7 hours', "endsAt" = now() - interval '390 minutes' WHERE id = $1`, [nobody.id]);

    const fakeConfig = { get: (k: string) => ({ ADVISORY_ENABLED: "true", ADVISORY_AUTOCOMPLETE_ENABLED: "true" } as Record<string, string>)[k] } as unknown as ConfigService;
    const auto = new AutomationService(fakeConfig, app.get(DataSource), app.get(getRepositoryToken(AdvisoryBooking)), app.get(AdvisoryNotifier), app.get(AdvisoryMeetingService), app.get(AdvisoryAttendanceService));
    expect(auto.status().autoComplete).toBe(true);
    const report = await auto.runOnce(new Date(), { dryRun: false });
    expect(report.autoCompleted).toBeGreaterThanOrEqual(1);
    expect(await row(both.id)).toMatchObject({ status: "COMPLETED", attendanceOutcome: "ATTENDED_BOTH", needsReview: false });
    const ev = (await history(both.id)).find((h) => h.type === "COMPLETED");
    expect(ev).toBeDefined();
    expect(await row(alone.id)).toMatchObject({ status: "CONFIRMED", needsReview: true, attendanceOutcome: "FOUNDER_NO_SHOW" });
    expect(await row(nobody.id)).toMatchObject({ status: "CONFIRMED", needsReview: true, attendanceOutcome: "UNKNOWN" });
  });

  it("the advisor records what happened: the consultation is COMPLETED with that outcome and leaves the queue; nobody else can, and not before it ends", async () => {
    const b = await ended(49, 8);
    await presence(b.id, ids.advisorUser!, "ADVISOR", 0, 30);
    await automation().runOnce(minutesAfter(new Date((await row(b.id)).endsAt), 60), { dryRun: false });
    expect((await row(b.id)).needsReview).toBe(true);

    for (const who of ["owner", "adminMember", "outsider", "otherAdvisorUser", "editor"]) expect((await api(who).post(`/advisory/bookings/${b.id}/outcome`, { outcome: "ATTENDED_BOTH" })).status).toBe(403);
    expect((await api(null).post(`/advisory/bookings/${b.id}/outcome`, { outcome: "ATTENDED_BOTH" })).status).toBe(401);
    expect((await api("advisorUser").post(`/advisory/bookings/${b.id}/outcome`, { outcome: "UNKNOWN" })).status).toBe(400); // a system state, not a resolution
    expect((await api("advisorUser").post(`/advisory/bookings/${b.id}/outcome`, { outcome: "ATTENDED_BOTH", extra: 1 })).status).toBe(400);

    const res = await api("advisorUser").post(`/advisory/bookings/${b.id}/outcome`, { outcome: "FOUNDER_NO_SHOW", note: "They didn't join" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "COMPLETED", attendanceOutcome: "FOUNDER_NO_SHOW", needsReview: false });
    const ev = (await history(b.id)).find((h) => h.type === "OUTCOME_RESOLVED");
    expect(ev!.details).toMatchObject({ outcome: "FOUNDER_NO_SHOW", suggested: "FOUNDER_NO_SHOW", note: "They didn't join" });
    expect((await api("advisorUser").post(`/advisory/bookings/${b.id}/outcome`, { outcome: "ATTENDED_BOTH" })).status).toBe(409); // already concluded

    const future = await confirmed(2, 1);
    expect((await api("advisorUser").post(`/advisory/bookings/${future.id}/outcome`, { outcome: "ATTENDED_BOTH" })).status).toBe(409); // hasn't happened
    const [s] = await slots(advSlug, svc30, day(3));
    const pending = (await book("owner", startupA, s!.startsAt)).body;
    await db.query(`UPDATE advisory_bookings SET "startsAt" = now() - interval '20 hours', "endsAt" = now() - interval '1170 minutes' WHERE id = $1`, [pending.id]);
    expect((await api("advisorUser").post(`/advisory/bookings/${pending.id}/outcome`, { outcome: "ATTENDED_BOTH" })).status).toBe(409); // was never confirmed
  });

  it("an administrator can record the outcome too, and sees the queue (demonstration bookings hidden unless asked for)", async () => {
    const b = await ended(41, 9);
    await automation().runOnce(minutesAfter(new Date((await row(b.id)).endsAt), 60), { dryRun: false });
    const queue = (await api("admin").get("/advisory/admin/bookings?needsReview=true")).body as { id: string; needsReview: boolean; attendanceOutcome: string }[];
    expect(queue.map((x) => x.id)).toContain(b.id);
    expect(queue.every((x) => x.needsReview)).toBe(true);
    expect(queue.find((x) => x.id === b.id)!.attendanceOutcome).toBe("UNKNOWN");
    for (const who of ["owner", "advisorUser"]) expect((await api(who).get("/advisory/admin/bookings?needsReview=true")).status).toBe(403);

    const [ds] = await slots(demoSlug, demoSvc, day(55));
    const demo = (await book("owner", startupA, ds!.startsAt, demoSvc, demoSlug)).body;
    await db.query(`UPDATE advisory_bookings SET status = 'CONFIRMED', "needsReview" = true, "startsAt" = now() - interval '11 hours', "endsAt" = now() - interval '630 minutes' WHERE id = $1`, [demo.id]);
    expect(((await api("admin").get("/advisory/admin/bookings?needsReview=true")).body as { id: string }[]).map((x) => x.id)).not.toContain(demo.id);
    expect(((await api("admin").get("/advisory/admin/bookings?needsReview=true&includeDemo=true")).body as { id: string }[]).map((x) => x.id)).toContain(demo.id);

    const res = await api("admin").post(`/advisory/bookings/${b.id}/outcome`, { outcome: "BOTH_NO_SHOW" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "COMPLETED", attendanceOutcome: "BOTH_NO_SHOW", needsReview: false });
    expect((await history(b.id)).find((h) => h.type === "OUTCOME_RESOLVED")).toBeDefined();
  });

  it("'Mark completed' clears the review flag, and a CONFIRMED consultation that has ended still shows its suggested outcome until then", async () => {
    const b = await ended(42, 10);
    await presence(b.id, ids.owner!, "FOUNDER", 0, 30);
    await automation().runOnce(minutesAfter(new Date((await row(b.id)).endsAt), 60), { dryRun: false });
    expect(await row(b.id)).toMatchObject({ needsReview: true, attendanceOutcome: "ADVISOR_NO_SHOW" });
    const mine = (await api("advisorUser").get("/advisory/advisor/bookings")).body as { id: string; needsReview: boolean; attendanceOutcome: string }[];
    expect(mine.find((x) => x.id === b.id)).toMatchObject({ needsReview: true, attendanceOutcome: "ADVISOR_NO_SHOW" });
    expect((await api("advisorUser").post(`/advisory/advisor/bookings/${b.id}/complete`)).status).toBe(201);
    expect(await row(b.id)).toMatchObject({ status: "COMPLETED", needsReview: false, attendanceOutcome: "ATTENDED_BOTH" });
  });

  // ---- the master switch ------------------------------------------------------------------------------------------------------------------

  it("with ADVISORY_ENABLED off, every advisory route is a 404, signed in or not", async () => {
    const off = await buildApp(false);
    try {
      const token = off.jwt.sign({ sub: ids.owner, email: "x@example.test", role: "USER" });
      const adminToken = off.jwt.sign({ sub: ids.admin, email: "a@example.test", role: "RUWAD_ADMIN" });
      const call = (m: "get" | "post", p: string, t?: string) => { const r = request(off.app.getHttpServer())[m](`/api${p}`); return (t ? r.set("Authorization", `Bearer ${t}`) : r).send(); };
      expect((await call("get", "/advisory/advisors")).status).toBe(404);
      expect((await call("get", `/advisory/advisors/${advSlug}`)).status).toBe(404);
      expect((await call("post", "/advisory/bookings", token)).status).toBe(404);
      expect((await call("get", "/advisory/bookings/mine", token)).status).toBe(404);
      expect((await call("get", "/advisory/admin/stats", adminToken)).status).toBe(404);
    } finally {
      await off.app.close();
    }
  });
});
