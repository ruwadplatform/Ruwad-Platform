import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, In, MoreThan, Repository } from "typeorm";
import { AdvisoryAdvisor, AdvisoryAvailabilityException, AdvisoryAvailabilityRule, AdvisoryBooking, AdvisoryService } from "./advisory.entities";
import { AdvisorStatus, SLOT_HOLDING_STATUSES } from "./advisory.enums";
import { MAX_BOOKING_DAYS, MIN_NOTICE_MINUTES, minutesOf, parseYmd } from "./advisory-time";
import { NextAvailable, DIRECTORY_SEARCH_DAYS, nextAvailableFor } from "./advisory-next-available";
import { AvailabilityInput, datesWithSlots, slotsForDate } from "./advisory-slots";
import { cleanText } from "./advisory-text";
import { AdvisorProfileDto, CreateServiceDto, SetAvailabilityDto, TimeOffDto, UpdateAdvisorProfileDto, UpdateServiceDto } from "./dto/advisory.dto";

/** What the directory and profile screens read. `id` is the URL id (the slug), as in the frontend's AdvisorSummary/AdvisorProfile. */
export interface AdvisorSummaryView {
  id: string;
  name: string;
  institution: string;
  institutionFull: string;
  affiliationVerified: boolean;
  specialization: string;
  expertise: string;
  expertiseTags: string[];
  yearsExperience: number | null;
  consultationTypes: string[];
  availability: { weekday: number; windows: { start: string; end: string }[] }[];
  isDemo: boolean;
  /** The soonest slot actually open to book (bookings and time off already excluded), or null. See advisory-next-available.ts. */
  nextAvailable: NextAvailable | null;
}

export interface AdvisorProfileView extends AdvisorSummaryView {
  designation: string;
  location: string;
  about: string;
  specializations: string[];
  researchAreas: string[];
  services: { id: string; typeId: string; name: string; description: string; minutes: number }[];
  /** Always empty for now: no publications or reviews exist, and none are invented. */
  publications: never[];
  reviews: never[];
}

const clean = (s: string) => cleanText(s);
const cleanList = (xs: string[] | undefined) => (xs ?? []).map(clean).filter(Boolean);

/** Advisor directory, profiles, the slots on offer, and everything an advisor (or an administrator acting for one) manages: profile, services,
 * weekly availability and time off. Booking life-cycle lives in AdvisoryBookingsService. */
@Injectable()
export class AdvisoryAdvisorsService {
  constructor(
    @InjectRepository(AdvisoryAdvisor) private readonly advisors: Repository<AdvisoryAdvisor>,
    @InjectRepository(AdvisoryService) private readonly services: Repository<AdvisoryService>,
    @InjectRepository(AdvisoryAvailabilityRule) private readonly rules: Repository<AdvisoryAvailabilityRule>,
    @InjectRepository(AdvisoryAvailabilityException) private readonly exceptions: Repository<AdvisoryAvailabilityException>,
    @InjectRepository(AdvisoryBooking) private readonly bookings: Repository<AdvisoryBooking>,
  ) {}

  // ---- public -----------------------------------------------------------------------------------------------------------------------------

  /** The directory. `nextAvailable` is computed here, on the server, from the same data the booking calendar uses, for every advisor at once:
   * four queries in total (rules, time off, held bookings, services), however many advisors there are. */
  async listPublic(now = new Date()): Promise<AdvisorSummaryView[]> {
    const list = await this.advisors.find({ where: { status: AdvisorStatus.APPROVED }, order: { name: "ASC" } });
    if (!list.length) return [];
    const ids = list.map((a) => a.id);
    const horizon = new Date(now.getTime() + (DIRECTORY_SEARCH_DAYS + 2) * 86_400_000);
    const [rules, services, timeOff, held] = await Promise.all([
      this.rules.find({ where: { advisorId: In(ids) } }),
      this.services.find({ where: { advisorId: In(ids), active: true } }),
      this.exceptions.find({ where: { advisorId: In(ids) } }),
      this.bookings.find({ where: { advisorId: In(ids), status: In(SLOT_HOLDING_STATUSES), endsAt: MoreThan(now) } }),
    ]);
    return list.map((a) => {
      const aRules = rules.filter((r) => r.advisorId === a.id);
      const aServices = services.filter((s) => s.advisorId === a.id);
      const input: AvailabilityInput = {
        rules: aRules.map((r) => ({ weekday: r.weekday, startTime: r.startTime, endTime: r.endTime })),
        timeOff: timeOff.filter((t) => t.advisorId === a.id).map((t) => ({ date: String(t.date).slice(0, 10), startTime: t.startTime, endTime: t.endTime })),
        busy: held.filter((b) => b.advisorId === a.id && b.startsAt < horizon).map((b) => ({ start: b.startsAt, end: b.endsAt })),
      };
      const shortest = aServices.length ? Math.min(...aServices.map((s) => s.minutes)) : null;
      return { ...this.summary(a, aRules, aServices), nextAvailable: nextAvailableFor(input, shortest, now) };
    });
  }

