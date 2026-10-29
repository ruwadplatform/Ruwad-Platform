import { randomBytes, randomUUID } from "crypto";
import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, In, Repository } from "typeorm";
import { AuthUser } from "../common/decorators/current-user.decorator";
import { EntityKind, MembershipRole, UserRole } from "../common/enums";
import { EntityMembership } from "../organizations/entity-membership.entity";
import { Startup } from "../startups/startup.entity";
import { User } from "../users/user.entity";
import { AdvisoryAdvisor, AdvisoryBooking, AdvisoryBookingEvent } from "./advisory.entities";
import { AdvisorStatus, BookingActorRole, BookingParty, BookingStatus } from "./advisory.enums";
import { AdvisoryAdvisorsService } from "./advisory-advisors.service";
import { computeExpiresAt, computeProposalExpiresAt } from "./advisory-automation-rules";
import { BookingsDisabledException, bookingsEnabled } from "./advisory-bookings-gate";
import { AdvisoryAutomationConfig, readAutomationConfig } from "./advisory-config";
import { AdvisoryNotificationKind, AdvisoryNotifier } from "./advisory-notifier";
import { datesWithSlots, isOfferedSlot } from "./advisory-slots";
import { cleanText } from "./advisory-text";
import { assertTransition, InvalidBookingTransition } from "./booking-state";
import { BookingListQueryDto, CreateBookingDto, ProposeRescheduleDto } from "./dto/advisory.dto";

const ADMIN_ROLES: string[] = [UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN];
/** Roles that may book on a startup's behalf. EDITOR and VIEWER may see its consultations but not create or change them. */
const FOUNDER_ACTING_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN];
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface BookingView {
  id: string;
  reference: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  minutes: number;
  serviceId: string;
  serviceName: string;
  serviceTypeId: string;
  startupId: string;
  startupName: string;
  description: string | null;
  isDemo: boolean;
  advisor: { id: string; slug: string; name: string; institution: string } | null;
  requester: { name: string } | null;
  decisionNote: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  rescheduledFromId: string | null;
  /** The open proposal for a new time, if there is one. The booking itself stays CONFIRMED at its original time until it is accepted. */
  pendingReschedule: { id: string; startsAt: string; endsAt: string; proposedBy: BookingParty; expiresAt: string | null } | null;
  /** For a PENDING request: when it expires if nobody answers. */
  expiresAt: string | null;
  needsReview: boolean;
  attendanceOutcome: string | null;
}

export interface BookingActions {
  approve: boolean;
  reject: boolean;
  cancel: boolean;
  complete: boolean;
  proposeReschedule: boolean;
  acceptReschedule: boolean;
  declineReschedule: boolean;
  withdrawReschedule: boolean;
}

const dbCode = (e: unknown): string | undefined => (e as { code?: string; driverError?: { code?: string } })?.driverError?.code ?? (e as { code?: string })?.code;

function newReference(): string {
  const bytes = randomBytes(6);
  return `ADV-${[...bytes].map((b) => REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length]).join("")}`;
}

/** The booking life cycle: request, approve/reject, cancel, complete, and rescheduling by MUTUAL agreement.
 *
 * Every rule is enforced here on the server — who may act (ownership of the advisor profile or an OWNER/ADMIN membership of the startup), which
 * status changes are allowed (booking-state.ts), whether a time is a real open slot (the same slot engine the calendar uses) — and the database
 * independently refuses overlapping slot-holding bookings, so concurrent requests for one slot can only ever produce one booking.
 *
 * Rescheduling never loses the original reservation: a proposal is a second booking row in the same group, status RESCHEDULE_PROPOSED, that holds
 * the new time while the original stays CONFIRMED. Only the OTHER party can accept it; at that moment, in one transaction, the original becomes
 * RESCHEDULED and the proposal becomes CONFIRMED. Nobody, an administrator included, can confirm a new time on the other side's behalf. */
