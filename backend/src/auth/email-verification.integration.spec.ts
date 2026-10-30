/* eslint-disable @typescript-eslint/no-var-requires */
import { randomBytes, randomUUID } from "crypto";
import { INestApplication, Logger, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { Test } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import cookieParser from "cookie-parser";
import request from "supertest";
import { EmailService } from "../email/email.service";
import { UsersModule } from "../users/users.module";
import { AuthModule } from "./auth.module";
import { JwtStrategy } from "./jwt.strategy";
import { hashIp } from "./otp-logic";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const passport = require("passport");
const { assertLocalDatabase, LOCAL_DATABASE_URL } = require("../../scripts/dev/local-db-guard");
const { Client } = require("pg");

/** INTEGRATION TESTS against the LOCAL embedded Postgres (npm run db:local, port 55432). Skipped unless AUTH_INTEGRATION=1 (use `npm run test:auth`), and they refuse to
 * run against any database that is not on this machine. They use their own throwaway secrets and a FAKE email service (nothing can reach Resend), create their own
 * users, and delete every row they created. */
const RUN = process.env.AUTH_INTEGRATION === "1";
const suite = RUN ? describe : describe.skip;

const JWT_SECRET = "auth-integration-test-jwt-secret-not-a-real-one";
const OTP_SECRET = randomBytes(32).toString("base64");
const OTP_KEY = Buffer.from(OTP_SECRET, "base64");
const PASSWORD = "Correct-Horse-1!";
const tag = randomUUID().slice(0, 8);
const MESSAGE_INVALID = "That code isn't valid or has expired. Request a new one.";

interface Sent { kind: "code" | "existing" | "reset"; to: string; code?: string; token?: string }

suite("Email verification (6-digit code), integration (local Postgres)", () => {
  let app: INestApplication;
  let db: InstanceType<typeof Client>;
  const sent: Sent[] = [];
  let failDelivery = false;
  const seenBodies: string[] = [];
  const logged: string[] = [];
  const createdUsers: string[] = [];
  const hashIps: string[] = [];

  const fakeEmail = {
    sendEmailVerificationCode: jest.fn(async (p: { to: string; code: string }) => { sent.push({ kind: "code", to: p.to, code: p.code }); return !failDelivery; }),
    sendExistingAccountNotice: jest.fn(async (p: { to: string }) => { sent.push({ kind: "existing", to: p.to }); return true; }),
    sendPasswordReset: jest.fn(async (p: { to: string; token: string }) => { sent.push({ kind: "reset", to: p.to, token: p.token }); }),
    sendTransactional: jest.fn(async () => true),
  };

  const emailOf = (name: string) => `otp-it-${tag}-${name}@example.test`;
  const ipOf = (name: string) => `10.${(parseInt(Buffer.from(name).toString("hex").slice(0, 4), 16) % 250) + 1}.${(name.length * 7) % 250}.${(tag.charCodeAt(0) % 250) + 1}`;
  const codesTo = (email: string) => sent.filter((s) => s.kind === "code" && s.to === email);
  const lastCode = (email: string) => codesTo(email).at(-1)?.code as string;
  const rec = <T extends request.Response>(res: T): T => { seenBodies.push(res.text ?? "", JSON.stringify(res.headers["set-cookie"] ?? [])); return res; };
  const cookieNames = (res: request.Response) => ((res.headers["set-cookie"] as unknown as string[]) ?? []).map((c) => c.split("=")[0]);
  const cookieValue = (res: request.Response, name: string) => (((res.headers["set-cookie"] as unknown as string[]) ?? []).find((c) => c.startsWith(`${name}=`)) ?? "").split(";")[0]!.slice(name.length + 1);
  const waitFor = async (cond: () => boolean) => { for (let i = 0; i < 50 && !cond(); i++) await new Promise((r) => setTimeout(r, 40)); };

  async function buildApp(extra: Record<string, string | undefined>, creates = true) {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET, NODE_ENV: "test", APP_URL: "http://localhost:5174", ...extra })] }),
        TypeOrmModule.forRoot({ type: "postgres", url: assertLocalDatabase(LOCAL_DATABASE_URL), ssl: false, autoLoadEntities: true, synchronize: false }),
        PassportModule,
        AuthModule,
        UsersModule,
      ],
    }).overrideProvider(EmailService).useValue(fakeEmail).compile();
    const a = moduleRef.createNestApplication();
    a.setGlobalPrefix("api");
    a.use(cookieParser());
    a.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    (a.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set("trust proxy", true); // each test user gets its own X-Forwarded-For
    await a.init();
    // Passport keeps ONE global strategy named "jwt" (the last one constructed). When an extra app is closed, hand the strategy back to the main app.
    const closeApp = a.close.bind(a);
    a.close = async () => { await closeApp(); if (creates && app && app !== a) passport.use("jwt", app.get(JwtStrategy) as never); };
    return a;
  }

  async function makeUser(name: string, over: { verified?: boolean; role?: string } = {}) {
    const email = emailOf(name);
    const { rows } = await db.query(
      `INSERT INTO users ("firstName","lastName",email,"passwordHash",role,"emailVerifiedAt","emailVerifiedVia") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      ["IT", name, email, bcrypt.hashSync(PASSWORD, 4), over.role ?? "USER", over.verified === false ? null : new Date(), over.verified === false ? null : "LEGACY"],
    );
    createdUsers.push(rows[0].id);
    return { id: rows[0].id as string, email };
  }

  const server = () => app.getHttpServer();
  const post = (path: string, body: object, ip: string, cookie?: string, srv: () => unknown = server) => {
    let r = request(srv() as never).post(`/api${path}`).set("X-Forwarded-For", ip);
    if (cookie) r = r.set("Cookie", cookie);
    return r.send(body);
  };
  const get = (path: string, ip: string, cookie?: string) => {
    let r = request(server()).get(`/api${path}`).set("X-Forwarded-For", ip);
    if (cookie) r = r.set("Cookie", cookie);
    return r;
  };
  const signup = async (name: string, over: Partial<{ password: string; firstName: string }> = {}) =>
    rec(await post("/auth/register", { firstName: over.firstName ?? "Test", lastName: name, email: emailOf(name), password: over.password ?? PASSWORD }, ipOf(name)));
  const verifyReq = async (name: string, code: string, cookie?: string, email?: string) => rec(await post("/auth/verify-email", { code, ...(email ? { email } : {}) }, ipOf(name), cookie));
  const resendReq = async (name: string, cookie?: string, email?: string) => rec(await post("/auth/resend-verification", email ? { email } : {}, ipOf(name), cookie));
  const userRow = async (email: string) => (await db.query(`SELECT * FROM users WHERE email = $1`, [email])).rows[0];
  const codeRows = async (email: string) => (await db.query(`SELECT * FROM email_verification_codes WHERE "userId" = (SELECT id FROM users WHERE email = $1) ORDER BY "createdAt"`, [email])).rows;
  const pending = (res: request.Response) => `ruwad_pending=${cookieValue(res, "ruwad_pending")}`;
  const bypassCooldown = (email: string) => db.query(`UPDATE email_verification_codes SET "createdAt" = now() - interval '3 minutes' WHERE "userId" = (SELECT id FROM users WHERE email = $1)`, [email]);

  beforeAll(async () => {
    const url = assertLocalDatabase(LOCAL_DATABASE_URL);
    db = new Client({ connectionString: url });
    await db.connect();
    for (const m of ["log", "warn", "error", "debug", "verbose", "fatal"] as const) {
      jest.spyOn(Logger.prototype, m).mockImplementation((...args: unknown[]) => { logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")); });
    }
    app = await buildApp({ EMAIL_VERIFICATION_REQUIRED: "true", EMAIL_OTP_SECRET: OTP_SECRET });
  }, 120_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    if (db) {
      const ids: string[] = (await db.query(`SELECT id FROM users WHERE email LIKE $1`, [`otp-it-${tag}-%`])).rows.map((r: { id: string }) => r.id);
      if (ids.length) {
        await db.query(`DELETE FROM user_settings WHERE "userId" = ANY($1)`, [ids]).catch(() => undefined);
        await db.query(`DELETE FROM password_reset_tokens WHERE "userId" = ANY($1)`, [ids]).catch(() => undefined);
        await db.query(`DELETE FROM email_verification_audit WHERE "userId" = ANY($1)`, [ids]).catch(() => undefined);
      }
      await db.query(`DELETE FROM users WHERE email LIKE $1`, [`otp-it-${tag}-%`]);
      await db.end();
    }
    await app?.close();
  });

  /* ------------------------------------------------------------------------------------------------------------------------------------------------ sign-up */

  describe("sign-up", () => {
    it("creates an UNVERIFIED account, emails a six-digit code, and signs nobody in (no login cookie, only a pending cookie)", async () => {
      const res = await signup("new1");
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ status: "verification_required", message: expect.any(String), resendAfterSeconds: 60 });
      expect(cookieNames(res)).toEqual(["ruwad_pending"]);
      expect(cookieNames(res)).not.toContain("ruwad_token");
      expect(JSON.stringify(res.body)).not.toMatch(/\d{6}/);
      const u = await userRow(emailOf("new1"));
      expect(u.emailVerifiedAt).toBeNull();
      expect(u.emailVerifiedVia).toBeNull();
      expect(codesTo(emailOf("new1"))).toHaveLength(1);
      expect(lastCode(emailOf("new1"))).toMatch(/^\d{6}$/);
      const rows = await codeRows(emailOf("new1"));
      expect(rows).toHaveLength(1);
      expect(rows[0].deliveryResult).toBe("SENT");
      expect(rows[0].attempts).toBe(0);
      expect(rows[0].codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0].codeHash).not.toContain(lastCode(emailOf("new1")));
      expect(new Date(rows[0].expiresAt).getTime() - new Date(rows[0].createdAt).getTime()).toBeGreaterThan(9 * 60_000);
      expect(new Date(rows[0].expiresAt).getTime() - new Date(rows[0].createdAt).getTime()).toBeLessThanOrEqual(10 * 60_000 + 2000);
    });

    it("the pending cookie is httpOnly, scoped to the auth path, and carries no role or permission", async () => {
      const res = await signup("new2");
      const raw = (res.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("ruwad_pending="))!;
      expect(raw).toMatch(/HttpOnly/i);
      expect(raw).toMatch(/Path=\/api\/auth/i);
      const body = JSON.parse(Buffer.from(cookieValue(res, "ruwad_pending").split(".")[0]!, "base64url").toString("utf8"));
      expect(Object.keys(body).sort()).toEqual(["e", "m", "u"]);
      expect(body.m).toMatch(/^o\*\*\*@example\.test$/);
    });

    it("the pending cookie cannot authenticate: not as a login cookie, not as a bearer token", async () => {
      const res = await signup("new3");
      const value = cookieValue(res, "ruwad_pending");
      expect((await get("/auth/me", ipOf("new3"), `ruwad_pending=${value}`)).status).toBe(401);
      expect((await get("/auth/me", ipOf("new3"), `ruwad_token=${value}`)).status).toBe(401);
      expect((await request(server()).get("/api/auth/me").set("Authorization", `Bearer ${value}`)).status).toBe(401);
    });

    it("answers the same way for an address that already has a VERIFIED account: same body, same cookie names, nothing changed, a notice is emailed instead of a code", async () => {
      const existing = await makeUser("existing1");
      const before = await userRow(existing.email);
      const mine = await signup("new4");
      const theirs = await rec(await post("/auth/register", { firstName: "Mallory", lastName: "existing1", email: existing.email, password: "Attacker-Password-9!" }, ipOf("existing1")));
      expect(theirs.status).toBe(mine.status);
      expect(theirs.body).toEqual(mine.body);
      expect(cookieNames(theirs)).toEqual(cookieNames(mine));
      const after = await userRow(existing.email);
      expect(after.passwordHash).toBe(before.passwordHash); // the attacker's password was NOT applied
      expect(after.firstName).toBe(before.firstName);
      expect(after.emailVerifiedAt).not.toBeNull();
      expect(await codeRows(existing.email)).toHaveLength(0);
      expect(sent.some((s) => s.kind === "existing" && s.to === existing.email)).toBe(true);
      expect(codesTo(existing.email)).toHaveLength(0);
    });

    it("a pending cookie handed out for an existing address is a decoy: it can never verify anything or sign anyone in", async () => {
      const existing = await makeUser("existing2");
      const res = await rec(await post("/auth/register", { firstName: "X", lastName: "existing2", email: existing.email, password: PASSWORD }, ipOf("existing2")));
      const v = await verifyReq("existing2", "123456", pending(res));
      expect(v.status).toBe(400);
      expect(v.body).toMatchObject({ code: "INVALID_OTP", message: MESSAGE_INVALID });
      expect(cookieNames(v)).not.toContain("ruwad_token");
      expect((await get("/auth/me", ipOf("existing2"), pending(res))).status).toBe(401);
    });

    it("a second sign-up for a still-UNVERIFIED address overwrites the account (pre-hijack protection) and supersedes the earlier code", async () => {
      await signup("hijack1", { password: "Attacker-Password-9!" });
      const firstCode = lastCode(emailOf("hijack1"));
      await bypassCooldown(emailOf("hijack1"));
      const owner = await signup("hijack1", { password: "Owner-Password-1!", firstName: "Owner" });
      expect(owner.status).toBe(201);
      const u = await userRow(emailOf("hijack1"));
      expect(u.firstName).toBe("Owner");
      expect(await bcrypt.compare("Owner-Password-1!", u.passwordHash)).toBe(true);
      expect(await bcrypt.compare("Attacker-Password-9!", u.passwordHash)).toBe(false);
      const attackerLogin = rec(await post("/auth/login", { email: emailOf("hijack1"), password: "Attacker-Password-9!" }, ipOf("hijack1")));
      expect((await attackerLogin).status).toBe(401);
      const rows = await codeRows(emailOf("hijack1"));
      expect(rows).toHaveLength(2);
      expect(rows[0].supersededAt).not.toBeNull();
      expect((await verifyReq("hijack1", firstCode, undefined, emailOf("hijack1"))).status).toBe(400); // the old code no longer works
      expect((await verifyReq("hijack1", lastCode(emailOf("hijack1")), undefined, emailOf("hijack1"))).status).toBe(200);
    });

    it("two simultaneous sign-ups for one new address create exactly one account", async () => {
      const email = emailOf("race1");
      const body = { firstName: "R", lastName: "race1", email, password: PASSWORD };
      const out = await Promise.all([post("/auth/register", body, "10.9.9.1"), post("/auth/register", body, "10.9.9.2")]);
      out.forEach(rec);
      expect(out.map((r) => r.status)).toEqual([201, 201]);
      expect((await db.query(`SELECT count(*)::int AS n FROM users WHERE email = $1`, [email])).rows[0].n).toBe(1);
      const id = (await userRow(email)).id;
      createdUsers.push(id);
    });
  });

  /* ------------------------------------------------------------------------------------------------------------------------------------ login before verifying */

  describe("login and protected routes before verification", () => {
    it("the right password on an unverified account is refused with 403 EMAIL_NOT_VERIFIED, a pending cookie and no login cookie", async () => {
      await signup("login1");
      const res = rec(await post("/auth/login", { email: emailOf("login1"), password: PASSWORD }, ipOf("login1")));
      const out = await res;
      expect(out.status).toBe(403);
      expect(out.body).toMatchObject({ statusCode: 403, code: "EMAIL_NOT_VERIFIED", maskedEmail: "o***@example.test" });
      expect(cookieNames(out)).toContain("ruwad_pending");
      expect(cookieNames(out)).not.toContain("ruwad_token");
    });

    it("a wrong password is the same generic 401 whether the account is verified or not (the verification state is not revealed without the password)", async () => {
      await signup("login2");
      const verified = await makeUser("login2v");
      const a = rec(await post("/auth/login", { email: emailOf("login2"), password: "Wrong-Password-1!" }, ipOf("login2")));
      const b = rec(await post("/auth/login", { email: verified.email, password: "Wrong-Password-1!" }, ipOf("login2v")));
      const c = rec(await post("/auth/login", { email: emailOf("nobody-here"), password: "Wrong-Password-1!" }, ipOf("nobody")));
      const [ra, rb, rc] = await Promise.all([a, b, c]);
      expect([ra.status, rb.status, rc.status]).toEqual([401, 401, 401]);
      expect(ra.body).toEqual(rb.body);
      expect(ra.body).toEqual(rc.body);
    });

    it("a valid-looking session token for an UNVERIFIED account is refused on a protected route (enforced in the backend, not the frontend)", async () => {
      await signup("tok1");
      const u = await userRow(emailOf("tok1"));
      const token = app.get(JwtService).sign({ sub: u.id, email: u.email, role: u.role });
      expect((await request(server()).get("/api/auth/me").set("Authorization", `Bearer ${token}`)).status).toBe(401);
      expect((await get("/auth/me", ipOf("tok1"), `ruwad_token=${token}`)).status).toBe(401);
    });

    it("existing (grandfathered) verified accounts and administrators sign in and use protected routes exactly as before", async () => {
      const member = await makeUser("legacy1");
      const admin = await makeUser("legacyadmin", { role: "RUWAD_ADMIN" });
      for (const who of [member, admin]) {
        const login = rec(await post("/auth/login", { email: who.email, password: PASSWORD }, ipOf(who.email.slice(-20))));
        const l = await login;
        expect(l.status).toBe(200);
        expect(cookieNames(l)).toContain("ruwad_token");
        const me = await get("/auth/me", ipOf("me"), `ruwad_token=${cookieValue(l, "ruwad_token")}`);
        expect(me.status).toBe(200);
        expect(me.body.email).toBe(who.email);
        expect(me.body.passwordHash).toBeUndefined();
        expect(me.body.emailVerifiedVia).toBe("LEGACY");
      }
    });

    it("password reset on an unverified account sets a password but neither verifies the address nor signs anyone in", async () => {
      await signup("reset1");
      const before = sent.length;
      await post("/auth/forgot-password", { email: emailOf("reset1") }, ipOf("reset1"));
      await waitFor(() => sent.slice(before).some((s) => s.kind === "reset" && s.to === emailOf("reset1")));
      const token = sent.slice(before).find((s) => s.kind === "reset" && s.to === emailOf("reset1"))?.token;
      expect(token).toBeTruthy();
      const reset = await post("/auth/reset-password", { token, password: "Brand-New-Password-2!", confirmPassword: "Brand-New-Password-2!" }, ipOf("reset1"));
      expect(reset.status).toBe(200);
      expect(cookieNames(reset)).not.toContain("ruwad_token");
      expect((await userRow(emailOf("reset1"))).emailVerifiedAt).toBeNull();
      const login = rec(await post("/auth/login", { email: emailOf("reset1"), password: "Brand-New-Password-2!" }, ipOf("reset1")));
      expect((await login).status).toBe(403);
      expect((await login).body.code).toBe("EMAIL_NOT_VERIFIED");
    });
  });

  /* ------------------------------------------------------------------------------------------------------------------------------------------ the code itself */

  describe("entering the code", () => {
    it("the right code, from the browser that signed up, verifies the address, signs the user in, clears the pending cookie, and works only once", async () => {
      const s = await signup("ok1");
      const code = lastCode(emailOf("ok1"));
      const v = await verifyReq("ok1", code, pending(s));
      expect(v.status).toBe(200);
      expect(v.body).toMatchObject({ verified: true, signedIn: true, user: { email: emailOf("ok1") } });
      expect(v.body.user.passwordHash).toBeUndefined();
      expect(cookieNames(v)).toEqual(expect.arrayContaining(["ruwad_token", "ruwad_pending"]));
      expect(cookieValue(v, "ruwad_pending")).toBe(""); // cleared
      const u = await userRow(emailOf("ok1"));
      expect(u.emailVerifiedAt).not.toBeNull();
      expect(u.emailVerifiedVia).toBe("OTP");
      const me = await get("/auth/me", ipOf("ok1"), `ruwad_token=${cookieValue(v, "ruwad_token")}`);
      expect(me.status).toBe(200);
      const rows = await codeRows(emailOf("ok1"));
      expect(rows[0].consumedAt).not.toBeNull();
      const replay = await verifyReq("ok1", code, pending(s));
      expect(replay.status).toBe(400);
      expect(replay.body).toMatchObject({ code: "INVALID_OTP", message: MESSAGE_INVALID });
    });

    it("pasted formats work (spaces and dashes), from another browser the address is verified but nobody is signed in, and a normal login then works", async () => {
      await signup("ok2");
      const code = lastCode(emailOf("ok2"));
      const v = await verifyReq("ok2", `${code.slice(0, 3)} ${code.slice(3)}`, undefined, emailOf("ok2"));
      expect(v.status).toBe(200);
      expect(v.body).toEqual({ verified: true, signedIn: false });
      expect(cookieNames(v)).not.toContain("ruwad_token");
      const login = await post("/auth/login", { email: emailOf("ok2"), password: PASSWORD }, ipOf("ok2"));
      expect(login.status).toBe(200);
      expect(cookieNames(login)).toContain("ruwad_token");
    });

    it("a wrong code is refused with one safe message; five wrong guesses burn the code, and then even the right code is refused", async () => {
      const s = await signup("wrong1");
      const code = lastCode(emailOf("wrong1"));
      const wrong = code === "000000" ? "111111" : "000000";
      for (let i = 1; i <= 5; i++) {
        const r = await verifyReq("wrong1", wrong, pending(s));
        expect(r.status).toBe(400);
        expect(r.body).toMatchObject({ statusCode: 400, code: "INVALID_OTP", message: MESSAGE_INVALID });
        expect((await codeRows(emailOf("wrong1")))[0].attempts).toBe(i);
      }
      expect((await codeRows(emailOf("wrong1")))[0].supersededAt).not.toBeNull();
      const late = await verifyReq("wrong1", code, pending(s));
      expect(late.status).toBe(400);
      expect(late.body.message).toBe(MESSAGE_INVALID);
      expect((await userRow(emailOf("wrong1"))).emailVerifiedAt).toBeNull();
    });

    it("an expired code is refused, with the same message as a wrong one", async () => {
      const s = await signup("exp1");
      const code = lastCode(emailOf("exp1"));
      await db.query(`UPDATE email_verification_codes SET "expiresAt" = now() - interval '1 second' WHERE "userId" = (SELECT id FROM users WHERE email = $1)`, [emailOf("exp1")]);
      const r = await verifyReq("exp1", code, pending(s));
      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ code: "INVALID_OTP", message: MESSAGE_INVALID });
      expect((await userRow(emailOf("exp1"))).emailVerifiedAt).toBeNull();
    });

    it("malformed input is refused the same way (not six digits, empty, too long) and never reaches the database as a guess", async () => {
      const s = await signup("bad1");
      for (const code of ["12345", "1234567", "abcdef", "", "12 34", "1".repeat(40)]) {
        const r = await verifyReq("bad1", code, pending(s));
        expect([400]).toContain(r.status);
      }
      expect((await codeRows(emailOf("bad1")))[0].attempts).toBe(0);
    });

    it("an unknown address and a real one with a wrong code get the identical answer (no account enumeration)", async () => {
      await signup("enum1");
      const real = await verifyReq("enum1", "000001", undefined, emailOf("enum1"));
      const fake = await verifyReq("enum2", "000001", undefined, emailOf("nobody-at-all"));
      expect(real.status).toBe(400);
      expect(fake.status).toBe(real.status);
      expect(fake.body).toEqual(real.body);
    });

    it("eight simultaneous wrong guesses are counted one at a time: exactly five attempts are used, never more", async () => {
      const s = await signup("conc1");
      const code = lastCode(emailOf("conc1"));
      const wrong = code === "000000" ? "111111" : "000000";
      const out = await Promise.all(Array.from({ length: 8 }, () => post("/auth/verify-email", { code: wrong }, ipOf("conc1"), pending(s))));
      out.forEach(rec);
      expect(out.every((r) => r.status === 400)).toBe(true);
      const row = (await codeRows(emailOf("conc1")))[0];
      expect(row.attempts).toBe(5);
      expect(row.supersededAt).not.toBeNull();
    });

    it("two simultaneous submissions of the right code succeed exactly once", async () => {
      const s = await signup("conc2");
      const code = lastCode(emailOf("conc2"));
      const out = await Promise.all([post("/auth/verify-email", { code }, ipOf("conc2"), pending(s)), post("/auth/verify-email", { code }, ipOf("conc2"), pending(s))]);
      out.forEach(rec);
      expect(out.map((r) => r.status).sort()).toEqual([200, 400]);
    });
  });

  /* ---------------------------------------------------------------------------------------------------------------------------------------- resend and limits */

  describe("resending", () => {
    it("holds a new code back for 60 seconds: the browser that signed up is told to wait, anyone else gets the generic answer, and nothing is sent either way", async () => {
      const s = await signup("res1");
      const rowsBefore = (await codeRows(emailOf("res1"))).length;
      const mine = await resendReq("res1", pending(s));
      expect(mine.status).toBe(429);
      expect(mine.body).toMatchObject({ code: "RESEND_COOLDOWN" });
      expect(mine.body.retryAfterSeconds).toBeGreaterThan(0);
      expect(mine.body.retryAfterSeconds).toBeLessThanOrEqual(60);
      const other = await resendReq("res1", undefined, emailOf("res1"));
      expect(other.status).toBe(200);
      expect(other.body).toEqual({ message: expect.any(String), resendAfterSeconds: 60 });
      expect((await codeRows(emailOf("res1"))).length).toBe(rowsBefore);
      expect(codesTo(emailOf("res1"))).toHaveLength(1);
    });

    it("after the cooldown a new code is sent, the previous code stops working, and the new one verifies", async () => {
      const s = await signup("res2");
      const first = lastCode(emailOf("res2"));
      await bypassCooldown(emailOf("res2"));
      const again = await resendReq("res2", pending(s));
      expect(again.status).toBe(200);
      const second = lastCode(emailOf("res2"));
      expect(codesTo(emailOf("res2"))).toHaveLength(2);
      const rows = await codeRows(emailOf("res2"));
      expect(rows).toHaveLength(2);
      expect(rows[0].supersededAt).not.toBeNull();
      expect(rows[1].supersededAt).toBeNull();
      if (first !== second) expect((await verifyReq("res2", first, pending(s))).status).toBe(400);
      expect((await verifyReq("res2", second, pending(s))).status).toBe(200);
    });

    it("the resend answer is identical for a real waiting account, a verified one and an unknown address", async () => {
      await signup("res3");
      await bypassCooldown(emailOf("res3"));
      const verified = await makeUser("res3v");
      const a = await resendReq("res3", undefined, emailOf("res3"));
      const b = await resendReq("res3v", undefined, verified.email);
      const c = await resendReq("res3x", undefined, emailOf("res3-unknown"));
      expect([a.status, b.status, c.status]).toEqual([200, 200, 200]);
      expect(a.body).toEqual(b.body);
      expect(a.body).toEqual(c.body);
      expect(codesTo(verified.email)).toHaveLength(0);
      expect(codesTo(emailOf("res3-unknown"))).toHaveLength(0);
    });

    it("stops at ten delivered codes a day (the browser that signed up is told; nothing more is sent)", async () => {
      const s = await signup("day1");
      const u = await userRow(emailOf("day1"));
      for (let i = 0; i < 9; i++) await db.query(`INSERT INTO email_verification_codes ("userId","codeHash","expiresAt","deliveryResult","createdAt","supersededAt") VALUES ($1,$2,now(),'SENT', now() - interval '5 minutes', now())`, [u.id, "a".repeat(64)]);
      const sentBefore = codesTo(emailOf("day1")).length;
      const r = await resendReq("day1", pending(s));
      expect(r.status).toBe(429);
      expect(r.body).toMatchObject({ code: "RESEND_LIMIT" });
      expect(codesTo(emailOf("day1")).length).toBe(sentBefore);
    });

    it("a per-address cap exists and is silent: past it, sign-up still answers normally but no code is created or sent", async () => {
      const ip = "10.77.77.77";
      const filler = await makeUser("ipfill");
      const h = hashIp(OTP_KEY, ip)!;
      hashIps.push(h);
      for (let i = 0; i < 30; i++) await db.query(`INSERT INTO email_verification_codes ("userId","codeHash","expiresAt","ipHash","deliveryResult","supersededAt") VALUES ($1,$2,now(),$3,'SENT',now())`, [filler.id, "b".repeat(64), h]);
      const res = rec(await post("/auth/register", { firstName: "I", lastName: "ipcap", email: emailOf("ipcap"), password: PASSWORD }, ip));
      expect((await res).status).toBe(201);
      expect((await res).body.status).toBe("verification_required");
      expect(codesTo(emailOf("ipcap"))).toHaveLength(0);
      expect(await codeRows(emailOf("ipcap"))).toHaveLength(0);
    });
  });

  describe("email delivery failures", () => {
    it("a code whose email could not be delivered is recorded as FAILED, sign-up still answers normally, and the person can ask again at once", async () => {
      failDelivery = true;
      let s!: request.Response;
      try { s = await signup("fail1"); } finally { failDelivery = false; }
      expect(s.status).toBe(201);
      expect(s.body.status).toBe("verification_required");
      expect(codesTo(emailOf("fail1")).length).toBeGreaterThanOrEqual(2); // one automatic retry
      expect((await codeRows(emailOf("fail1")))[0].deliveryResult).toBe("FAILED");
      const again = await resendReq("fail1", pending(s)); // not held back by the cooldown: nothing was delivered
      expect(again.status).toBe(200);
      const rows = await codeRows(emailOf("fail1"));
      expect(rows).toHaveLength(2);
      expect(rows[1].deliveryResult).toBe("SENT");
      expect((await verifyReq("fail1", lastCode(emailOf("fail1")), pending(s))).status).toBe(200);
    }, 30_000);
  });

  describe("the pending-verification note", () => {
    it("tells the verify page where the code went from the cookie alone, and says nothing without one", async () => {
      const s = await signup("pend1");
      const withCookie = await get("/auth/pending-verification", ipOf("pend1"), pending(s));
      expect(withCookie.body).toEqual({ pending: true, maskedEmail: "o***@example.test" });
      const without = await get("/auth/pending-verification", ipOf("pend1"));
      expect(without.body).toEqual({ pending: false, maskedEmail: null });
      const tampered = await get("/auth/pending-verification", ipOf("pend1"), `ruwad_pending=${cookieValue(s, "ruwad_pending").slice(0, -3)}AAA`);
      expect(tampered.body).toEqual({ pending: false, maskedEmail: null });
    });
  });

  /* ------------------------------------------------------------------------------------------------------------------------------------------------ nothing leaks */

  describe("secrets and codes never leak", () => {
    it("no issued code, no stored hash and no secret appears in any log line, response body, cookie, or database row; only hashes are stored", async () => {
      const codes = sent.filter((s) => s.kind === "code" && s.code).map((s) => s.code as string);
      expect(codes.length).toBeGreaterThan(10);
      const rows: { codeHash: string }[] = (await db.query(`SELECT * FROM email_verification_codes WHERE "userId" IN (SELECT id FROM users WHERE email LIKE $1)`, [`otp-it-${tag}-%`])).rows;
      const dump = JSON.stringify(rows);
      const hashes = rows.map((r) => r.codeHash);
      const haystack = [...seenBodies, ...logged].join("\n");
      for (const code of new Set(codes)) {
        expect(haystack).not.toContain(`"${code}"`);
        expect(haystack).not.toMatch(new RegExp(`(^|[^0-9])${code}([^0-9]|$)`));
        expect(dump).not.toMatch(new RegExp(`"${code}"`));
      }
      for (const h of hashes) expect(haystack).not.toContain(h);
      expect(haystack).not.toContain(OTP_SECRET);
      expect(haystack).not.toContain(JWT_SECRET);
      expect(dump).not.toContain(OTP_SECRET);
      // the logger did run (so the scan is meaningful) and the email service is the only holder of a code
      expect(logged.length + seenBodies.length).toBeGreaterThan(20);
      expect(fakeEmail.sendEmailVerificationCode).toHaveBeenCalled();
    });
  });

  /* --------------------------------------------------------------------------------------------------------------------------------- verification switched off */

  describe("with EMAIL_VERIFICATION_REQUIRED off (the default) everything behaves as it always did", () => {
    let off: INestApplication;
    beforeAll(async () => { off = await buildApp({}); }, 60_000);
    afterAll(async () => { await off?.close(); });
    const offPost = (path: string, body: object, ip: string, cookie?: string) => post(path, body, ip, cookie, () => off.getHttpServer());

    it("sign-up signs the user in at once and returns the user (no code, no pending cookie, no email)", async () => {
      const before = sent.length;
      const res = await offPost("/auth/register", { firstName: "Off", lastName: "off1", email: emailOf("off1"), password: PASSWORD }, "10.5.5.1");
      expect(res.status).toBe(201);
      expect(res.body.email).toBe(emailOf("off1"));
      expect(res.body.passwordHash).toBeUndefined();
      expect(cookieNames(res)).toEqual(["ruwad_token"]);
      expect(sent.length).toBe(before);
      expect(await codeRows(emailOf("off1"))).toHaveLength(0);
      createdUsers.push((await userRow(emailOf("off1"))).id);
    });

    it("an unverified account (a NULL verified date) can still sign in and use protected routes: nothing is enforced", async () => {
      const u = await makeUser("off2", { verified: false });
      const login = await offPost("/auth/login", { email: u.email, password: PASSWORD }, "10.5.5.2");
      expect(login.status).toBe(200);
      const me = await request(off.getHttpServer()).get("/api/auth/me").set("Cookie", `ruwad_token=${cookieValue(login, "ruwad_token")}`);
      expect(me.status).toBe(200);
    });

    it("a duplicate address still gets today's 409, and the verification endpoints answer 404 as if they did not exist", async () => {
      const dup = await offPost("/auth/register", { firstName: "Off", lastName: "off1", email: emailOf("off1"), password: PASSWORD }, "10.5.5.3");
      expect(dup.status).toBe(409);
      expect((await offPost("/auth/verify-email", { code: "123456", email: emailOf("off1") }, "10.5.5.4")).status).toBe(404);
      expect((await offPost("/auth/resend-verification", { email: emailOf("off1") }, "10.5.5.5")).status).toBe(404);
      const pend = await request(off.getHttpServer()).get("/api/auth/pending-verification");
      expect(pend.body).toEqual({ pending: false, maskedEmail: null });
    });
  });
});