  async getPublicProfile(slug: string): Promise<AdvisorProfileView> {
    const advisor = await this.approvedBySlugOrThrow(slug);
    return this.profileView(advisor);
  }

  /** The advisor's own or an administrator's view of any profile, whatever its status. */
  async profileView(advisor: AdvisoryAdvisor, opts: { includeInactiveServices?: boolean } = {}): Promise<AdvisorProfileView> {
    const [rules, services] = await Promise.all([
      this.rules.find({ where: { advisorId: advisor.id } }),
      this.services.find({ where: opts.includeInactiveServices ? { advisorId: advisor.id } : { advisorId: advisor.id, active: true }, order: { minutes: "ASC", name: "ASC" } }),
    ]);
    return {
      ...this.summary(advisor, rules, services.filter((s) => s.active)),
      nextAvailable: null, // the profile page books from the live calendar, which is authoritative
      designation: advisor.designation,
      location: advisor.location,
      about: advisor.about,
      specializations: advisor.specializations,
      researchAreas: advisor.researchAreas,
      services: services.map((s) => ({ id: s.id, typeId: s.typeId, name: s.name, description: s.description, minutes: s.minutes, ...(opts.includeInactiveServices ? { active: s.active } : {}) })),
      publications: [],
      reviews: [],
    };
  }

  private summary(a: AdvisoryAdvisor, rules: AdvisoryAvailabilityRule[], services: AdvisoryService[]): Omit<AdvisorSummaryView, "nextAvailable"> {
    const byDay = new Map<number, { start: string; end: string }[]>();
    for (const r of [...rules].sort((x, y) => x.weekday - y.weekday || x.startTime.localeCompare(y.startTime))) {
      byDay.set(r.weekday, [...(byDay.get(r.weekday) ?? []), { start: r.startTime, end: r.endTime }]);
    }
    return {
      id: a.slug,
      name: a.name,
      institution: a.institution,
      institutionFull: a.institutionFull,
      affiliationVerified: a.affiliationVerified,
      specialization: a.specialization,
      expertise: a.expertise,
      expertiseTags: a.expertiseTags,
      yearsExperience: a.yearsExperience,
      consultationTypes: [...new Set(services.map((s) => s.typeId))],
      availability: [...byDay.entries()].map(([weekday, windows]) => ({ weekday, windows })),
      isDemo: a.isDemo,
    };
  }

  // ---- slots ------------------------------------------------------------------------------------------------------------------------------

  /** Everything the slot engine needs for one advisor. `ignoreGroupId` leaves out the bookings of one reschedule group, so a proposal can be
   * made onto a time that only clashes with the booking it would replace. */
  async availabilityFor(advisorId: string, now: Date, ignoreGroupId?: string): Promise<AvailabilityInput> {
    const horizon = new Date(now.getTime() + (MAX_BOOKING_DAYS + 2) * 86_400_000);
    const [rules, timeOff, held] = await Promise.all([
      this.rules.find({ where: { advisorId } }),
      this.exceptions.find({ where: { advisorId } }),
      this.bookings.find({ where: { advisorId, status: In(SLOT_HOLDING_STATUSES), endsAt: MoreThan(now) } }),
    ]);
    return {
      rules: rules.map((r) => ({ weekday: r.weekday, startTime: r.startTime, endTime: r.endTime })),
      timeOff: timeOff.map((t) => ({ date: String(t.date).slice(0, 10), startTime: t.startTime, endTime: t.endTime })),
      busy: held.filter((b) => b.groupId !== ignoreGroupId && b.startsAt < horizon).map((b) => ({ start: b.startsAt, end: b.endsAt })),
    };
  }

  async activeServiceOrThrow(advisorId: string, serviceId: string): Promise<AdvisoryService> {
    const service = await this.services.findOne({ where: { id: serviceId, advisorId, active: true } });
    if (!service) throw new NotFoundException("That consultation service isn't available.");
    return service;
  }

