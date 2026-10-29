import { randomBytes } from "crypto";
import { ConflictException, ForbiddenException, Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BookingsDisabledException, bookingsEnabled } from "./advisory-bookings-gate";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuthUser } from "../common/decorators/current-user.decorator";
import { User } from "../users/user.entity";
import { AdvisoryBooking, AdvisoryBookingEvent } from "./advisory.entities";
import { BookingStatus } from "./advisory.enums";
import { AdvisoryAttendanceService } from "./advisory-attendance.service";
import { AdvisoryBookingsService } from "./advisory-bookings.service";
import { AttendanceSummary } from "./attendance-logic";
import { MEETING_NOTICE, MeetingState, meetingState, meetingWindow } from "./meeting-window";
import { VIDEO_PROVIDER, VideoProvider, VideoProviderError } from "./video/video-provider";
import { MockVideoProvider } from "./video/mock-video-provider";
import { VideoConfig, readVideoConfig } from "./video/video-config";

const ROOM_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
/** An unguessable room name (100 bits of randomness). Carries no booking id, user or date. */
export function newRoomName(): string {
  return `ruwad-${[...randomBytes(20)].map((b) => ROOM_ALPHABET[b % 32]).join("")}`;
}

export interface JoinInfo {
  /** "daily": load the URL with the token into Daily Prebuilt. "simulated": show the pretend room (no network, no camera). */
  mode: "daily" | "simulated";
  roomUrl: string | null;
  token: string;
  userName: string;
  opensAt: string;
  closesAt: string;
  /** The token (and the room) stop working at this time. */
  tokenExpiresAt: string;
  recording: false;
  notice: string;
}

export interface MeetingStatus {
  state: MeetingState;
  opensAt: string;
  closesAt: string;
  mode: "daily" | "simulated";
  /** The video provider is set up. False when "daily" was requested without credentials. */
  available: boolean;
  /** The caller may press Join right now. */
  canJoin: boolean;
  recording: false;
  notice: string;
  /** Who has been in the room, and who is in it now. */
  attendance: AttendanceSummary;
}

/** The consultation meeting room: who may join, when, and with what. Joining requires a CONFIRMED booking, being the advisor or an OWNER/ADMIN of the
 * startup, and being inside the join window. Each join mints a fresh, single-room, time-limited token server-side; nothing about the room or the
 * token is stored beyond the room NAME. Demonstration bookings always get a simulated room, whatever provider is configured: they never reach a real
 * video service, so they never cost anything. */
@Injectable()
export class AdvisoryMeetingService {
  private readonly logger = new Logger(AdvisoryMeetingService.name);
  readonly config: VideoConfig;
  private readonly bookingsOn: boolean;
  private readonly simulated = new MockVideoProvider();

  constructor(
    config: ConfigService,
    @Inject(VIDEO_PROVIDER) private readonly provider: VideoProvider,
    @InjectRepository(AdvisoryBooking) private readonly bookings: Repository<AdvisoryBooking>,
    @InjectRepository(AdvisoryBookingEvent) private readonly events: Repository<AdvisoryBookingEvent>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly bookingsService: AdvisoryBookingsService,
    private readonly attendance: AdvisoryAttendanceService,
  ) {
    this.config = readVideoConfig((k) => config.get<string>(k));
    this.bookingsOn = bookingsEnabled((k) => config.get<string>(k));
  }

  /** What a booking would use: simulated for demonstrations (and for the mock provider), the configured provider otherwise. */
  private providerFor(b: Pick<AdvisoryBooking, "isDemo">): VideoProvider {
    return b.isDemo ? this.simulated : this.provider;
  }

  async status(user: AuthUser, bookingId: string, now = new Date()): Promise<MeetingStatus> {
    const { booking, canAct } = await this.bookingsService.forMeeting(user, bookingId, true);
    const state = meetingState(booking.status, booking.startsAt, booking.endsAt, now, this.config);
    const { opensAt, closesAt } = meetingWindow(booking.startsAt, booking.endsAt, this.config);
    const provider = this.providerFor(booking);
    const available = booking.isDemo || this.config.configured;
    return {
      state,
      opensAt: opensAt.toISOString(),
      closesAt: closesAt.toISOString(),
      mode: provider.kind === "daily" ? "daily" : "simulated",
      available,
      canJoin: state === "OPEN" && available && canAct,
      recording: false,
      notice: MEETING_NOTICE,
      attendance: await this.attendance.summary(booking, now),
    };
  }

