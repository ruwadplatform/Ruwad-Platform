import { ConflictException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, In, Repository } from "typeorm";
import { AdvisoryBooking } from "./advisory.entities";
import { AdvisoryNotificationKind, AdvisoryNotifier } from "./advisory-notifier";
import { AdvisoryAutomationConfig, readAutomationConfig } from "./advisory-config";
import { AdvisoryAttendanceService } from "./advisory-attendance.service";
import { AdvisoryMeetingService } from "./advisory-meeting.service";

export interface AutomationReport {
  ranAt: string;
  dryRun: boolean;
  /** Unanswered requests that expired. */
  expired: number;
  /** Unanswered reschedule proposals that expired (the original booking is untouched). */
  proposalsExpired: number;
  expiryWarnings: number;
  reminders24h: number;
  reminders1h: number;
  /** Meeting rooms deleted for consultations that ended long ago. */
  roomsClosed: number;
  /** Ended consultations put in the Needs Review queue (with what attendance suggested). */
  needsReview: number;
  /** Consultations completed automatically. Always 0 unless auto-completion was separately approved and switched on. */
  autoCompleted: number;
  /** References of the bookings acted on (or, in a dry run, that WOULD be acted on). */
  references: string[];
}

type CountKey = "expired" | "proposalsExpired" | "expiryWarnings" | "reminders24h" | "reminders1h" | "roomsClosed" | "needsReview" | "autoCompleted";

/** Rows handled per step per run; the next run picks up any more. */
const BATCH = 200;

const rowsOf = <T>(res: unknown): T[] => (Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as T[]) : (res as T[]));

/** The advisory scheduler: expires unanswered requests and reschedule proposals, warns advisors before a request expires, and sends the 24-hour and
 * 1-hour reminders.
 *
 * SAFE BY DEFAULT: it does not run unless ADVISORY_ENABLED and ADVISORY_SCHEDULER_ENABLED are both exactly "true". It is meant to run on ONE backend
 * (AWS), but is also safe if two run at once: every step CLAIMS rows with a single UPDATE … FOR UPDATE SKIP LOCKED that stamps a "sent/expired"
 * column, so a row can be handled by exactly one runner, ever. All email goes through the notifier, which is mock unless ADVISORY_EMAIL_MODE=live,
 * and never emails a demonstration booking.
 *
 * Times are passed in (`now`), never read from inside a step, so tests can drive any moment. An administrator can run one pass by hand (or a dry run
 * that changes nothing) from POST /advisory/admin/automation/run. */