  async publicDates(slug: string, serviceId: string, now = new Date()): Promise<{ dates: string[]; minutes: number }> {
    const advisor = await this.approvedBySlugOrThrow(slug);
    const service = await this.activeServiceOrThrow(advisor.id, serviceId);
    return { dates: datesWithSlots(await this.availabilityFor(advisor.id, now), service.minutes, now), minutes: service.minutes };
  }

  async publicSlots(slug: string, serviceId: string, date: string, now = new Date()) {
    const advisor = await this.approvedBySlugOrThrow(slug);
    const service = await this.activeServiceOrThrow(advisor.id, serviceId);
    return this.slotView(await this.availabilityFor(advisor.id, now), service.minutes, date, now);
  }

  slotView(input: AvailabilityInput, minutes: number, date: string, now: Date) {
    const ymd = parseYmd(date);
    if (!ymd) throw new BadRequestException("That isn't a valid date.");
    return {
      date,
      minutes,
      timeZone: "Asia/Riyadh",
      minNoticeMinutes: MIN_NOTICE_MINUTES,
      slots: slotsForDate(input, ymd, minutes, now).map((s) => ({ time: s.time, startsAt: s.start.toISOString(), endsAt: s.end.toISOString() })),
    };
  }

  // ---- lookups ----------------------------------------------------------------------------------------------------------------------------

  async approvedBySlugOrThrow(slug: string): Promise<AdvisoryAdvisor> {
    const advisor = await this.advisors.findOne({ where: { slug, status: AdvisorStatus.APPROVED } });
    if (!advisor) throw new NotFoundException("Advisor not found.");
    return advisor;
  }

  async byIdOrThrow(id: string): Promise<AdvisoryAdvisor> {
    const advisor = await this.advisors.findOne({ where: { id } });
    if (!advisor) throw new NotFoundException("Advisor not found.");
    return advisor;
  }

  findByUser(userId: string): Promise<AdvisoryAdvisor | null> {
    return this.advisors.findOne({ where: { userId } });
  }

  // ---- onboarding and profile --------------------------------------------------------------------------------------------------------------

  /** Any signed-in user may apply once. The profile is PENDING_REVIEW and invisible until an administrator approves it, and the claimed
   * affiliation is never shown as verified unless an administrator marks it so. */
  async apply(userId: string, dto: AdvisorProfileDto, extra: Partial<AdvisoryAdvisor> = {}, manager?: EntityManager): Promise<AdvisoryAdvisor> {
    const repo = manager ? manager.getRepository(AdvisoryAdvisor) : this.advisors;
    if (await repo.exists({ where: { userId } })) throw new ConflictException("You already have an advisor profile.");
    const slug = await this.uniqueSlug(dto.name, repo);
    const advisor = repo.create({
      userId,
      slug,
      ...this.profileFields(dto),
      expertiseTags: cleanList(dto.expertiseTags),
      affiliationVerified: false,
      isDemo: false,
      status: AdvisorStatus.PENDING_REVIEW,
      ...extra,
    });
    return repo.save(advisor);
  }

  async updateProfile(advisor: AdvisoryAdvisor, dto: UpdateAdvisorProfileDto): Promise<AdvisoryAdvisor> {
    if (advisor.isDemo) throw new ForbiddenException("Demonstration profiles can't be edited.");
    const patch: Partial<AdvisoryAdvisor> = {};
    for (const key of ["name", "institution", "institutionFull", "designation", "location", "specialization", "expertise", "about"] as const) {
      if (dto[key] !== undefined) patch[key] = clean(dto[key]!);
    }
    for (const key of ["specializations", "researchAreas", "expertiseTags"] as const) {
      if (dto[key] !== undefined) patch[key] = cleanList(dto[key]);
    }
    if (dto.yearsExperience !== undefined) patch.yearsExperience = dto.yearsExperience;
    // Changing who they say they are or where they work means the earlier check no longer applies.
    if (patch.institution !== undefined || patch.institutionFull !== undefined) patch.affiliationVerified = false;
    return this.advisors.save(Object.assign(advisor, patch));
  }

  /** The profile columns a form's answers set; shared by a first application and a reapplication. */
  profileFields(dto: AdvisorProfileDto) {
    return {
      name: clean(dto.name),
      institution: clean(dto.institution),
      institutionFull: clean(dto.institutionFull),
      designation: clean(dto.designation),
      location: clean(dto.location),
      specialization: clean(dto.specialization),
      specializations: cleanList(dto.specializations),
      researchAreas: cleanList(dto.researchAreas),
      expertise: clean(dto.expertise),
      about: clean(dto.about),
      yearsExperience: dto.yearsExperience ?? null,
    };
  }

