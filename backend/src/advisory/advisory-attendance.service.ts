import { randomUUID } from "crypto";
import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, IsNull, Repository } from "typeorm";
import { AuthUser } from "../common/decorators/current-user.decorator";
import { EntityKind, MembershipRole } from "../common/enums";
import { EntityMembership } from "../organizations/entity-membership.entity";
import { AdvisoryAdvisor, AdvisoryBooking, AdvisoryBookingEvent, AdvisoryMeetingAttendance } from "./advisory.entities";
import { AttendanceOutcome, BookingParty, BookingStatus } from "./advisory.enums";
import { AdvisoryAutomationConfig, readAutomationConfig } from "./advisory-config";
import { AdvisoryBookingsService, BookingView } from "./advisory-bookings.service";
import { AttendanceSummary, Presence, WebhookCheck, checkDailyWebhook, decideOutcome, deriveSegments, summarizeAttendance } from "./attendance-logic";
import { assertTransition } from "./booking-state";
import { meetingState, meetingWindow } from "./meeting-window";
import { VIDEO_PROVIDER, VideoProvider } from "./video/video-provider";
import { VideoConfig, readVideoConfig } from "./video/video-config";
import { cleanText } from "./advisory-text";

/** The outcomes a person can record. UNKNOWN and NO_OVERLAP are things the system detects; they are not resolutions. */
export const MANUAL_OUTCOMES: AttendanceOutcome[] = ["ATTENDED_BOTH", "FOUNDER_NO_SHOW", "ADVISOR_NO_SHOW", "BOTH_NO_SHOW"];

const toDate = (v: unknown): Date | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return new Date(n > 1e12 ? n : n * 1000); // unix seconds (Daily sends fractions, e.g. 1708972291.567), or milliseconds
};

export interface WebhookResult { status: "processed" | "duplicate" | "ignored" | "test" }

/** Anything that can run a query: the DataSource, or the EntityManager of an open transaction. */
type Db = Pick<DataSource, "query">;

/** Who was in the meeting room and when, and what to do about a consultation that has ended.
 *
 * Presence comes from two places and never from the browser of a REAL meeting: Daily's signed webhooks (participant.joined / participant.left), and, for a
 * SIMULATED room only, the page itself (there is no provider to ask). A person recording the outcome is always a human: the advisor or an administrator.
 *
 * The webhook payload field names follow Daily's published documentation (envelope: version, type, id, payload, event_ts; payload: room, session_id,
 * user_id, joined_at in unix SECONDS with a fraction, duration in seconds). They were verified against LIVE events from Daily in the supervised test of
 * 2026-10-28 (docs/advisory-daily-webhook-live-test.md, section 9), which also showed what the documentation does not say: X-Webhook-Timestamp is in
 * MILLISECONDS, a retried delivery keeps its event id but gets a fresh timestamp, and one session can send several participant.left events. */
@Injectable()
export class AdvisoryAttendanceService {
  private readonly logger = new Logger(AdvisoryAttendanceService.name);
  private readonly video: VideoConfig;
  readonly automation: AdvisoryAutomationConfig;
  private readonly webhookSecret: string;
  /** How far a webhook's timestamp may be from now. Daily's documentation names no window, so it can be widened (30-3600 s) without a code change. */
  private readonly webhookToleranceSeconds: number;

  constructor(
    config: ConfigService,
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(AdvisoryBooking) private readonly bookings: Repository<AdvisoryBooking>,
    @InjectRepository(AdvisoryMeetingAttendance) private readonly attendance: Repository<AdvisoryMeetingAttendance>,
    @InjectRepository(AdvisoryAdvisor) private readonly advisors: Repository<AdvisoryAdvisor>,
    @InjectRepository(AdvisoryBookingEvent) private readonly events: Repository<AdvisoryBookingEvent>,
    @InjectRepository(EntityMembership) private readonly memberships: Repository<EntityMembership>,
    @Inject(VIDEO_PROVIDER) private readonly provider: VideoProvider,
    private readonly bookingsService: AdvisoryBookingsService,
  ) {
    this.video = readVideoConfig((k) => config.get<string>(k));
    this.automation = readAutomationConfig((k) => config.get<string>(k));
    this.webhookSecret = (config.get<string>("DAILY_WEBHOOK_SECRET") ?? "").trim();
    const tolerance = Number((config.get<string>("DAILY_WEBHOOK_TOLERANCE_SECONDS") ?? "").trim());
    this.webhookToleranceSeconds = Number.isFinite(tolerance) && tolerance >= 30 && tolerance <= 3600 ? Math.round(tolerance) : 300;
  }

