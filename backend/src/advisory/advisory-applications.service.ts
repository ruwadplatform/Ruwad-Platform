import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { randomInt } from "crypto";
import { DataSource, In, Repository } from "typeorm";
import { AuthUser } from "../common/decorators/current-user.decorator";
import { User } from "../users/user.entity";
import { AdvisoryAdvisor, AdvisoryApplicationDocument, AdvisoryApplicationEvent } from "./advisory.entities";
import { AdvisorStatus } from "./advisory.enums";
import { CheckedFile, UploadedFile, checkApplicationFiles } from "./advisory-application-files";
import { AdvisoryApplicationNotifier } from "./advisory-application-notifier";
import { AdvisoryAdvisorsService } from "./advisory-advisors.service";
import { cleanText } from "./advisory-text";
import { AdvisorApplicationDto, AdvisorProfileDto } from "./dto/advisory.dto";

const REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L: easy to read out over the phone
/** ADV-2026-K7Q2MX. Short enough to quote, unguessable enough that it isn't a way to enumerate applications (it never grants access to anything). */
export function newReference(now = new Date(), pick: (n: number) => number = (n) => randomInt(n)): string {
  let tail = "";
  for (let i = 0; i < 6; i++) tail += REFERENCE_ALPHABET[pick(REFERENCE_ALPHABET.length)];
  return `ADV-${now.getUTCFullYear()}-${tail}`;
}

/** Parses and validates the form's JSON the same way the global pipe validates a body (whitelist, no unknown fields), returning readable messages. */
export async function parseApplication(raw: unknown): Promise<AdvisorApplicationDto> {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try { data = JSON.parse(raw); } catch { throw new BadRequestException("The application couldn't be read. Please try again."); }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new BadRequestException("Fill in the application form.");
  const dto = plainToInstance(AdvisorApplicationDto, data);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length) throw new BadRequestException(errors.flatMap((e) => Object.values(e.constraints ?? { x: `${e.property} is invalid` })));
  return dto;
}

export type ApplicationStage = "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED";

/** What the applicant sees about their own application. The administrator's notes are never included, except the reason for a rejection, which is
 * written for the applicant and is exactly what the rejection email says. */
export interface ApplicationStatusView {
  reference: string;
  stage: ApplicationStage;
  submittedAt: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  documents: { kind: string; fileName: string; size: number }[];
  timeline: { type: "SUBMITTED" | "APPROVED" | "REJECTED" | "SUSPENDED"; at: string }[];
}

const TIMELINE_TYPES = ["SUBMITTED", "APPROVED", "REJECTED", "SUSPENDED"];

@Injectable()
export class AdvisoryApplicationsService {
  private readonly logger = new Logger(AdvisoryApplicationsService.name);

  constructor(
    @InjectRepository(AdvisoryAdvisor) private readonly advisors: Repository<AdvisoryAdvisor>,
    @InjectRepository(AdvisoryApplicationDocument) private readonly docs: Repository<AdvisoryApplicationDocument>,
    @InjectRepository(AdvisoryApplicationEvent) private readonly events: Repository<AdvisoryApplicationEvent>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly advisorsSvc: AdvisoryAdvisorsService,
    private readonly notifier: AdvisoryApplicationNotifier,
  ) {}