  private async uniqueSlug(name: string, repo: Repository<AdvisoryAdvisor> = this.advisors): Promise<string> {
    const base = clean(name).toLowerCase().replace(/^(dr|prof)\.?\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "advisor";
    for (let i = 0; i < 20; i++) {
      const slug = i === 0 ? base : `${base}-${i + 1}`;
      if (!(await repo.exists({ where: { slug } }))) return slug;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  // ---- availability -----------------------------------------------------------------------------------------------------------------------

  async getAvailability(advisorId: string) {
    const [rules, timeOff] = await Promise.all([
      this.rules.find({ where: { advisorId }, order: { weekday: "ASC", startTime: "ASC" } }),
      this.exceptions.find({ where: { advisorId }, order: { date: "ASC" } }),
    ]);
    return {
      timeZone: "Asia/Riyadh",
      windows: rules.map((r) => ({ id: r.id, weekday: r.weekday, startTime: r.startTime, endTime: r.endTime })),
      timeOff: timeOff.map((t) => ({ id: t.id, date: String(t.date).slice(0, 10), startTime: t.startTime, endTime: t.endTime, reason: t.reason })),
    };
  }

  /** Replaces the whole weekly schedule. Windows on one weekday may not overlap. Existing bookings are untouched: changing hours never
   * silently cancels someone's consultation. */
  async setAvailability(advisorId: string, dto: SetAvailabilityDto) {
    for (const w of dto.windows) if (minutesOf(w.endTime) <= minutesOf(w.startTime)) throw new BadRequestException("Each window must end after it starts.");
    for (let day = 0; day < 7; day++) {
      const ws = dto.windows.filter((w) => w.weekday === day).sort((a, b) => minutesOf(a.startTime) - minutesOf(b.startTime));
      for (let i = 1; i < ws.length; i++) if (minutesOf(ws[i]!.startTime) < minutesOf(ws[i - 1]!.endTime)) throw new BadRequestException("Windows on the same day can't overlap.");
    }
    await this.rules.manager.transaction(async (m) => {
      await m.delete(AdvisoryAvailabilityRule, { advisorId });
      if (dto.windows.length) await m.insert(AdvisoryAvailabilityRule, dto.windows.map((w) => ({ advisorId, weekday: w.weekday, startTime: w.startTime, endTime: w.endTime })));
    });
    return this.getAvailability(advisorId);
  }

  async addTimeOff(advisorId: string, dto: TimeOffDto) {
    if (!parseYmd(dto.date)) throw new BadRequestException("That isn't a valid date.");
    if ((dto.startTime === undefined) !== (dto.endTime === undefined)) throw new BadRequestException("Give both a start and an end time, or neither for a whole day.");
    if (dto.startTime !== undefined && minutesOf(dto.endTime!) <= minutesOf(dto.startTime)) throw new BadRequestException("The time off must end after it starts.");
    await this.exceptions.save(this.exceptions.create({ advisorId, date: dto.date, startTime: dto.startTime ?? null, endTime: dto.endTime ?? null, reason: dto.reason ? clean(dto.reason) : null }));
    return this.getAvailability(advisorId);
  }

  async removeTimeOff(advisorId: string, id: string) {
    const res = await this.exceptions.delete({ id, advisorId });
    if (!res.affected) throw new NotFoundException("That time off isn't on your calendar.");
    return this.getAvailability(advisorId);
  }

  // ---- services ---------------------------------------------------------------------------------------------------------------------------

  listServices(advisorId: string) {
    return this.services.find({ where: { advisorId }, order: { active: "DESC", minutes: "ASC", name: "ASC" } });
  }

  async createService(advisorId: string, dto: CreateServiceDto) {
    return this.services.save(this.services.create({ advisorId, typeId: dto.typeId, name: clean(dto.name), description: clean(dto.description), minutes: dto.minutes, active: true }));
  }

  async updateService(advisorId: string, id: string, dto: UpdateServiceDto) {
    const service = await this.services.findOne({ where: { id, advisorId } });
    if (!service) throw new NotFoundException("Service not found.");
    if (dto.typeId !== undefined) service.typeId = dto.typeId;
    if (dto.name !== undefined) service.name = clean(dto.name);
    if (dto.description !== undefined) service.description = clean(dto.description);
    if (dto.minutes !== undefined) service.minutes = dto.minutes;
    if (dto.active !== undefined) service.active = dto.active;
    return this.services.save(service);
  }

  /** Services are deactivated, never deleted: past bookings keep their snapshot and a service to point at. */
  async deactivateService(advisorId: string, id: string) {
    return this.updateService(advisorId, id, { active: false });
  }
}

