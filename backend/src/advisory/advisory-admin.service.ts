import { BadRequestException, ConflictException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";
import { User } from "../users/user.entity";
import { AdvisoryAdvisor, AdvisoryApplicationEvent, AdvisoryBooking } from "./advisory.entities";
import { AdvisorStatus, BookingStatus } from "./advisory.enums";
import { AdvisoryAdvisorsService } from "./advisory-advisors.service";
import { AdvisoryApplicationNotifier } from "./advisory-application-notifier";
import { cleanText } from "./advisory-text";

const REVIEWABLE_FROM: Record<"approve" | "reject" | "suspend", AdvisorStatus[]> = {
  approve: [AdvisorStatus.PENDING_REVIEW, AdvisorStatus.REJECTED, AdvisorStatus.SUSPENDED],
  reject: [AdvisorStatus.PENDING_REVIEW],
  suspend: [AdvisorStatus.APPROVED],
};
/** A rejection reason shorter than this isn't a reason. */
export const MIN_REJECTION_REASON = 10;
const TARGET: Record<"approve" | "reject" | "suspend", AdvisorStatus> = { approve: AdvisorStatus.APPROVED, reject: AdvisorStatus.REJECTED, suspend: AdvisorStatus.SUSPENDED };

/** Administrator-side advisory management: advisor review and onboarding, and the numbers. Bookings are listed and cancelled through
 * AdvisoryBookingsService; an administrator can cancel a booking but can never confirm or reschedule one on anyone's behalf. */
@Injectable()
export class AdvisoryAdminService {
  private readonly logger = new Logger(AdvisoryAdminService.name);

  constructor(
    @InjectRepository(AdvisoryAdvisor) private readonly advisors: Repository<AdvisoryAdvisor>,
    @InjectRepository(AdvisoryBooking) private readonly bookings: Repository<AdvisoryBooking>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly advisorsSvc: AdvisoryAdvisorsService,
    private readonly notifier: AdvisoryApplicationNotifier,
    private readonly dataSource: DataSource,
  ) {}

  async listAdvisors(status?: string) {
    const where = status && (Object.values(AdvisorStatus) as string[]).includes(status) ? { status: status as AdvisorStatus } : {};
    const rows = await this.advisors.find({ where, order: { createdAt: "DESC" } });
    return this.withApplicants(rows);
  }

  async getAdvisor(id: string) {
    const advisor = await this.advisorsSvc.byIdOrThrow(id);
    const [profile, availability, [withApplicant]] = await Promise.all([
      this.advisorsSvc.profileView(advisor, { includeInactiveServices: true }),
      this.advisorsSvc.getAvailability(advisor.id),
      this.withApplicants([advisor]),
    ]);
    return { ...withApplicant!, profile, availability };
  }

  /** Approve, reject or suspend. The status change is ONE conditional UPDATE ("only if it is still in a state this action may start from"), so two
   * administrators clicking at once, or a double click, can never both succeed: the second finds nothing to change and gets a 409. The history row
   * is written in the same transaction. Emails go out afterwards and can't undo or block the decision. A rejection needs a reason, because the
   * applicant is sent it. */
  async review(id: string, action: "approve" | "reject" | "suspend", adminUserId: string, notes?: string) {
    const note = cleanText(notes);
    if (action === "reject" && note.length < MIN_REJECTION_REASON) throw new BadRequestException(`Write the reason for rejecting this application (at least ${MIN_REJECTION_REASON} characters). The applicant receives it by email.`);
    const before = await this.advisorsSvc.byIdOrThrow(id);
    const verb = action === "approve" ? "approved" : action === "reject" ? "rejected" : "suspended";
    const conflict = () => new ConflictException(`A ${before.status.toLowerCase().replace(/_/g, " ")} advisor can't be ${verb}.`);
    if (!REVIEWABLE_FROM[action].includes(before.status)) throw conflict();

    const decidedAt = new Date();
    const changed = await this.dataSource.transaction(async (m) => {
      const res = await m.createQueryBuilder().update(AdvisoryAdvisor)
        .set({ status: TARGET[action], reviewedByUserId: adminUserId, reviewedAt: decidedAt, reviewNotes: note || null })
        .where(`"id" = :id AND "status" IN (:...from)`, { id, from: REVIEWABLE_FROM[action] })
        .execute();
      if (!res.affected) return null;
      await m.getRepository(AdvisoryApplicationEvent).insert({
        advisorId: id, actorUserId: adminUserId, actorRole: "ADMIN", type: action === "approve" ? "APPROVED" : action === "reject" ? "REJECTED" : "SUSPENDED",
        fromStatus: before.status, toStatus: TARGET[action], note: note || null, details: null,
      });
      return true;
    });
    if (!changed) {
      // Lost the race: report what it is now, not what it was when this request began.
      const now = await this.advisorsSvc.byIdOrThrow(id);
      throw new ConflictException(`This application was already ${now.status.toLowerCase().replace(/_/g, " ")}.`);
    }

    const after = await this.advisorsSvc.byIdOrThrow(id);
    // A decision on an actual application is told to the applicant. Reinstating a suspended advisor is not an application decision.
    if (after.userId && !after.isDemo) {
      try {
        if (action === "approve" && (before.status === AdvisorStatus.PENDING_REVIEW || before.status === AdvisorStatus.REJECTED)) await this.notifier.approved(after);
        if (action === "reject") await this.notifier.rejected(after, note);
      } catch (e) {
        // The decision is already saved and recorded; an email problem must not make it look as if it failed.
        this.logger.error(`Decision email failed (${action}, ${after.applicationReference ?? after.id}): ${e instanceof Error ? e.message : "unknown error"}`);
      }
    }
    return (await this.withApplicants([after]))[0]!;
  }

  /** The one place a university affiliation can become "verified" — by an administrator, after checking it themselves. */
  async setAffiliationVerified(id: string, verified: boolean, adminUserId: string) {
    const advisor = await this.advisorsSvc.byIdOrThrow(id);
    advisor.affiliationVerified = verified;
    advisor.reviewedByUserId = adminUserId;
    advisor.reviewedAt = new Date();
    await this.advisors.save(advisor);
    return (await this.withApplicants([advisor]))[0]!;
  }

  /** Basic activity numbers. Demonstration advisors and bookings are left out unless asked for, so test activity never inflates real figures. */
  async stats(includeDemo: boolean, now = new Date()) {
    const demo = includeDemo ? "" : ` AND "isDemo" = false`;
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const [byStatus, last30, upcoming, perAdvisor, advisorsByStatus] = await Promise.all([
      this.bookings.query(`SELECT "status", count(*)::int AS n FROM advisory_bookings WHERE "status" <> 'RESCHEDULE_PROPOSED'${demo} GROUP BY "status"`),
      this.bookings.query(`SELECT count(*)::int AS n FROM advisory_bookings WHERE "createdAt" >= $1 AND "status" <> 'RESCHEDULE_PROPOSED'${demo}`, [since]),
      this.bookings.query(`SELECT count(*)::int AS n FROM advisory_bookings WHERE "status" = 'CONFIRMED' AND "startsAt" > $1${demo}`, [now]),
      this.bookings.query(`SELECT a."id", a."name", a."isDemo", count(b.*)::int AS n FROM advisory_bookings b JOIN advisory_advisors a ON a."id" = b."advisorId" WHERE b."status" <> 'RESCHEDULE_PROPOSED'${includeDemo ? "" : ` AND b."isDemo" = false`} GROUP BY a."id", a."name", a."isDemo" ORDER BY n DESC, a."name" LIMIT 5`),
      this.advisors.query(`SELECT "status", count(*)::int AS n FROM advisory_advisors${includeDemo ? "" : ` WHERE "isDemo" = false`} GROUP BY "status"`),
    ]);
    const count = (rows: { status: string; n: number }[], s: string) => rows.find((r) => r.status === s)?.n ?? 0;
    const total = (byStatus as { n: number }[]).reduce((s, r) => s + r.n, 0);
    return {
      includesDemo: includeDemo,
      generatedAt: now.toISOString(),
      bookings: {
        total,
        last30Days: (last30 as { n: number }[])[0]?.n ?? 0,
        upcomingConfirmed: (upcoming as { n: number }[])[0]?.n ?? 0,
        byStatus: Object.fromEntries(Object.values(BookingStatus).filter((s) => s !== BookingStatus.RESCHEDULE_PROPOSED).map((s) => [s, count(byStatus, s)])),
      },
      advisors: { byStatus: Object.fromEntries(Object.values(AdvisorStatus).map((s) => [s, count(advisorsByStatus, s)])) },
      topAdvisors: (perAdvisor as { id: string; name: string; isDemo: boolean; n: number }[]).map((r) => ({ id: r.id, name: r.name, isDemo: r.isDemo, bookings: r.n })),
    };
  }

  private async withApplicants(rows: AdvisoryAdvisor[]) {
    const users = rows.some((r) => r.userId) ? await this.users.find({ where: { id: In(rows.flatMap((r) => (r.userId ? [r.userId] : []))) }, select: { id: true, firstName: true, lastName: true, email: true } }) : [];
    return rows.map((a) => {
      const u = users.find((x) => x.id === a.userId);
      return {
        id: a.id, slug: a.slug, name: a.name, institution: a.institution, institutionFull: a.institutionFull, designation: a.designation, location: a.location,
        specialization: a.specialization, expertise: a.expertise, about: a.about, yearsExperience: a.yearsExperience, status: a.status, isDemo: a.isDemo,
        affiliationVerified: a.affiliationVerified, reviewNotes: a.reviewNotes, reviewedAt: a.reviewedAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(),
        applicant: u ? { name: `${u.firstName} ${u.lastName}`.trim(), email: u.email } : null,
      };
    });
  }
}