  // ---- reading ----------------------------------------------------------------------------------------------------------------------------

  private windowOf(b: Pick<AdvisoryBooking, "startsAt" | "endsAt">) {
    const w = meetingWindow(b.startsAt, b.endsAt, this.video);
    return { from: w.opensAt, to: w.closesAt };
  }

  /** `m` reads inside an open transaction, so a change made earlier in that transaction is seen. */
  async summary(b: AdvisoryBooking, now = new Date(), m?: EntityManager): Promise<AttendanceSummary> {
    const rows = await (m ? m.getRepository(AdvisoryMeetingAttendance) : this.attendance).find({ where: { bookingId: b.id } });
    return summarizeAttendance(rows.map((r): Presence => ({ role: r.role, joinedAt: r.joinedAt, leftAt: r.leftAt })), this.windowOf(b), now);
  }

  /** What the attendance suggests happened (a suggestion for a person to confirm). */
  async suggestedOutcome(b: AdvisoryBooking, now = new Date(), m?: EntityManager): Promise<AttendanceOutcome> {
    return decideOutcome(await this.summary(b, now, m), this.automation.attendanceMinMinutes);
  }

  // ---- recording presence -------------------------------------------------------------------------------------------------------------------

  /** Which side a user is on for a booking, for attendance: the advisor, or a startup OWNER/ADMIN. Anyone else is not a participant. */
  private async roleOf(b: AdvisoryBooking, userId: string): Promise<BookingParty | null> {
    const advisor = await this.advisors.findOne({ where: { id: b.advisorId } });
    if (advisor?.userId === userId) return "ADVISOR";
    const m = await this.memberships.findOne({ where: { userId, kind: EntityKind.STARTUP, entityId: b.startupId } });
    if (m && (m.role === MembershipRole.OWNER || m.role === MembershipRole.ADMIN)) return "FOUNDER";
    return null;
  }

  /** Writes a SIMULATED room's join (idempotent per session) or leave (which closes that session). Only the simulated room uses this: a real meeting's
   * attendance goes through the event ledger (applyWebhookPresence). Times only move outward (earliest join, latest leave), so a repeat can't shrink
   * what was recorded. */
  private async upsertPresence(db: Db, bookingId: string, userId: string, role: BookingParty, sessionKey: string, kind: "joined" | "left", at: Date, source: string): Promise<void> {
    if (kind === "joined") {
      await db.query(
        `INSERT INTO advisory_meeting_attendance ("bookingId", "userId", role, "sessionKey", "joinedAt", source) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ("bookingId", "userId", "sessionKey") DO UPDATE SET "joinedAt" = LEAST(advisory_meeting_attendance."joinedAt", EXCLUDED."joinedAt")`,
        [bookingId, userId, role, sessionKey, at, source]);
    } else {
      await db.query(
        `INSERT INTO advisory_meeting_attendance ("bookingId", "userId", role, "sessionKey", "joinedAt", "leftAt", source) VALUES ($1, $2, $3, $4, $5, $5, $6)
         ON CONFLICT ("bookingId", "userId", "sessionKey") DO UPDATE SET "leftAt" = GREATEST(COALESCE(advisory_meeting_attendance."leftAt", EXCLUDED."leftAt"), EXCLUDED."leftAt")`,
        [bookingId, userId, role, sessionKey, at, source]);
    }
  }