@Injectable()
export class AdvisoryBookingsService {
  private readonly automation: AdvisoryAutomationConfig;
  private readonly bookingsOn: boolean;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(AdvisoryBooking) private readonly bookings: Repository<AdvisoryBooking>,
    @InjectRepository(AdvisoryBookingEvent) private readonly events: Repository<AdvisoryBookingEvent>,
    @InjectRepository(AdvisoryAdvisor) private readonly advisors: Repository<AdvisoryAdvisor>,
    @InjectRepository(EntityMembership) private readonly memberships: Repository<EntityMembership>,
    @InjectRepository(Startup) private readonly startups: Repository<Startup>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly advisorsSvc: AdvisoryAdvisorsService,
    private readonly notifier: AdvisoryNotifier,
    config: ConfigService,
  ) {
    this.automation = readAutomationConfig((k) => config.get<string>(k));
    this.bookingsOn = bookingsEnabled((k) => config.get<string>(k));
  }

  // ---- permissions ------------------------------------------------------------------------------------------------------------------------

  /** The startups this user may book for (OWNER or ADMIN membership). */
  async myStartups(userId: string): Promise<{ id: string; name: string; role: MembershipRole }[]> {
    const rows = await this.memberships.find({ where: { userId, kind: EntityKind.STARTUP, role: In(FOUNDER_ACTING_ROLES) } });
    if (!rows.length) return [];
    const startups = await this.startups.find({ where: { id: In(rows.map((r) => r.entityId)) } });
    return rows.flatMap((r) => {
      const s = startups.find((x) => x.id === r.entityId);
      return s ? [{ id: s.id, name: s.name, role: r.role }] : [];
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  private async membershipRole(userId: string, startupId: string): Promise<MembershipRole | null> {
    const m = await this.memberships.findOne({ where: { userId, kind: EntityKind.STARTUP, entityId: startupId } });
    return m?.role ?? null;
  }

  /** Which side of this booking the caller is allowed to act as, or null. Acting needs the advisor's own APPROVED profile, or an OWNER/ADMIN
   * membership of the booking's startup. `readOnly` widens "founder side" to any membership or being the original requester. */
  private async sideOf(user: AuthUser, b: AdvisoryBooking, readOnly = false): Promise<BookingActorRole | null> {
    const advisor = await this.advisors.findOne({ where: { id: b.advisorId } });
    if (advisor?.userId === user.userId && (readOnly || advisor.status === AdvisorStatus.APPROVED)) return "ADVISOR";
    const role = await this.membershipRole(user.userId, b.startupId);
    if (role && (readOnly || FOUNDER_ACTING_ROLES.includes(role))) return "FOUNDER";
    if (readOnly && b.requestedByUserId === user.userId) return "FOUNDER";
    if (ADMIN_ROLES.includes(user.role)) return "ADMIN";
    return null;
  }

  private async actAs(user: AuthUser, b: AdvisoryBooking, allowed: BookingActorRole[], message = "You can't do that on this booking."): Promise<BookingActorRole> {
    const side = await this.sideOf(user, b);
    if (!side || !allowed.includes(side)) throw new ForbiddenException(message);
    return side;
  }

  // ---- create -----------------------------------------------------------------------------------------------------------------------------

  /** The routes that call these are guarded already (AdvisoryBookingsEnabledGuard); this is the same rule once more, so no other caller can create a booking, hold a
   * slot, confirm a booking or move one while bookings are switched off. It is the first statement: nothing is read, written or emailed first. */
  private assertBookingsOn() {
    if (!this.bookingsOn) throw new BookingsDisabledException();
  }

  async create(user: AuthUser, dto: CreateBookingDto, now = new Date()): Promise<BookingView> {
    this.assertBookingsOn();
    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException("That isn't a valid time.");
    const advisor = await this.advisorsSvc.approvedBySlugOrThrow(dto.advisor);
    if (advisor.userId === user.userId) throw new ForbiddenException("You can't book a consultation with yourself.");
    const service = await this.advisorsSvc.activeServiceOrThrow(advisor.id, dto.serviceId);

    const startup = await this.startups.findOne({ where: { id: dto.startupId } });
    if (!startup) throw new NotFoundException("Startup not found.");
    const role = await this.membershipRole(user.userId, startup.id);
    if (!role || !FOUNDER_ACTING_ROLES.includes(role)) throw new ForbiddenException("Only an owner or admin of a startup can book consultations for it.");

    const input = await this.advisorsSvc.availabilityFor(advisor.id, now);
    if (!isOfferedSlot(input, startsAt, service.minutes, now)) throw new ConflictException("That time isn't available any more. Please choose another slot.");

    for (let attempt = 0; ; attempt++) {
      const id = randomUUID();
      const booking = this.bookings.create({
        id, groupId: id, reference: newReference(), advisorId: advisor.id, serviceId: service.id, startupId: startup.id, requestedByUserId: user.userId,
        startsAt, endsAt: new Date(startsAt.getTime() + service.minutes * 60_000), minutes: service.minutes,
        serviceName: service.name, serviceTypeId: service.typeId, startupName: startup.name,
        description: cleanText(dto.description) || null, status: BookingStatus.PENDING, isDemo: advisor.isDemo,
        expiresAt: computeExpiresAt(now, startsAt, this.automation),
      });
      try {
        await this.ds.transaction(async (m) => {
          // The limit is checked and the row inserted under one per-founder lock, so simultaneous requests cannot all see "1 waiting" and slip past it.
          await m.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`advisory-pending:${user.userId}`]);
          const open = (await m.query(`SELECT count(*)::int AS n FROM advisory_bookings WHERE "requestedByUserId" = $1 AND "status" = 'PENDING' AND ("expiresAt" IS NULL OR "expiresAt" > $2)`, [user.userId, now])) as { n: number }[];
          const limit = this.automation.maxPendingPerFounder;
          // 429, not 409: the booking form treats a 409 as "that slot was taken" and offers other times, which would be wrong here.
          if ((open[0]?.n ?? 0) >= limit) throw new HttpException(`You already have ${limit} consultation request${limit === 1 ? "" : "s"} waiting for an answer. Wait for a reply, or cancel ${limit === 1 ? "it" : "one"}, before sending another.`, HttpStatus.TOO_MANY_REQUESTS);
          await m.save(booking);
          await this.log(m, booking, user.userId, "FOUNDER", "CREATED", null, BookingStatus.PENDING, { startsAt: booking.startsAt.toISOString() });
        });
      } catch (e) {
        if (dbCode(e) === "23P01") throw new ConflictException("That time was just taken. Please choose another slot.");
        if (dbCode(e) === "23505" && attempt < 3) continue; // a (vanishingly rare) reference collision: draw another
        throw e;
      }
      await this.notifier.notify(booking, "REQUESTED", "FOUNDER");
      return (await this.views([booking]))[0]!;
    }
  }

  // ---- reads ------------------------------------------------------------------------------------------------------------------------------

  /** The founder's own bookings: ones they requested plus any for startups they belong to. Reschedule proposals are folded into the booking
   * they would replace rather than listed separately. */
  async listMine(user: AuthUser): Promise<BookingView[]> {
    const memberships = await this.memberships.find({ where: { userId: user.userId, kind: EntityKind.STARTUP } });
    const rows = await this.bookings.createQueryBuilder("b")
      .where(`(b."requestedByUserId" = :uid${memberships.length ? ` OR b."startupId" IN (:...sids)` : ""})`, { uid: user.userId, sids: memberships.map((m) => m.entityId) })
      .andWhere(`b."status" <> :proposed`, { proposed: BookingStatus.RESCHEDULE_PROPOSED })
      .orderBy(`b."startsAt"`, "DESC").take(500).getMany();
    return this.views(rows);
  }

  async listForAdvisor(advisor: AdvisoryAdvisor): Promise<BookingView[]> {
    const rows = await this.bookings.createQueryBuilder("b")
      .where(`b."advisorId" = :aid`, { aid: advisor.id })
      .andWhere(`b."status" <> :proposed`, { proposed: BookingStatus.RESCHEDULE_PROPOSED })
      .orderBy(`b."startsAt"`, "DESC").take(500).getMany();
    return this.views(rows);
  }

  async listAdmin(q: BookingListQueryDto): Promise<BookingView[]> {
    const qb = this.bookings.createQueryBuilder("b").where(`b."status" <> :proposed`, { proposed: BookingStatus.RESCHEDULE_PROPOSED });
    if (q.status && (Object.values(BookingStatus) as string[]).includes(q.status)) qb.andWhere(`b."status" = :st`, { st: q.status });
    if (q.advisorId) qb.andWhere(`b."advisorId" = :aid`, { aid: q.advisorId });
    if (q.includeDemo !== "true") qb.andWhere(`b."isDemo" = false`);
    if (q.needsReview === "true") qb.andWhere(`b."needsReview" = true`);
    return this.views(await qb.orderBy(`b."startsAt"`, "DESC").take(500).getMany());
  }

  /** One booking with its history, for someone entitled to see it: the advisor, the requester or any member of the startup, or an administrator. */
  async detail(user: AuthUser, id: string, now = new Date()) {
    const booking = await this.loadVisible(id);
    const side = await this.sideOf(user, booking, true);
    if (!side) throw new NotFoundException("Booking not found."); // not 403: don't reveal that it exists
    const [view] = await this.views([booking]);
    const history = await this.events.find({ where: { bookingId: booking.id }, order: { createdAt: "ASC" } });
    const actingSide = await this.sideOf(user, booking);
    return {
      booking: view!,
      viewerRole: side,
      actions: this.actionsFor(booking, view!.pendingReschedule, actingSide, now),
      history: history.map((e) => ({ id: e.id, type: e.type, actorRole: e.actorRole, fromStatus: e.fromStatus, toStatus: e.toStatus, details: e.details, createdAt: e.createdAt.toISOString() })),
    };
  }

  /** Slots a party could move this booking to: the same slot engine, ignoring this booking's own group so a shift that overlaps the current
   * time is still offered. Only someone allowed to propose gets an answer. */
  async rescheduleSlots(user: AuthUser, id: string, date: string, now = new Date()) {
    const booking = await this.loadVisible(id);
    await this.actAs(user, booking, ["FOUNDER", "ADVISOR"]);
    const input = await this.advisorsSvc.availabilityFor(booking.advisorId, now, booking.groupId);
    return this.advisorsSvc.slotView(input, booking.minutes, date, now);
  }

  async rescheduleDates(user: AuthUser, id: string, now = new Date()) {
    const booking = await this.loadVisible(id);
    await this.actAs(user, booking, ["FOUNDER", "ADVISOR"]);
    const input = await this.advisorsSvc.availabilityFor(booking.advisorId, now, booking.groupId);
    return { dates: datesWithSlots(input, booking.minutes, now), minutes: booking.minutes };
  }

  /** For the meeting room: the booking and the side the caller may act as (advisor, or startup OWNER/ADMIN). With `readOnly`, any member or the
   * requester, and administrators, may look; anyone else gets a 404 (it isn't revealed that the booking exists). */
  async forMeeting(user: AuthUser, id: string, readOnly: boolean): Promise<{ booking: AdvisoryBooking; side: BookingActorRole; canAct: boolean }> {
    const booking = await this.loadVisible(id);
    const side = await this.sideOf(user, booking, readOnly);
    if (!side) {
      if (readOnly) throw new NotFoundException("Booking not found.");
      throw new ForbiddenException("Only the advisor and the startup's owner or admin can join this consultation.");
    }
    // `canAct`: the caller could actually join (the advisor, or a startup OWNER/ADMIN). A read-only member (an EDITOR) or an administrator can look but not join.
    const acting = readOnly ? await this.sideOf(user, booking, false) : side;
    return { booking, side, canAct: acting === "FOUNDER" || acting === "ADVISOR" };
  }

  // ---- advisor decisions --------------------------------------------------------------------------------------------------------------------

  async approve(user: AuthUser, id: string, now = new Date()): Promise<BookingView> {
    this.assertBookingsOn();
    const b = await this.loadVisible(id);
    await this.actAs(user, b, ["ADVISOR"], "Only this consultation's advisor can approve it.");
    if (b.startsAt <= now) throw new ConflictException("The requested time has already passed.");
    return this.change(b, BookingStatus.CONFIRMED, user, "ADVISOR", "CONFIRMED", { decidedAt: now }, "CONFIRMED");
  }

  async reject(user: AuthUser, id: string, note?: string): Promise<BookingView> {
    const b = await this.loadVisible(id);
    await this.actAs(user, b, ["ADVISOR"], "Only this consultation's advisor can decline it.");
    return this.change(b, BookingStatus.REJECTED, user, "ADVISOR", "REJECTED", { decidedAt: new Date(), decisionNote: cleanText(note) || null }, "REJECTED", { note: cleanText(note) });
  }

  async complete(user: AuthUser, id: string, now = new Date()): Promise<BookingView> {
    const b = await this.loadVisible(id);
    await this.actAs(user, b, ["ADVISOR"], "Only this consultation's advisor can mark it completed.");
    if (b.endsAt > now) throw new ConflictException("A consultation can be marked completed once it has ended.");
    return this.change(b, BookingStatus.COMPLETED, user, "ADVISOR", "COMPLETED", { completedAt: now, needsReview: false, attendanceOutcome: "ATTENDED_BOTH" }, null);
  }

  // ---- cancel -----------------------------------------------------------------------------------------------------------------------------

  async cancel(user: AuthUser, id: string, reason?: string, now = new Date()): Promise<BookingView> {
    const b = await this.loadVisible(id);
    const side = await this.actAs(user, b, ["FOUNDER", "ADVISOR", "ADMIN"], "You can't cancel this consultation.");
    if (b.startsAt <= now) throw new ConflictException("This consultation has already started; it can't be cancelled.");
    const cleaned = cleanText(reason) || null;
    return this.change(b, BookingStatus.CANCELLED, user, side, "CANCELLED", { cancelledBy: side as "FOUNDER" | "ADVISOR" | "ADMIN", cancelReason: cleaned, cancelledAt: now }, "CANCELLED", { actor: side, note: cleaned });
  }

  // ---- rescheduling, by mutual agreement ----------------------------------------------------------------------------------------------------

  /** Either party proposes a new time. The original stays CONFIRMED and keeps its slot; the proposed slot is held too, so it can't be taken
   * while the other side decides. Nothing changes for the other party until they accept. */
  async proposeReschedule(user: AuthUser, id: string, dto: ProposeRescheduleDto, now = new Date()): Promise<BookingView> {
    this.assertBookingsOn();
    const orig = await this.loadVisible(id);
    const side = await this.actAs(user, orig, ["FOUNDER", "ADVISOR"], "Only the advisor or the startup's owner/admin can propose a new time.") as BookingParty;
    if (orig.status !== BookingStatus.CONFIRMED) throw new ConflictException("Only a confirmed consultation can be rescheduled. A pending request can be cancelled and requested again.");
    if (orig.startsAt <= now) throw new ConflictException("This consultation has already started.");
    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException("That isn't a valid time.");
    if (startsAt.getTime() === orig.startsAt.getTime()) throw new BadRequestException("That is the time already booked.");

    const input = await this.advisorsSvc.availabilityFor(orig.advisorId, now, orig.groupId);
    if (!isOfferedSlot(input, startsAt, orig.minutes, now)) throw new ConflictException("That time isn't available. Please choose another slot.");

    const count = await this.bookings.count({ where: { groupId: orig.groupId } });
    const proposal = this.bookings.create({
      id: randomUUID(), groupId: orig.groupId, reference: `${orig.reference.replace(/-R\d+$/, "")}-R${count}`, advisorId: orig.advisorId, serviceId: orig.serviceId, startupId: orig.startupId,
      requestedByUserId: orig.requestedByUserId, startsAt, endsAt: new Date(startsAt.getTime() + orig.minutes * 60_000), minutes: orig.minutes, serviceName: orig.serviceName,
      serviceTypeId: orig.serviceTypeId, startupName: orig.startupName, description: orig.description, status: BookingStatus.RESCHEDULE_PROPOSED, rescheduledFromId: orig.id,
      proposedBy: side, decisionNote: cleanText(dto.note) || null, isDemo: orig.isDemo,
      expiresAt: computeProposalExpiresAt(now, orig.startsAt, startsAt, this.automation),
    });
    try {
      await this.ds.transaction(async (m) => {
        await m.save(proposal);
        await this.log(m, orig, user.userId, side, "RESCHEDULE_PROPOSED", orig.status, orig.status, { proposalId: proposal.id, from: orig.startsAt.toISOString(), to: startsAt.toISOString(), note: proposal.decisionNote });
      });
    } catch (e) {
      const code = dbCode(e);
      if (code === "23P01") throw new ConflictException("That time was just taken. Please choose another slot.");
      if (code === "23505") throw new ConflictException("There is already a proposed new time waiting for an answer.");
      throw e;
    }
    await this.notifier.notify(proposal, "RESCHEDULE_PROPOSED", side, { proposedBy: side, note: proposal.decisionNote, previous: orig });
    return (await this.views([orig]))[0]!;
  }

  /** Only the party who did NOT propose can accept. At that moment, atomically, the original becomes RESCHEDULED and the proposal CONFIRMED. */
  async acceptReschedule(user: AuthUser, id: string, now = new Date()): Promise<BookingView> {
    this.assertBookingsOn();
    const orig = await this.loadVisible(id);
    const proposal = await this.openProposalOrThrow(orig.id);
    const counterparty: BookingParty = proposal.proposedBy === "FOUNDER" ? "ADVISOR" : "FOUNDER";
    await this.actAs(user, orig, [counterparty], proposal.proposedBy === "FOUNDER" ? "Only the advisor can accept a time the startup proposed." : "Only the startup's owner or admin can accept a time the advisor proposed.");
    if (proposal.startsAt <= now) throw new ConflictException("The proposed time has already passed.");
    await this.ds.transaction(async (m) => {
      const o = await m.findOne(AdvisoryBooking, { where: { id: orig.id }, lock: { mode: "pessimistic_write" } });
      const p = await m.findOne(AdvisoryBooking, { where: { id: proposal.id }, lock: { mode: "pessimistic_write" } });
      if (!o || !p || p.status !== BookingStatus.RESCHEDULE_PROPOSED) throw new ConflictException("This proposal is no longer open.");
      assertTransition(o.status, BookingStatus.RESCHEDULED);
      assertTransition(p.status, BookingStatus.CONFIRMED);
      o.status = BookingStatus.RESCHEDULED;
      o.decisionNote = `Rescheduled; replaced by ${p.reference}.`;
      p.status = BookingStatus.CONFIRMED;
      p.decidedAt = now;
      await m.save([o, p]);
      await this.log(m, o, user.userId, counterparty, "RESCHEDULE_ACCEPTED", BookingStatus.CONFIRMED, BookingStatus.RESCHEDULED, { replacedBy: p.id, replacedByReference: p.reference, from: o.startsAt.toISOString(), to: p.startsAt.toISOString() });
      await this.log(m, p, user.userId, counterparty, "RESCHEDULE_ACCEPTED", BookingStatus.RESCHEDULE_PROPOSED, BookingStatus.CONFIRMED, { replaces: o.id, replacesReference: o.reference });
    }).catch((e) => this.rethrow(e));
    const fresh = await this.bookings.findOneByOrFail({ id: proposal.id });
    await this.notifier.notify(fresh, "RESCHEDULE_ACCEPTED", counterparty, { previous: orig });
    return (await this.views([fresh]))[0]!;
  }

  async declineReschedule(user: AuthUser, id: string, note?: string): Promise<BookingView> {
    const orig = await this.loadVisible(id);
    const proposal = await this.openProposalOrThrow(orig.id);
    const counterparty: BookingParty = proposal.proposedBy === "FOUNDER" ? "ADVISOR" : "FOUNDER";
    await this.actAs(user, orig, [counterparty], "Only the other party can decline a proposed time.");
    await this.closeProposal(orig, proposal, BookingStatus.REJECTED, user, counterparty, "RESCHEDULE_DECLINED", cleanText(note) || null);
    await this.notifier.notify(proposal, "RESCHEDULE_DECLINED", counterparty, { proposedBy: proposal.proposedBy, note: cleanText(note) });
    return (await this.views([orig]))[0]!;
  }

  async withdrawReschedule(user: AuthUser, id: string): Promise<BookingView> {
    const orig = await this.loadVisible(id);
    const proposal = await this.openProposalOrThrow(orig.id);
    await this.actAs(user, orig, [proposal.proposedBy as BookingParty], "Only the side that proposed the time can withdraw it.");
    await this.closeProposal(orig, proposal, BookingStatus.CANCELLED, user, proposal.proposedBy as BookingParty, "RESCHEDULE_WITHDRAWN", null);
    return (await this.views([orig]))[0]!;
  }

  private async closeProposal(orig: AdvisoryBooking, proposal: AdvisoryBooking, to: BookingStatus, user: AuthUser, side: BookingParty, type: string, note: string | null) {
    await this.ds.transaction(async (m) => {
      const p = await m.findOne(AdvisoryBooking, { where: { id: proposal.id }, lock: { mode: "pessimistic_write" } });
      if (!p || p.status !== BookingStatus.RESCHEDULE_PROPOSED) throw new ConflictException("This proposal is no longer open.");
      assertTransition(p.status, to);
      p.status = to;
      p.decidedAt = new Date();
      if (note) p.cancelReason = note;
      await m.save(p);
      await this.log(m, orig, user.userId, side, type, orig.status, orig.status, { proposalId: p.id, note });
    }).catch((e) => this.rethrow(e));
  }

  // ---- internals --------------------------------------------------------------------------------------------------------------------------

  /** One guarded status change plus its audit event, in a transaction. Cancelling or completing also closes any open reschedule proposal. */
  private async change(b: AdvisoryBooking, to: BookingStatus, user: AuthUser, side: BookingActorRole, eventType: string, patch: Partial<AdvisoryBooking>, notify: AdvisoryNotificationKind | null, details: Record<string, unknown> = {}): Promise<BookingView> {
    await this.ds.transaction(async (m) => {
      const row = await m.findOne(AdvisoryBooking, { where: { id: b.id }, lock: { mode: "pessimistic_write" } });
      if (!row) throw new NotFoundException("Booking not found.");
      assertTransition(row.status, to);
      const from = row.status;
      Object.assign(row, patch, { status: to });
      await m.save(row);
      await this.log(m, row, user.userId, side, eventType, from, to, details);
      if (to === BookingStatus.CANCELLED || to === BookingStatus.COMPLETED) {
        const open = await m.find(AdvisoryBooking, { where: { rescheduledFromId: row.id, status: BookingStatus.RESCHEDULE_PROPOSED }, lock: { mode: "pessimistic_write" } });
        for (const p of open) {
          p.status = BookingStatus.CANCELLED;
          p.decidedAt = new Date();
          await m.save(p);
          await this.log(m, row, user.userId, side, "RESCHEDULE_WITHDRAWN", row.status, row.status, { proposalId: p.id, reason: "the booking was " + to.toLowerCase() });
        }
      }
      Object.assign(b, row);
    }).catch((e) => this.rethrow(e));
    if (notify) await this.notifier.notify(b, notify, side, { note: (details as { note?: string }).note ?? null });
    return (await this.views([b]))[0]!;
  }

  private rethrow(e: unknown): never {
    if (e instanceof InvalidBookingTransition) throw new ConflictException(e.message);
    throw e;
  }

  private async log(m: EntityManager, b: AdvisoryBooking, actorUserId: string | null, actorRole: BookingActorRole, type: string, from: string | null, to: string | null, details: Record<string, unknown> | null) {
    await m.save(m.create(AdvisoryBookingEvent, { bookingId: b.id, actorUserId, actorRole, type, fromStatus: from, toStatus: to, details }));
  }

  private async loadVisible(id: string): Promise<AdvisoryBooking> {
    let b = await this.bookings.findOne({ where: { id } });
    // A proposal is shown through the booking it would replace.
    if (b?.status === BookingStatus.RESCHEDULE_PROPOSED && b.rescheduledFromId) b = await this.bookings.findOne({ where: { id: b.rescheduledFromId } });
    if (!b) throw new NotFoundException("Booking not found.");
    return b;
  }

  private async openProposalOrThrow(originalId: string): Promise<AdvisoryBooking> {
    const p = await this.bookings.findOne({ where: { rescheduledFromId: originalId, status: BookingStatus.RESCHEDULE_PROPOSED } });
    if (!p) throw new NotFoundException("There is no proposed new time to answer.");
    return p;
  }

  actionsFor(b: AdvisoryBooking, pending: BookingView["pendingReschedule"], side: BookingActorRole | null, now: Date): BookingActions {
    const none: BookingActions = { approve: false, reject: false, cancel: false, complete: false, proposeReschedule: false, acceptReschedule: false, declineReschedule: false, withdrawReschedule: false };
    if (!side) return none;
    const future = b.startsAt > now;
    const isParty = side === "FOUNDER" || side === "ADVISOR";
    const counterparty = pending ? (pending.proposedBy === "FOUNDER" ? "ADVISOR" : "FOUNDER") : null;
    return {
      approve: side === "ADVISOR" && b.status === BookingStatus.PENDING && future,
      reject: side === "ADVISOR" && b.status === BookingStatus.PENDING,
      cancel: (b.status === BookingStatus.PENDING || b.status === BookingStatus.CONFIRMED) && future,
      complete: side === "ADVISOR" && b.status === BookingStatus.CONFIRMED && b.endsAt <= now,
      proposeReschedule: isParty && b.status === BookingStatus.CONFIRMED && future && !pending,
      acceptReschedule: !!pending && side === counterparty && b.status === BookingStatus.CONFIRMED,
      declineReschedule: !!pending && side === counterparty && b.status === BookingStatus.CONFIRMED,
      withdrawReschedule: !!pending && side === pending.proposedBy && b.status === BookingStatus.CONFIRMED,
    };
  }

  /** Turns rows into the shape the screens read: advisor and requester names, and the open reschedule proposal folded in. */
  async views(rows: AdvisoryBooking[]): Promise<BookingView[]> {
    if (!rows.length) return [];
    const advisorIds = [...new Set(rows.map((r) => r.advisorId))];
    const userIds = [...new Set(rows.map((r) => r.requestedByUserId))];
    const [advisors, users, proposals] = await Promise.all([
      this.advisors.find({ where: { id: In(advisorIds) } }),
      this.users.find({ where: { id: In(userIds) }, select: { id: true, firstName: true, lastName: true } }),
      this.bookings.find({ where: { rescheduledFromId: In(rows.map((r) => r.id)), status: BookingStatus.RESCHEDULE_PROPOSED } }),
    ]);
    return rows.map((b) => {
      const a = advisors.find((x) => x.id === b.advisorId);
      const u = users.find((x) => x.id === b.requestedByUserId);
      const p = proposals.find((x) => x.rescheduledFromId === b.id);
      return {
        id: b.id, reference: b.reference, status: b.status, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), minutes: b.minutes, serviceId: b.serviceId,
        serviceName: b.serviceName, serviceTypeId: b.serviceTypeId, startupId: b.startupId, startupName: b.startupName, description: b.description, isDemo: b.isDemo,
        advisor: a ? { id: a.id, slug: a.slug, name: a.name, institution: a.institution } : null,
        requester: u ? { name: `${u.firstName} ${u.lastName}`.trim() } : null,
        decisionNote: b.decisionNote, cancelledBy: b.cancelledBy, cancelReason: b.cancelReason, cancelledAt: b.cancelledAt?.toISOString() ?? null,
        completedAt: b.completedAt?.toISOString() ?? null, createdAt: b.createdAt.toISOString(), rescheduledFromId: b.rescheduledFromId,
        pendingReschedule: p ? { id: p.id, startsAt: p.startsAt.toISOString(), endsAt: p.endsAt.toISOString(), proposedBy: p.proposedBy as BookingParty, expiresAt: p.expiresAt?.toISOString() ?? null } : null,
        expiresAt: b.status === BookingStatus.PENDING ? b.expiresAt?.toISOString() ?? null : null,
        needsReview: b.needsReview, attendanceOutcome: b.attendanceOutcome,
      };
    });
  }
}

