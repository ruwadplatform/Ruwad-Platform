import { randomUUID } from "crypto";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, IsNull, Repository } from "typeorm";
import { EmailService } from "../email/email.service";
import { User } from "../users/user.entity";
import { UsersService } from "../users/users.service";
import { EmailVerificationCode } from "./email-verification-code.entity";
import { assertOtpConfig, emailVerificationRequired, readOtpSecret } from "./email-verification.config";
import {
  CODE_RETENTION_MS, DAY_MS, MAX_ATTEMPTS, OTP_TTL_MS, PENDING_TTL_MS, PendingTicket, SendDecision, decideSend, generateCode, hashCode, hashIp, hashesEqual, maskEmail,
  normalizeCodeInput, readPending, signPending,
} from "./otp-logic";

export interface IssueResult {
  sent: boolean;
  /** Why nothing was sent, or DELIVERY_FAILED when a code was created but the email provider did not accept it. */
  reason?: "COOLDOWN" | "DAILY" | "ROWS" | "IP" | "DELIVERY_FAILED";
  retryAfterSeconds?: number;
}

const DELIVERY_TIMEOUT_MS = 8000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

/** Email verification with a 6-digit code.
 *
 * The code exists in plain text in exactly two places: this process's memory for the few milliseconds between being generated and being handed to the email
 * provider, and the email itself. It is never stored (only a keyed hash is), never logged, and never returned by any API. */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  readonly required: boolean;
  private readonly key: Buffer | null;
  private lastCleanup = 0;

  constructor(
    config: ConfigService,
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(EmailVerificationCode) private readonly codes: Repository<EmailVerificationCode>,
    private readonly users: UsersService,
    private readonly email: EmailService,
  ) {
    const get = (k: string) => config.get<string>(k);
    assertOtpConfig(get); // verification on with a missing or weak EMAIL_OTP_SECRET: the service refuses to start
    this.required = emailVerificationRequired(get);
    this.key = readOtpSecret(get);
  }

  /** The verification endpoints answer 404 (as if they did not exist) while the feature is off. */
  assertEnabled(): void {
    if (!this.required) throw new NotFoundException();
  }

  private requireKey(): Buffer {
    if (!this.key) throw new Error("Email verification is not configured");
    return this.key;
  }

  /* ---- the pending-verification cookie ---- */

  pendingCookieValue(userId: string, typedEmail: string, now = new Date()): string {
    return signPending(this.requireKey(), { u: userId, m: maskEmail(typedEmail), e: now.getTime() + PENDING_TTL_MS });
  }

  readPendingCookie(token: string | undefined): PendingTicket | null {
    return this.key ? readPending(this.key, token, new Date()) : null;
  }

  /* ---- issuing a code ---- */

  /** Creates a fresh code for an UNVERIFIED account (superseding any earlier one) and emails it, unless a limit says not to. The limit checks and the insert
   * happen under one per-account lock, so two simultaneous requests cannot both slip through the cooldown. */
  async issueCode(user: User, ip: string | undefined): Promise<IssueResult> {
    const key = this.requireKey();
    const now = new Date();
    const code = generateCode();
    const ipHash = hashIp(key, ip);
    let decision = { ok: true } as SendDecision; // assigned inside the transaction callback
    let rowId: string | null = null;

    await this.ds.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`otp:${user.id}`]);
      const since = new Date(now.getTime() - DAY_MS);
      const [h] = await m.query(
        `SELECT max("createdAt") FILTER (WHERE "deliveryResult" IS DISTINCT FROM 'FAILED') AS "lastSentAt",
                count(*) FILTER (WHERE "deliveryResult" IS DISTINCT FROM 'FAILED')::int AS "sent", count(*)::int AS "rows"
           FROM email_verification_codes WHERE "userId" = $1 AND "createdAt" > $2`,
        [user.id, since],
      );
      const ipRows = ipHash ? (await m.query(`SELECT count(*)::int AS n FROM email_verification_codes WHERE "ipHash" = $1 AND "createdAt" > $2`, [ipHash, since]))[0].n : 0;
      decision = decideSend({ lastSentAt: h.lastSentAt ? new Date(h.lastSentAt) : null, sentLast24h: h.sent, rowsLast24h: h.rows, ipRowsLast24h: ipRows }, now);
      if (!decision.ok) return;
      await m.update(EmailVerificationCode, { userId: user.id, consumedAt: IsNull(), supersededAt: IsNull() }, { supersededAt: now });
      const id = randomUUID();
      await m.insert(EmailVerificationCode, {
        id, userId: user.id, codeHash: hashCode(key, user.id, id, code), expiresAt: new Date(now.getTime() + OTP_TTL_MS), attempts: 0, maxAttempts: MAX_ATTEMPTS, ipHash, deliveryResult: null,
      });
      rowId = id;
    });

    if (!decision.ok) return { sent: false, reason: decision.reason, retryAfterSeconds: decision.retryAfterSeconds };
    const delivered = await this.deliver(() => this.email.sendEmailVerificationCode({ to: user.email, firstName: user.firstName, code, minutes: OTP_TTL_MS / 60_000 }));
    // A failed delivery is recorded so it does not start the cooldown or count towards the daily allowance: the person can simply ask again.
    await this.codes.update({ id: rowId! }, { deliveryResult: delivered ? "SENT" : "FAILED" }).catch(() => undefined);
    void this.cleanupIfDue();
    return delivered ? { sent: true } : { sent: false, reason: "DELIVERY_FAILED" };
  }

  /** The notice sent instead of a code when the address already has a verified account. Same delivery rules, nothing stored. */
  async sendExistingAccountNotice(user: User): Promise<boolean> {
    return this.deliver(() => this.email.sendExistingAccountNotice({ to: user.email, firstName: user.firstName }));
  }

  /** One automatic retry after a short pause, and a time limit on each attempt, so a slow or failing provider cannot hang a request. Never throws. */
  private async deliver(send: () => Promise<boolean>): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (await withTimeout(send(), DELIVERY_TIMEOUT_MS)) return true;
      } catch {
        // counted as a failed attempt; nothing about the message is logged
      }
      if (attempt === 0) await sleep(400);
    }
    this.logger.warn("A verification email could not be delivered after a retry");
    return false;
  }

  /* ---- checking a code ---- */

  /** True only when `rawCode` is the live code for this still-unverified account. Wrong, expired, reused, superseded and unknown-account cases all return false and
   * look the same to the caller. Five wrong guesses burn the code. On success the code is consumed and the address marked verified, in one transaction. */
  async verify(user: User | null, rawCode: unknown): Promise<boolean> {
    const key = this.requireKey();
    const code = normalizeCodeInput(rawCode);
    if (!user || !code) {
      await this.dummyWork(key, code ?? "000000");
      return false;
    }
    const now = new Date();
    return this.ds.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`otp:${user.id}`]); // guesses for one account are counted one at a time
      const fresh = await m.findOne(User, { where: { id: user.id } });
      const row = fresh && !fresh.emailVerifiedAt ? await m.findOne(EmailVerificationCode, { where: { userId: user.id, consumedAt: IsNull(), supersededAt: IsNull() }, order: { createdAt: "DESC" } }) : null;
      if (!row || row.expiresAt.getTime() <= now.getTime() || row.attempts >= row.maxAttempts) {
        hashCode(key, user.id, "none", code);
        return false;
      }
      if (!hashesEqual(hashCode(key, user.id, row.id, code), row.codeHash)) {
        const attempts = row.attempts + 1;
        await m.update(EmailVerificationCode, { id: row.id }, { attempts, ...(attempts >= row.maxAttempts ? { supersededAt: now } : {}) });
        return false;
      }
      const claimed = await m.update(EmailVerificationCode, { id: row.id, consumedAt: IsNull(), supersededAt: IsNull() }, { consumedAt: now });
      if (!claimed.affected) return false;
      await m.update(User, { id: user.id, emailVerifiedAt: IsNull() }, { emailVerifiedAt: now, emailVerifiedVia: "OTP" });
      return true;
    });
  }

  /** The work a lookup that found nothing still does, so "no such account" is not much faster than "wrong code". */
  async dummyWork(key: Buffer | null = this.key, code = "000000"): Promise<void> {
    if (key) hashCode(key, "00000000-0000-4000-8000-000000000000", "none", code);
    await this.ds.query(`SELECT 1`);
  }

  /** Deletes old code rows (useless long before this), at most once an hour, never blocking a request. Accounts are NOT deleted here. */
  private async cleanupIfDue(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCleanup < 60 * 60 * 1000) return;
    this.lastCleanup = now;
    try {
      await this.codes.createQueryBuilder().delete().where(`"createdAt" < :cutoff`, { cutoff: new Date(now - CODE_RETENTION_MS) }).execute();
    } catch {
      this.logger.warn("Old verification codes could not be cleaned up this time");
    }
  }

  /** For callers that already hold the typed address. */
  maskedEmail(email: string): string {
    return maskEmail(email);
  }

  /** Used by sign-up so a lookup of an unknown or foreign user id still costs a database round trip. */
  findUser(id: string): Promise<User | null> {
    return this.users.findById(id);
  }
}
