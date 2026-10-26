/* eslint-disable @typescript-eslint/no-var-requires */
import { randomUUID } from "crypto";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { Test } from "@nestjs/testing";
import { TypeOrmModule, getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import request from "supertest";
import { JwtStrategy } from "../auth/jwt.strategy";
import { EmailService } from "../email/email.service";
import { AdvisoryAutomationService, AdvisoryAutomationService as AutomationService } from "./advisory-automation.service";
import { AdvisoryMeetingService } from "./advisory-meeting.service";
import { AdvisoryNotifier } from "./advisory-notifier";
import { MockVideoProvider } from "./video/mock-video-provider";
import { VIDEO_PROVIDER } from "./video/video-provider";
import * as http from "http";
import { AdvisoryBooking } from "./advisory.entities";
import { AdvisoryModule } from "./advisory.module";
import { addDays, riyadhDate, ymdKey } from "./advisory-time";

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

  const profile = (name: string) => ({
    name, institution: "Test Institute", institutionFull: "Test Institute of Integration Testing", designation: "Tester", location: "Riyadh, Saudi Arabia", specialization: "Testing",
    specializations: ["Testing"], researchAreas: ["Integration testing"], expertise: "Integration testing.", about: "An integration-test advisor profile created by an automated test.",
  });

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
      ],
      providers: [JwtStrategy],
    }).overrideProvider(EmailService).useValue({ sendTransactional }).compile();
    const a = moduleRef.createNestApplication();
    a.setGlobalPrefix("api");
    a.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    await a.init();
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
    const applied = await api("advisorUser").post("/advisory/advisor/apply", profile(`Dr. Itest ${tag}`));
    expect(applied.status).toBe(201);
    advId = (await db.query(`SELECT id, slug FROM advisory_advisors WHERE "userId" = $1`, [ids.advisorUser])).rows[0].id;
    advSlug = (await db.query(`SELECT slug FROM advisory_advisors WHERE id = $1`, [advId])).rows[0].slug;
    created.advisors.push(advId);
    expect((await api("admin").post(`/advisory/admin/advisors/${advId}/approve`, { notes: "ok" })).status).toBe(201);
    const week = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" }));
    expect((await api("advisorUser").put("/advisory/advisor/availability", { windows: week })).status).toBe(200);
    svc30 = (await api("advisorUser").post("/advisory/advisor/services", { typeId: "specialist", name: "Itest 30", description: "thirty", minutes: 30 })).body.id;
    svc60 = (await api("advisorUser").post("/advisory/advisor/services", { typeId: "advisory", name: "Itest 60", description: "sixty", minutes: 60 })).body.id;

    await api("otherAdvisorUser").post("/advisory/advisor/apply", profile(`Dr. Other ${tag}`));
    const other = (await db.query(`SELECT id FROM advisory_advisors WHERE "userId" = $1`, [ids.otherAdvisorUser])).rows[0].id;
    created.advisors.push(other);
    await api("admin").post(`/advisory/admin/advisors/${other}/approve`, {});
    await api("pendingAdvisorUser").post("/advisory/advisor/apply", profile(`Dr. Pending ${tag}`));
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
      await db.query(`DELETE FROM advisory_booking_events WHERE "bookingId" IN (SELECT id FROM advisory_bookings WHERE "advisorId" = ANY($1))`, [adv]);
      await db.query(`DELETE FROM advisory_bookings WHERE "advisorId" = ANY($1)`, [adv]);
      await db.query(`DELETE FROM advisory_availability_exceptions WHERE "advisorId" = ANY($1)`, [adv]);
      await db.query(`DELETE FROM advisory_availability_rules WHERE "advisorId" = ANY($1)`, [adv]);
      await db.query(`DELETE FROM advisory_services WHERE "advisorId" = ANY($1)`, [adv]);
      await db.query(`DELETE FROM advisory_advisors WHERE id = ANY($1)`, [adv]);
    }
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
    expect((await api("advisorUser").post("/advisory/advisor/apply", profile("Dr. Twice"))).status).toBe(409);
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
  const history = async (id: string) => (await db.query(`SELECT type, details FROM advisory_booking_events WHERE "bookingId" = $1 ORDER BY "createdAt"`, [id])).rows as { type: string; details: { kind?: string; mode?: string; skipped?: string } | null }[];
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
    expect(dry.references).toContain(b.reference);
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
    const second = new AutomationService(app.get(ConfigService), app.get(DataSource), app.get(getRepositoryToken(AdvisoryBooking)), app.get(AdvisoryNotifier), app.get(AdvisoryMeetingService));
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