  async join(user: AuthUser, bookingId: string, now = new Date()): Promise<JoinInfo> {
    if (!this.bookingsOn) throw new BookingsDisabledException(); // the only code that opens a video room: refused first, before the booking is even read
    const { booking, side } = await this.bookingsService.forMeeting(user, bookingId, false); // acting side only: advisor or startup OWNER/ADMIN
    if (side !== "FOUNDER" && side !== "ADVISOR") throw new ForbiddenException("Only the advisor and the startup can join this consultation.");
    const state = meetingState(booking.status, booking.startsAt, booking.endsAt, now, this.config);
    const { opensAt, closesAt } = meetingWindow(booking.startsAt, booking.endsAt, this.config);
    if (state === "NOT_CONFIRMED") throw new ConflictException("This consultation isn't confirmed, so there is no meeting to join.");
    if (state === "NOT_OPEN") throw new ConflictException(`The meeting opens ${this.config.opensBeforeMinutes} minutes before the start.`);
    if (state === "ENDED") throw new ConflictException("This meeting has ended.");
    if (!booking.isDemo && !this.config.configured) throw new ServiceUnavailableException("Video meetings aren't set up yet.");

    const provider = this.providerFor(booking);
    const roomName = await this.roomNameFor(booking, provider);
    const person = await this.users.findOne({ where: { id: user.userId }, select: { id: true, firstName: true, lastName: true } });
    const userName = person ? `${person.firstName} ${person.lastName}`.trim() : side === "ADVISOR" ? "Advisor" : "Startup";

    try {
      const room = await provider.ensureRoom({ name: roomName, notBefore: opensAt, expiresAt: closesAt, maxParticipants: this.config.maxParticipants });
      if (!booking.meetingRoomCreatedAt) await this.bookings.update({ id: booking.id }, { meetingRoomCreatedAt: now });
      const { token } = await provider.createToken({ roomName, userId: user.userId, userName, isOwner: side === "ADVISOR", notBefore: opensAt, expiresAt: closesAt });
      await this.events.save(this.events.create({ bookingId: booking.id, actorUserId: user.userId, actorRole: side, type: "JOIN_REQUESTED", fromStatus: null, toStatus: null, details: { mode: provider.kind === "daily" ? "daily" : "simulated" } }));
      return {
        mode: provider.kind === "daily" ? "daily" : "simulated",
        roomUrl: room.url,
        token,
        userName,
        opensAt: opensAt.toISOString(),
        closesAt: closesAt.toISOString(),
        tokenExpiresAt: closesAt.toISOString(),
        recording: false,
        notice: MEETING_NOTICE,
      };
    } catch (e) {
      if (e instanceof VideoProviderError) {
        this.logger.error(`Video provider error for ${booking.reference}: ${e.message}`); // never includes a key, token or response body
        throw new ServiceUnavailableException("Video isn't available right now. Please try again in a moment.");
      }
      throw e;
    }
  }

  /** The booking's room name, creating one (race-safely: the first writer wins) the first time anyone joins. A room made under a different
   * provider than the one now in use is replaced rather than reused. */
  private async roomNameFor(b: AdvisoryBooking, provider: VideoProvider): Promise<string> {
    if (b.meetingRoomName && b.meetingProvider === provider.kind) return b.meetingRoomName;
    const name = newRoomName();
    if (b.meetingRoomName) {
      // provider changed since the room was made: start a fresh room
      await this.bookings.update({ id: b.id }, { meetingRoomName: name, meetingProvider: provider.kind, meetingRoomCreatedAt: null, meetingRoomClosedAt: null });
      return name;
    }
    const claimed = await this.bookings.createQueryBuilder().update(AdvisoryBooking).set({ meetingRoomName: name, meetingProvider: provider.kind })
      .where(`id = :id AND "meetingRoomName" IS NULL`, { id: b.id }).execute();
    if (claimed.affected) return name;
    const fresh = await this.bookings.findOneByOrFail({ id: b.id }); // someone else created it a moment ago: use theirs
    return fresh.meetingRoomName!;
  }

  /** For the scheduler: delete the room of a consultation that ended long ago. Best effort; the room has already expired on the provider's side. */
  async closeRoom(b: Pick<AdvisoryBooking, "id" | "isDemo" | "meetingRoomName" | "meetingProvider">): Promise<boolean> {
    if (!b.meetingRoomName) return true;
    const provider = b.isDemo ? this.simulated : this.provider;
    if (b.meetingProvider && b.meetingProvider !== provider.kind) {
      // The room was made under a different provider than the one configured now; this provider can't delete it. Nothing more to do: don't retry forever.
      this.logger.warn("A meeting room was made under a different video provider; leaving it to expire on its own");
      return true;
    }
    try {
      await provider.deleteRoom(b.meetingRoomName);
      return true;
    } catch (e) {
      this.logger.warn(`Could not delete a meeting room: ${e instanceof Error ? e.message : "unknown error"}`);
      return false;
    }
  }

  get isConfigured(): boolean {
    return this.config.configured;
  }

  /** The statuses a meeting can exist for (used by tests and the scheduler's clean-up query). */
  static readonly MEETING_STATUSES: BookingStatus[] = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED];
}