  /** Submit an application. Everything is validated first (form and files, every problem reported at once); the profile, its documents and the
   * "submitted" history entry are then written in ONE transaction, so there is never a half-saved application. Emailing RUWĀD happens afterwards and
   * cannot undo it. One application per account: a second attempt (a double click, or a second tab) is a 409, not a second record. */
  async submit(user: AuthUser, rawData: unknown, uploads: { cv?: UploadedFile[]; certificates?: UploadedFile[]; photo?: UploadedFile[] }) {
    const problems: string[] = [];
    let dto: AdvisorApplicationDto | null = null;
    try { dto = await parseApplication(rawData); } catch (e) {
      if (e instanceof BadRequestException) { const m = (e.getResponse() as { message?: string | string[] }).message; problems.push(...(Array.isArray(m) ? m : [m ?? "The application is invalid."])); } else throw e;
    }
    const checked = checkApplicationFiles(uploads);
    problems.push(...checked.errors);
    if (problems.length || !dto) throw new BadRequestException(problems);

    const existing = await this.advisorsSvc.findByUser(user.userId);
    if (existing) throw new ConflictException(this.alreadyMessage(existing));

    const now = new Date();
    let saved: AdvisoryAdvisor | null = null;
    for (let attempt = 0; attempt < 5 && !saved; attempt++) {
      const reference = newReference(now);
      try {
        saved = await this.dataSource.transaction(async (m) => {
          const advisor = await this.advisorsSvc.apply(user.userId, this.profileFrom(dto!), {
            contactEmail: dto!.email.trim().toLowerCase(), phone: cleanText(dto!.phone), consultationServices: cleanText(dto!.consultationServices) || null,
            preferredMinutes: dto!.preferredMinutes ?? null, linkedinUrl: cleanText(dto!.linkedinUrl) || null, websiteUrl: cleanText(dto!.websiteUrl) || null,
            applicationReference: reference, submittedAt: now, declarationAcceptedAt: now,
          }, m);
          await m.getRepository(AdvisoryApplicationDocument).insert(checked.files.map((f: CheckedFile) => ({ advisorId: advisor.id, kind: f.kind, fileName: f.fileName, mimeType: f.mimeType, size: f.size, data: f.data })));
          await m.getRepository(AdvisoryApplicationEvent).insert({ advisorId: advisor.id, actorUserId: user.userId, actorRole: "APPLICANT", type: "SUBMITTED", fromStatus: null, toStatus: AdvisorStatus.PENDING_REVIEW, note: null, details: { reference, documents: checked.files.map((f) => f.kind) } });
          return advisor;
        });
      } catch (e) {
        const err = e as { code?: string; constraint?: string; detail?: string };
        if (err.code === "23505") {
          // Two sign-ins racing: the person already has a profile. Or, very rarely, the reference collided: draw another.
          if (`${err.constraint ?? ""} ${err.detail ?? ""}`.includes("userId") || err.constraint === "IDX_advisory_advisors_user") throw new ConflictException("You have already submitted an application.");
          continue;
        }
        throw e;
      }
    }
    if (!saved) throw new ConflictException("We couldn't record your application just now. Please try again in a moment.");

    // Told after the fact, best effort: the application is already safe.
    try { await this.notifier.newApplication(saved); } catch (e) { this.logger.error(`New-application notification failed: ${e instanceof Error ? e.message : "unknown error"}`); }
    return { reference: saved.applicationReference!, status: saved.status, submittedAt: now.toISOString() };
  }

  private alreadyMessage(a: AdvisoryAdvisor): string {
    switch (a.status) {
      case AdvisorStatus.APPROVED: return "You are already an approved RUWĀD advisor.";
      case AdvisorStatus.REJECTED: return "Your earlier application was not approved. Please contact the RUWĀD team if you have questions.";
      case AdvisorStatus.SUSPENDED: return "Your advisor profile is currently suspended. Please contact the RUWĀD team.";
      default: return `Your application${a.applicationReference ? ` (${a.applicationReference})` : ""} has already been submitted and is waiting for review.`;
    }
  }

  private profileFrom(dto: AdvisorApplicationDto): AdvisorProfileDto {
    const institution = cleanText(dto.institution);
    const services = cleanText(dto.consultationServices);
    return {
      name: dto.name, institution, institutionFull: institution, designation: dto.designation, location: dto.location,
      specialization: dto.specialization, specializations: dto.specializations ?? [], researchAreas: dto.researchAreas ?? [],
      // The one-line summary shown on directory cards: what they offer if they said, otherwise their specialization.
      expertise: services ? (services.length > 300 ? `${services.slice(0, 297).trimEnd()}…` : services) : cleanText(dto.specialization),
      about: dto.about, yearsExperience: dto.yearsExperience,
    };
  }

  // ---- the applicant's own view -----------------------------------------------------------------------------------------------------------

  /** Null for profiles that did not come through the application form. */
  async statusFor(advisor: AdvisoryAdvisor): Promise<ApplicationStatusView | null> {
    if (!advisor.applicationReference) return null;
    const [docs, events] = await Promise.all([
      this.docs.find({ where: { advisorId: advisor.id }, order: { createdAt: "ASC" } }),
      this.events.find({ where: { advisorId: advisor.id, type: In(TIMELINE_TYPES) }, order: { createdAt: "ASC" } }),
    ]);
    return {
      reference: advisor.applicationReference,
      stage: advisor.status === AdvisorStatus.DRAFT ? "PENDING_REVIEW" : (advisor.status as ApplicationStage),
      submittedAt: advisor.submittedAt?.toISOString() ?? null,
      decidedAt: advisor.status === AdvisorStatus.PENDING_REVIEW ? null : advisor.reviewedAt?.toISOString() ?? null,
      rejectionReason: advisor.status === AdvisorStatus.REJECTED ? advisor.reviewNotes : null,
      documents: docs.map((d) => ({ kind: d.kind, fileName: d.fileName, size: d.size })),
      timeline: events.map((e) => ({ type: e.type as ApplicationStatusView["timeline"][number]["type"], at: e.createdAt.toISOString() })),
    };
  }