@Injectable()
export class AdvisoryAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdvisoryAutomationService.name);
  readonly config: AdvisoryAutomationConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastReport: AutomationReport | null = null;
  private lastError: string | null = null;

  constructor(
    config: ConfigService,
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(AdvisoryBooking) private readonly bookings: Repository<AdvisoryBooking>,
    private readonly notifier: AdvisoryNotifier,
    private readonly meeting: AdvisoryMeetingService,
    private readonly attendance: AdvisoryAttendanceService,
  ) {
    this.config = readAutomationConfig((k) => config.get<string>(k));
  }

  onModuleInit(): void {
    if (!this.config.schedulerEnabled) {
      this.logger.log("Advisory scheduler: OFF (set ADVISORY_ENABLED=true and ADVISORY_SCHEDULER_ENABLED=true to run it)");
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.config.tickMs);
    this.timer.unref(); // never keeps the process alive on its own
    this.logger.log(`Advisory scheduler: ON, every ${this.config.tickMs / 1000}s (auto-completion ${this.config.autoComplete ? "ON" : "off"})`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  status() {
    return {
      schedulerEnabled: this.config.schedulerEnabled,
      running: this.running,
      tickSeconds: this.config.tickMs / 1000,
      requestExpiryHours: this.config.requestExpiryHours,
      cutoffMinutes: this.config.cutoffMinutes,
      expiryWarningHours: this.config.expiryWarningHours,
      reminderHours: this.config.reminderHours,
      autoComplete: this.config.autoComplete,
      lastReport: this.lastReport,
      lastError: this.lastError,
    };
  }

  /** One scheduled wake-up. Never throws (an error is logged and kept for status()), and never overlaps itself. */
  async tick(now: Date = new Date()): Promise<void> {
    if (this.running) return;
    try {
      this.lastReport = await this.runOnce(now, { dryRun: false });
      this.lastError = null;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : "unknown error";
      this.logger.error(`Advisory scheduler pass failed: ${this.lastError}`);
    }
  }

  /** One pass of every rule. `dryRun` only reports what it would do. Refuses to start while another pass is running in this process. */
  async runOnce(now: Date, opts: { dryRun: boolean }): Promise<AutomationReport> {
    if (this.running) throw new ConflictException("An automation pass is already running.");
    this.running = true;
    try {
      const report: AutomationReport = { ranAt: now.toISOString(), dryRun: opts.dryRun, expired: 0, proposalsExpired: 0, expiryWarnings: 0, reminders24h: 0, reminders1h: 0, roomsClosed: 0, needsReview: 0, autoCompleted: 0, references: [] };
      await this.expirePending(now, opts.dryRun, report);
      await this.expireProposals(now, opts.dryRun, report);
      await this.warnExpiring(now, opts.dryRun, report);
      await this.remind(now, opts.dryRun, report, 24);
      await this.remind(now, opts.dryRun, report, 1);
      await this.flagForReview(now, opts.dryRun, report);
      await this.closeRooms(now, opts.dryRun, report);
      if (!opts.dryRun) this.lastReport = report;
      return report;
    } finally {
      this.running = false;
    }
  }

  // ---- steps -------------------------------------------------------------------------------------------------------------------------------

  /** PENDING requests whose expiresAt has passed → EXPIRED, with an audit event, then both sides are told. */
  private async expirePending(now: Date, dryRun: boolean, report: AutomationReport): Promise<void> {
    const where = `status = 'PENDING' AND "expiresAt" IS NOT NULL AND "expiresAt" <= $1`;
    if (dryRun) return this.preview(where, [now], report, "expired");
    const ids = await this.ds.transaction(async (m) => {
      const claimed = rowsOf<{ id: string }>(await m.query(
        `WITH due AS (SELECT id FROM advisory_bookings WHERE ${where} ORDER BY "expiresAt" LIMIT ${BATCH} FOR UPDATE SKIP LOCKED)
         UPDATE advisory_bookings b SET status = 'EXPIRED', "decidedAt" = $1, "updatedAt" = now() FROM due WHERE b.id = due.id RETURNING b.id`, [now]));
      const got = claimed.map((r) => r.id);
      await this.audit(m, got, "EXPIRED", { fromStatus: "PENDING", toStatus: "EXPIRED", details: { expiredAt: now.toISOString(), reason: "nobody answered in time" } });
      return got;
    });
    await this.notifyAll(ids, "EXPIRED", report, "expired");
  }

  /** Unanswered reschedule proposals whose expiresAt has passed → EXPIRED. The ORIGINAL booking is untouched; the event is logged on it. */
  private async expireProposals(now: Date, dryRun: boolean, report: AutomationReport): Promise<void> {
    const where = `status = 'RESCHEDULE_PROPOSED' AND "expiresAt" IS NOT NULL AND "expiresAt" <= $1`;
    if (dryRun) return this.preview(where, [now], report, "proposalsExpired");
    const claimed = await this.ds.transaction(async (m) => {
      const rows = rowsOf<{ id: string; rescheduledFromId: string | null }>(await m.query(
        `WITH due AS (SELECT id FROM advisory_bookings WHERE ${where} ORDER BY "expiresAt" LIMIT ${BATCH} FOR UPDATE SKIP LOCKED)
         UPDATE advisory_bookings b SET status = 'EXPIRED', "decidedAt" = $1, "updatedAt" = now() FROM due WHERE b.id = due.id RETURNING b.id, b."rescheduledFromId"`, [now]));
      for (const r of rows) {
        if (!r.rescheduledFromId) continue;
        await m.query(
          `INSERT INTO advisory_booking_events ("bookingId", "actorUserId", "actorRole", type, "fromStatus", "toStatus", details) VALUES ($1, NULL, 'SYSTEM', 'RESCHEDULE_EXPIRED', 'CONFIRMED', 'CONFIRMED', $2::jsonb)`,
          [r.rescheduledFromId, JSON.stringify({ proposalId: r.id, expiredAt: now.toISOString() })]);
      }
      return rows;
    });
    await this.notifyAll(claimed.map((r) => r.id), "RESCHEDULE_EXPIRED", report, "proposalsExpired");
  }

  /** Warn the advisor once, `expiryWarningHours` before a request that lived long enough expires. */
  private async warnExpiring(now: Date, dryRun: boolean, report: AutomationReport): Promise<void> {
    const hours = this.config.expiryWarningHours;
    const where = `status = 'PENDING' AND "expiryWarningSentAt" IS NULL AND "expiresAt" > $1 AND "expiresAt" - ($2::numeric * interval '1 hour') <= $1 AND "createdAt" < "expiresAt" - ($2::numeric * interval '1 hour')`;
    if (dryRun) return this.preview(where, [now, hours], report, "expiryWarnings");
    const ids = await this.claimStamp(where, [now, hours], "expiryWarningSentAt", now);
    await this.notifyAll(ids, "EXPIRY_WARNING", report, "expiryWarnings");
  }

  /** A reminder `hoursBefore` hours ahead of the start, for CONFIRMED consultations, once. Skipped when the consultation was only confirmed after the
   * reminder moment (the confirmation email already told them). */
  private async remind(now: Date, dryRun: boolean, report: AutomationReport, hoursBefore: 24 | 1): Promise<void> {
    const column = hoursBefore === 24 ? "reminder24hSentAt" : "reminder1hSentAt";
    const where = `status = 'CONFIRMED' AND "${column}" IS NULL AND "startsAt" > $1 AND "startsAt" - ($2::numeric * interval '1 hour') <= $1 AND COALESCE("decidedAt", "createdAt") <= "startsAt" - ($2::numeric * interval '1 hour')`;
    const key = hoursBefore === 24 ? "reminders24h" : "reminders1h";
    if (dryRun) return this.preview(where, [now, hoursBefore], report, key);
    const ids = await this.claimStamp(where, [now, hoursBefore], column, now);
    await this.notifyAll(ids, hoursBefore === 24 ? "REMINDER_24H" : "REMINDER_1H", report, key);
  }

  /** A CONFIRMED consultation that ended `reviewGraceMinutes` ago (after the meeting window closed) and still has no recorded outcome goes into the Needs
   * Review queue with what attendance SUGGESTS. A person confirms it. The only automatic completion is behind ADVISORY_AUTOCOMPLETE_ENABLED, which is OFF
   * and has not been approved: when (and only when) it is on, a consultation whose attendance shows both parties present together is completed. A
   * suggested no-show, an unknown, or anything doubtful is never completed automatically. Rows are claimed with FOR UPDATE SKIP LOCKED, so two runners
   * can't both handle one. */
  private async flagForReview(now: Date, dryRun: boolean, report: AutomationReport): Promise<void> {
    const afterEnd = this.meeting.config.closesAfterMinutes + this.config.reviewGraceMinutes;
    const where = `status = 'CONFIRMED' AND "needsReview" = false AND "attendanceOutcome" IS NULL AND "endsAt" + ($2::numeric * interval '1 minute') <= $1`;
    if (dryRun) return this.preview(where, [now, afterEnd], report, "needsReview");
    const done: { id: string; auto: boolean }[] = await this.ds.transaction(async (m) => {
      const rows = rowsOf<{ id: string }>(await m.query(`SELECT id FROM advisory_bookings WHERE ${where} ORDER BY "endsAt" LIMIT ${BATCH} FOR UPDATE SKIP LOCKED`, [now, afterEnd]));
      const out: { id: string; auto: boolean }[] = [];
      for (const { id } of rows) {
        const booking = await m.findOneByOrFail(AdvisoryBooking, { id });
        const outcome = await this.attendance.suggestedOutcome(booking, now);
        if (this.config.autoComplete && outcome === "ATTENDED_BOTH") {
          await m.query(`UPDATE advisory_bookings SET status = 'COMPLETED', "completedAt" = $2, "attendanceOutcome" = $3, "needsReview" = false, "updatedAt" = now() WHERE id = $1`, [id, now, outcome]);
          await this.audit(m, [id], "COMPLETED", { fromStatus: "CONFIRMED", toStatus: "COMPLETED", details: { automatic: true, outcome, note: "both parties attended together" } });
          out.push({ id, auto: true });
        } else {
          await m.query(`UPDATE advisory_bookings SET "needsReview" = true, "attendanceOutcome" = $2, "updatedAt" = now() WHERE id = $1`, [id, outcome]);
          await this.audit(m, [id], "NEEDS_REVIEW", { fromStatus: "CONFIRMED", toStatus: "CONFIRMED", details: { suggestedOutcome: outcome } });
          out.push({ id, auto: false });
        }
      }
      return out;
    });
    report.autoCompleted += done.filter((d) => d.auto).length;
    await this.notifyAll(done.filter((d) => !d.auto).map((d) => d.id), "NEEDS_REVIEW", report, "needsReview");
  }

  /** Delete the meeting room of a consultation that ended a while ago (the room has long since expired on the provider's side; this is tidying).
   * If deleting fails, the claim is released so the next pass tries again. */
  private async closeRooms(now: Date, dryRun: boolean, report: AutomationReport): Promise<void> {
    const afterEnd = this.meeting.config.closesAfterMinutes + this.meeting.config.cleanupAfterMinutes;
    const where = `"meetingRoomName" IS NOT NULL AND "meetingRoomClosedAt" IS NULL AND "endsAt" + ($2::numeric * interval '1 minute') <= $1`;
    if (dryRun) return this.preview(where, [now, afterEnd], report, "roomsClosed");
    const ids = await this.claimStamp(where, [now, afterEnd], "meetingRoomClosedAt", now);
    if (!ids.length) return;
    for (const b of await this.bookings.find({ where: { id: In(ids) } })) {
      if (await this.meeting.closeRoom(b)) report.roomsClosed += 1;
      else await this.bookings.update({ id: b.id }, { meetingRoomClosedAt: null });
    }
  }

  // ---- helpers ----------------------------------------------------------------------------------------------------------------------------

  /** Atomically stamps `column` on the matching rows and returns their ids: whoever's UPDATE gets a row owns it; a concurrent runner skips it. */
  private async claimStamp(where: string, params: unknown[], column: string, now: Date): Promise<string[]> {
    const stampParam = params.length + 1;
    const rows = rowsOf<{ id: string }>(await this.ds.query(
      `WITH due AS (SELECT id FROM advisory_bookings WHERE ${where} ORDER BY "startsAt" LIMIT ${BATCH} FOR UPDATE SKIP LOCKED)
       UPDATE advisory_bookings b SET "${column}" = $${stampParam}, "updatedAt" = now() FROM due WHERE b.id = due.id RETURNING b.id`, [...params, now]));
    return rows.map((r) => r.id);
  }

  private async preview(where: string, params: unknown[], report: AutomationReport, key: CountKey): Promise<void> {
    const rows = await this.ds.query(`SELECT reference FROM advisory_bookings WHERE ${where} ORDER BY "startsAt" LIMIT ${BATCH}`, params);
    report[key] += rows.length;
    report.references.push(...rows.map((r: { reference: string }) => r.reference));
  }

  private async audit(m: EntityManager, ids: string[], type: string, e: { fromStatus: string; toStatus: string; details: Record<string, unknown> }): Promise<void> {
    if (!ids.length) return;
    await m.query(
      `INSERT INTO advisory_booking_events ("bookingId", "actorUserId", "actorRole", type, "fromStatus", "toStatus", details)
       SELECT id, NULL, 'SYSTEM', $2, $3, $4, $5::jsonb FROM unnest($1::uuid[]) AS id`, [ids, type, e.fromStatus, e.toStatus, JSON.stringify(e.details)]);
  }

  /** Email (mock by default) AFTER the database change is committed, so a notification problem can never undo or repeat it. */
  private async notifyAll(ids: string[], kind: AdvisoryNotificationKind, report: AutomationReport, key: CountKey): Promise<void> {
    report[key] += ids.length;
    if (!ids.length) return;
    const rows = await this.bookings.find({ where: { id: In(ids) } });
    report.references.push(...rows.map((b) => b.reference));
    for (const b of rows) await this.notifier.notify(b, kind, "SYSTEM");
  }
}
