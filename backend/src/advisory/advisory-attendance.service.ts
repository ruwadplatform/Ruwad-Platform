import { randomUUID } from "crypto";
import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, IsNull, Repository } from "typeorm";
import { AuthUser } from "../common/decorators/current-user.decorator";
import { EntityKind, MembershipRole } from "../common/enums";
import { EntityMembership } from "../organizations/entity-membership.entity";
import { AdvisoryAdvisor, AdvisoryBooking, AdvisoryBookingEvent, AdvisoryMeetingAttendance } from "./advisory.entities";
import { AttendanceOutcome, BookingParty, BookingStatus } from "./advisory.enums";
import { AdvisoryAutomationConfig, readAutomationConfig } from "./advisory-config";
import { AdvisoryBookingsService, BookingView } from "./advisory-bookings.service";
import { AttendanceSummary, Presence, decideOutcome, summarizeAttendance, verifyDailyWebhook } from "./attendance-logic";
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
  return new Date(n > 1e12 ? n : n * 1000); // unix seconds, or milliseconds
};

export interface WebhookResult { status: "processed" | "duplicate" | "ignored" | "test" }

/** Who was in the meeting room and when, and what to do about a consultation that has ended.
 *
 * Presence comes from two places and never from the browser of a REAL meeting: Daily's signed webhooks (participant.joined / participant.left), and, for a
 * SIMULATED room only, the page itself (there is no provider to ask). A person recording the outcome is always a human: the advisor or an administrator.
 *
 * NOTE: the webhook payload field names below follow Daily's documentation as far as it could be read (room, session_id, user_id, joined_at, duration,
 * the event's own id and timestamp). They have NOT been checked against live events: confirm them in the supervised live test before relying on them. */
@Injectable()
export class AdvisoryAttendanceService {
  private readonly logger = new Logger(AdvisoryAttendanceService.name);
  private readonly video: VideoConfig;
  readonly automation: AdvisoryAutomationConfig;
  private readonly webhookSecret: string;

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
  }

  // ---- reading ----------------------------------------------------------------------------------------------------------------------------

  private windowOf(b: Pick<AdvisoryBooking, "startsAt" | "endsAt">) {
    const w = meetingWindow(b.startsAt, b.endsAt, this.video);
    return { from: w.opensAt, to: w.closesAt };
  }

  async summary(b: AdvisoryBooking, now = new Date()): Promise<AttendanceSummary> {
    const rows = await this.attendance.find({ where: { bookingId: b.id } });
    return summarizeAttendance(rows.map((r): Presence => ({ role: r.role, joinedAt: r.joinedAt, leftAt: r.leftAt })), this.windowOf(b), now);
  }

  /** What the attendance suggests happened (a suggestion for a person to confirm). */
  async suggestedOutcome(b: AdvisoryBooking, now = new Date()): Promise<AttendanceOutcome> {
    return decideOutcome(await this.summary(b, now), this.automation.attendanceMinMinutes);
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

  /** Writes a join (idempotent per session) or a leave (which closes that session, even if its join arrives later). */
  private async upsertPresence(bookingId: string, userId: string, role: BookingParty, sessionKey: string, kind: "joined" | "left", at: Date, source: string): Promise<void> {
    if (kind === "joined") {
      await this.ds.query(
        `INSERT INTO advisory_meeting_attendance ("bookingId", "userId", role, "sessionKey", "joinedAt", source) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ("bookingId", "userId", "sessionKey") DO UPDATE SET "joinedAt" = LEAST(advisory_meeting_attendance."joinedAt", EXCLUDED."joinedAt")`,
        [bookingId, userId, role, sessionKey, at, source]);
    } else {
      // A leave that arrives before its join creates the row with joinedAt = leftAt; the join, when it comes, pulls joinedAt earlier.
      await this.ds.query(
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
      if (!open) await this.upsertPresence(bookingId, user.userId, side, `sim-${randomUUID()}`, "joined", now, "MOCK");
    } else {
      const open = await this.attendance.findOne({ where: { bookingId, userId: user.userId, source: "MOCK", leftAt: IsNull() }, order: { joinedAt: "DESC" } });
      if (open) await this.upsertPresence(bookingId, user.userId, side, open.sessionKey, "left", now, "MOCK");
    }
    return { ok: true };
  }

  // ---- Daily's webhook ----------------------------------------------------------------------------------------------------------------------

  /** Receives a Daily webhook. The signature is verified against the RAW body first; an unverified request is refused and learns nothing. Anything
   * verified is acknowledged with success (even if it is ignored) so Daily doesn't keep retrying; duplicates are recognised by event id. */
  async handleDailyWebhook(rawBody: Buffer | undefined, headers: Record<string, string | string[] | undefined>, now = new Date()): Promise<WebhookResult> {
    if (!this.webhookSecret) throw new NotFoundException(); // not configured: as if the endpoint didn't exist
    const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
    if (!rawBody || !verifyDailyWebhook({ secretBase64: this.webhookSecret, timestamp: one(headers["x-webhook-timestamp"]), signature: one(headers["x-webhook-signature"]), rawBody, now })) {
      throw new UnauthorizedException("Invalid webhook signature.");
    }
    let body: { id?: string; type?: string; event_ts?: number; payload?: Record<string, unknown>; test?: string };
    try { body = JSON.parse(rawBody.toString("utf8")); } catch { return { status: "ignored" }; }
    if (body.test) return { status: "test" };

    const payload = body.payload ?? {};
    const type = typeof body.type === "string" ? body.type.slice(0, 60) : "unknown";
    const eventId = (typeof body.id === "string" && body.id) || `${type}:${String(payload.session_id ?? "")}:${String(body.event_ts ?? "")}`;
    const fresh = await this.ds.query(`INSERT INTO advisory_webhook_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING id`, [eventId.slice(0, 120), type]);
    if (!Array.isArray(fresh) || fresh.length === 0) return { status: "duplicate" };

    if (type !== "participant.joined" && type !== "participant.left") return { status: "ignored" };
    const room = typeof payload.room === "string" ? payload.room : typeof payload.room_name === "string" ? payload.room_name : null;
    const userId = typeof payload.user_id === "string" ? payload.user_id : null;
    if (!room || !userId) return { status: "ignored" };
    const booking = await this.bookings.findOne({ where: { meetingRoomName: room } });
    if (!booking) return { status: "ignored" };
    const role = await this.roleOf(booking, userId);
    if (!role) return { status: "ignored" }; // someone who isn't a participant of this consultation: not recorded
    const sessionKey = String(payload.session_id ?? `${userId}:${room}`).slice(0, 80);
    const eventTime = toDate(body.event_ts) ?? now;

    if (type === "participant.joined") {
      await this.upsertPresence(booking.id, userId, role, sessionKey, "joined", toDate(payload.joined_at) ?? eventTime, "WEBHOOK");
    } else {
      const joined = toDate(payload.joined_at);
      const duration = typeof payload.duration === "number" ? payload.duration : null;
      const left = joined && duration !== null ? new Date(joined.getTime() + duration * 1000) : eventTime;
      await this.upsertPresence(booking.id, userId, role, sessionKey, "left", left, "WEBHOOK");
    }
    return { status: "processed" };
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