  /** A person in a SIMULATED room reports that they joined or left. Refused for real meetings: there, attendance only ever comes from the provider. */
  async recordPresence(user: AuthUser, bookingId: string, event: "joined" | "left", now = new Date()): Promise<{ ok: true }> {
    const { booking, side } = await this.bookingsService.forMeeting(user, bookingId, false);
    if (side !== "FOUNDER" && side !== "ADVISOR") throw new ForbiddenException("Only the advisor and the startup can be in this meeting.");
    if (!(booking.isDemo || this.provider.kind === "mock")) throw new ConflictException("Attendance for a real meeting comes from the video provider.");
    if (meetingState(booking.status, booking.startsAt, booking.endsAt, now, this.video) !== "OPEN") throw new ConflictException("The meeting isn't open.");
    if (event === "joined") {
      const open = await this.attendance.findOne({ where: { bookingId, userId: user.userId, source: "MOCK", leftAt: IsNull() } });
      if (!open) await this.upsertPresence(this.ds, bookingId, user.userId, side, `sim-${randomUUID()}`, "joined", now, "MOCK");
    } else {
      const open = await this.attendance.findOne({ where: { bookingId, userId: user.userId, source: "MOCK", leftAt: IsNull() }, order: { joinedAt: "DESC" } });
      if (open) await this.upsertPresence(this.ds, bookingId, user.userId, side, open.sessionKey, "left", now, "MOCK");
    }
    return { ok: true };
  }

  // ---- Daily's webhook ----------------------------------------------------------------------------------------------------------------------

  /** Receives a Daily webhook. The signature is verified against the RAW body first; an unverified request is refused and learns nothing. Anything
   * verified is acknowledged with success (even if it is ignored) so Daily doesn't keep retrying.
   *
   * Every join and leave is stored ONCE in a ledger, by its own time, and the connected stretches are derived from the set of events (see deriveSegments):
   * a repeated event (under the same id or a new one), a late event or an out-of-order event changes nothing, and a disconnected gap is never counted.
   * The "seen" marker, the ledger entry and the stretches are written in ONE transaction: if anything fails they all roll back, so Daily's retry is
   * processed instead of being thrown away as a duplicate.
   *
   * Only attendance rows (and, for a consultation already waiting for review, its suggested outcome) are ever written. A webhook never changes a
   * booking's status, never completes anything, and can only touch the one booking whose unguessable room name it names. Nothing sensitive is logged:
   * no body, signature, secret, token or header value. */
  async handleDailyWebhook(rawBody: Buffer | undefined, headers: Record<string, string | string[] | undefined>, now = new Date()): Promise<WebhookResult> {
    if (!this.webhookSecret) throw new NotFoundException(); // not configured: as if the endpoint didn't exist
    const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
    const check: WebhookCheck = rawBody
      ? checkDailyWebhook({ secretBase64: this.webhookSecret, timestamp: one(headers["x-webhook-timestamp"]), signature: one(headers["x-webhook-signature"]), rawBody, now, toleranceSeconds: this.webhookToleranceSeconds })
      : { ok: false, reason: "missing-header" };
    if (!check.ok) {
      this.logger.warn(`Daily webhook refused: ${check.reason}${check.skewSeconds !== undefined ? ` (timestamp ${check.skewSeconds}s from now, allowed ${this.webhookToleranceSeconds}s)` : ""}`);
      throw new UnauthorizedException("Invalid webhook signature.");
    }
    let body: { id?: string; type?: string; event_ts?: number; payload?: Record<string, unknown>; test?: string };
    try { body = JSON.parse(rawBody!.toString("utf8")); } catch { return { status: "ignored" }; }
    if (body.test) return { status: "test" };

    const payload = body.payload ?? {};
    const type = typeof body.type === "string" ? body.type.slice(0, 60) : "unknown";
    const sessionId = typeof payload.session_id === "string" && payload.session_id ? payload.session_id : null;
    const isPresence = type === "participant.joined" || type === "participant.left";
    const eventId = ((typeof body.id === "string" && body.id) || `${type}:${String(sessionId ?? "")}:${String(body.event_ts ?? "")}`).slice(0, 120);

    const outcome = await this.ds.transaction(async (m): Promise<{ status: WebhookResult["status"]; why: string }> => {
      const fresh = await m.query(`INSERT INTO advisory_webhook_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING id`, [eventId, type]);
      if (!Array.isArray(fresh) || fresh.length === 0) return { status: "duplicate", why: "already processed" };
      if (!isPresence) return { status: "ignored", why: "event type not used" };
      const room = typeof payload.room === "string" ? payload.room : typeof payload.room_name === "string" ? payload.room_name : null;
      const userId = typeof payload.user_id === "string" ? payload.user_id : null;
      if (!room || !userId) return { status: "ignored", why: "no room or no user" };
      const booking = await this.bookings.findOne({ where: { meetingRoomName: room } });
      if (!booking) return { status: "ignored", why: "unknown room" };
      const role = await this.roleOf(booking, userId);
      if (!role) return { status: "ignored", why: "not a participant of that consultation" }; // someone who isn't a participant: not recorded
      const sessionKey = String(sessionId ?? `${userId}:${room}`).slice(0, 70); // leaves room for the "#n" of a later stretch
      const joinedAt = toDate(payload.joined_at); // Daily's joined_at is the FIRST join of the session, on every event of it
      const eventTime = toDate(body.event_ts);
      // The moment each event happened: a join's event_ts (for a REjoin this is when the connection came back; joined_at would be the first join), and a
      // leave's joined_at + duration (equal to its event_ts).
      const duration = typeof payload.duration === "number" && payload.duration >= 0 ? payload.duration : null;
      const kind = type === "participant.joined" ? "joined" : "left";
      const at = kind === "joined" ? (eventTime ?? joinedAt ?? now) : joinedAt && duration !== null ? new Date(joinedAt.getTime() + duration * 1000) : (eventTime ?? now);
      if (!(await this.applyWebhookPresence(m, booking.id, userId, role, sessionKey, kind, at, joinedAt))) return { status: "duplicate", why: "that join/leave was already recorded" };
      await this.refreshSuggestion(m, booking.id, now);
      return { status: "processed", why: `${role.toLowerCase()} ${kind} ${booking.reference}` };
    });
    this.logger.log(`Daily webhook ${type}: ${outcome.status} (${outcome.why})`);
    return { status: outcome.status };
  }