  // ---- administrators ---------------------------------------------------------------------------------------------------------------------

  /** Real applicants only: demonstration profiles have no account and never applied. `status` is a single status, or empty/ALL for everything. */
  async listForAdmin(status?: string) {
    const where = `a."isDemo" = false AND a."userId" IS NOT NULL`;
    const filter = status && (Object.values(AdvisorStatus) as string[]).includes(status) ? ` AND a."status" = $1` : "";
    const rows: AdvisoryAdvisor[] = await this.advisors.query(`SELECT a.* FROM advisory_advisors a WHERE ${where}${filter} ORDER BY COALESCE(a."submittedAt", a."createdAt") DESC`, filter ? [status] : []);
    const countRows: { status: string; n: number }[] = await this.advisors.query(`SELECT a."status", count(*)::int AS n FROM advisory_advisors a WHERE ${where} GROUP BY a."status"`);
    const counts: Record<string, number> = { ALL: countRows.reduce((s, r) => s + r.n, 0) };
    for (const s of Object.values(AdvisorStatus)) counts[s] = countRows.find((r) => r.status === s)?.n ?? 0;
    const userIds = rows.flatMap((r) => (r.userId ? [r.userId] : []));
    const users = userIds.length ? await this.users.find({ where: { id: In(userIds) }, select: { id: true, email: true } }) : [];
    return {
      counts,
      applications: rows.map((r) => ({
        id: r.id, reference: r.applicationReference, name: r.name, institution: r.institution, specialization: r.specialization,
        email: r.contactEmail ?? users.find((u) => u.id === r.userId)?.email ?? null, submittedAt: new Date(r.submittedAt ?? r.createdAt).toISOString(), status: r.status,
      })),
    };
  }

  /** Everything submitted, the documents on file (names only; the bytes come from the download route), and the whole history. */
  async detailForAdmin(id: string) {
    const advisor = await this.advisors.findOne({ where: { id } });
    if (!advisor || advisor.isDemo || !advisor.userId) throw new NotFoundException("Application not found.");
    const [docs, events, user] = await Promise.all([
      this.docs.find({ where: { advisorId: id }, order: { createdAt: "ASC" } }),
      this.events.find({ where: { advisorId: id }, order: { createdAt: "ASC" } }),
      this.users.findOne({ where: { id: advisor.userId }, select: { id: true, firstName: true, lastName: true, email: true } }),
    ]);
    const reviewer = advisor.reviewedByUserId ? await this.users.findOne({ where: { id: advisor.reviewedByUserId }, select: { id: true, firstName: true, lastName: true } }) : null;
    return {
      id: advisor.id, reference: advisor.applicationReference, status: advisor.status,
      name: advisor.name, email: advisor.contactEmail ?? user?.email ?? null, phone: advisor.phone, designation: advisor.designation, institution: advisor.institution,
      location: advisor.location, specialization: advisor.specialization, specializations: advisor.specializations, yearsExperience: advisor.yearsExperience,
      about: advisor.about, researchAreas: advisor.researchAreas, consultationServices: advisor.consultationServices, preferredMinutes: advisor.preferredMinutes,
      linkedinUrl: advisor.linkedinUrl, websiteUrl: advisor.websiteUrl, submittedAt: (advisor.submittedAt ?? advisor.createdAt).toISOString(),
      declarationAcceptedAt: advisor.declarationAcceptedAt?.toISOString() ?? null, affiliationVerified: advisor.affiliationVerified,
      account: user ? { name: `${user.firstName} ${user.lastName}`.trim(), email: user.email } : null,
      review: advisor.reviewedAt ? { at: advisor.reviewedAt.toISOString(), by: reviewer ? `${reviewer.firstName} ${reviewer.lastName}`.trim() : null, note: advisor.reviewNotes } : null,
      documents: docs.map((d) => ({ id: d.id, kind: d.kind, fileName: d.fileName, mimeType: d.mimeType, size: d.size })),
      history: events.map((e) => ({ id: e.id, at: e.createdAt.toISOString(), actorRole: e.actorRole, type: e.type, fromStatus: e.fromStatus, toStatus: e.toStatus, note: e.note, details: e.details })),
    };
  }

  /** The file itself. Scoped by BOTH ids, so a document id from another application can never be fetched through this one. */
  async documentFor(advisorId: string, docId: string): Promise<{ fileName: string; mimeType: string; data: Buffer }> {
    const row = await this.docs.createQueryBuilder("d").addSelect("d.data").where("d.id = :docId AND d.advisorId = :advisorId", { docId, advisorId }).getOne();
    if (!row) throw new NotFoundException("Document not found.");
    return { fileName: row.fileName, mimeType: row.mimeType, data: row.data };
  }
}