  /** Stores one join or leave in the ledger and rewrites that session's connected stretches from ALL its events. Returns false if this exact event
   * (same session, kind and moment) was already recorded. One writer per session at a time: a concurrent event for the same session waits for this
   * transaction, then sees its event, so two near-simultaneous webhooks can never overwrite each other's stretches. */
  private async applyWebhookPresence(m: EntityManager, bookingId: string, userId: string, role: BookingParty, sessionKey: string, kind: "joined" | "left", at: Date, stayStartedAt: Date | null): Promise<boolean> {
    await m.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`${bookingId}|${userId}|${sessionKey}`]);
    const fresh = await m.query(
      `INSERT INTO advisory_presence_events ("bookingId", "userId", role, "sessionKey", kind, "occurredAt", "stayStartedAt") VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT ("bookingId", "userId", "sessionKey", kind, "occurredAt") DO NOTHING RETURNING id`, [bookingId, userId, role, sessionKey, kind, at, stayStartedAt]);
    if (!Array.isArray(fresh) || fresh.length === 0) return false;
    const events = (await m.query(`SELECT kind, "occurredAt", "stayStartedAt" FROM advisory_presence_events WHERE "bookingId" = $1 AND "userId" = $2 AND "sessionKey" = $3`, [bookingId, userId, sessionKey])) as { kind: "joined" | "left"; occurredAt: Date; stayStartedAt: Date | null }[];
    const segments = deriveSegments(events.map((e) => ({ kind: e.kind, at: new Date(e.occurredAt), stayStartedAt: e.stayStartedAt ? new Date(e.stayStartedAt) : null })));
    await m.query(`DELETE FROM advisory_meeting_attendance WHERE "bookingId" = $1 AND "userId" = $2 AND source = 'WEBHOOK' AND ("sessionKey" = $3 OR starts_with("sessionKey", $3 || '#'))`, [bookingId, userId, sessionKey]);
    for (const [i, seg] of segments.entries()) {
      await m.query(
        `INSERT INTO advisory_meeting_attendance ("bookingId", "userId", role, "sessionKey", "joinedAt", "leftAt", source) VALUES ($1, $2, $3, $4, $5, $6, 'WEBHOOK')`,
        [bookingId, userId, role, i === 0 ? sessionKey : `${sessionKey}#${i}`, seg.from, seg.to]);
    }
    return true;
  }

  /** Late attendance data (a delayed or retried event) for a consultation that is ALREADY waiting for review: the stored suggestion is brought up to
   * date, and the change is recorded in the booking's history. Nothing else changes: the status stays CONFIRMED and nothing is completed. A consultation
   * that is not waiting for review, or was already concluded by a person, is left exactly as it is. */
  private async refreshSuggestion(m: EntityManager, bookingId: string, now: Date): Promise<void> {
    const peek = await m.findOne(AdvisoryBooking, { where: { id: bookingId } }); // the common case (not waiting for review) takes no lock
    if (!peek || !peek.needsReview || peek.status !== BookingStatus.CONFIRMED) return;
    const b = await m.findOne(AdvisoryBooking, { where: { id: bookingId }, lock: { mode: "pessimistic_write" } }); // serialises with a person concluding it
    if (!b || !b.needsReview || b.status !== BookingStatus.CONFIRMED) return;
    const suggested = await this.suggestedOutcome(b, now, m);
    if (suggested === b.attendanceOutcome) return;
    await m.update(AdvisoryBooking, { id: bookingId }, { attendanceOutcome: suggested });
    await m.save(m.create(AdvisoryBookingEvent, { bookingId, actorUserId: null, actorRole: "SYSTEM", type: "SUGGESTION_UPDATED", fromStatus: BookingStatus.CONFIRMED, toStatus: BookingStatus.CONFIRMED, details: { from: b.attendanceOutcome, to: suggested, cause: "late attendance data" } }));
  }

  // ---- what happened: recorded by a person --------------------------------------------------------------------------------------------------

  /** The advisor, or an administrator, records what happened at a consultation that has ended. This is the ONLY way (short of auto-completion, which is
   * off unless separately approved) a CONFIRMED consultation becomes COMPLETED because of attendance. There is no NO_SHOW status: the outcome is
   * stored next to the booking, which becomes COMPLETED (concluded) and leaves the Needs Review queue. */
  async resolveOutcome(user: AuthUser, id: string, outcome: AttendanceOutcome, note: string | undefined, now = new Date()): Promise<BookingView> {
    const { booking, side } = await this.bookingsService.forMeeting(user, id, false);
    if (side !== "ADVISOR" && side !== "ADMIN") throw new ForbiddenException("Only the advisor or an administrator can record what happened.");
    if (!MANUAL_OUTCOMES.includes(outcome)) throw new ConflictException("That isn't an outcome you can record.");
    if (booking.status !== BookingStatus.CONFIRMED) throw new ConflictException("Only a confirmed consultation can be concluded.");
    if (booking.endsAt > now) throw new ConflictException("The consultation hasn't ended yet.");
    const suggested = await this.suggestedOutcome(booking, now);
    const cleaned = cleanText(note) || null;
    await this.ds.transaction(async (m) => {
      const row = await m.findOne(AdvisoryBooking, { where: { id }, lock: { mode: "pessimistic_write" } });
      if (!row) throw new NotFoundException("Booking not found.");
      assertTransition(row.status, BookingStatus.COMPLETED);
      row.status = BookingStatus.COMPLETED;
      row.completedAt = now;
      row.attendanceOutcome = outcome;
      row.needsReview = false;
      await m.save(row);
      await m.update(AdvisoryBooking, { rescheduledFromId: id, status: BookingStatus.RESCHEDULE_PROPOSED }, { status: BookingStatus.CANCELLED, decidedAt: now });
      await m.save(m.create(AdvisoryBookingEvent, { bookingId: id, actorUserId: user.userId, actorRole: side, type: "OUTCOME_RESOLVED", fromStatus: BookingStatus.CONFIRMED, toStatus: BookingStatus.COMPLETED, details: { outcome, suggested, note: cleaned } }));
    });
    return (await this.bookingsService.views([await this.bookings.findOneByOrFail({ id })]))[0]!;
  }
}
