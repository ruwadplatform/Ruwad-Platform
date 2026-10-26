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
import { CheckedFile, DOC_RULES, MAX_TOTAL_APPLICATION_BYTES, UploadedFile, checkApplicationFiles } from "./advisory-application-files";
import { AdvisoryApplicationNotifier } from "./advisory-application-notifier";
import { AdvisoryAdvisorsService } from "./advisory-advisors.service";
import { cleanText } from "./advisory-text";
import { AdvisorApplicationDto, AdvisorProfileDto, ReapplicationDto } from "./dto/advisory.dto";

const REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L: easy to read out over the phone
/** ADV-2026-K7Q2MX. Short enough to quote, unguessable enough that it isn't a way to enumerate applications (it never grants access to anything). */
export function newReference(now = new Date(), pick: (n: number) => number = (n) => randomInt(n)): string {
  let tail = "";
  for (let i = 0; i < 6; i++) tail += REFERENCE_ALPHABET[pick(REFERENCE_ALPHABET.length)];
  return `ADV-${now.getUTCFullYear()}-${tail}`;
}

/** Parses and validates the form's JSON the same way the global pipe validates a body (whitelist, no unknown fields), returning readable messages. */
export async function parseApplication<T extends AdvisorApplicationDto = AdvisorApplicationDto>(raw: unknown, cls: new () => T = AdvisorApplicationDto as unknown as new () => T): Promise<T> {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try { data = JSON.parse(raw); } catch { throw new BadRequestException("The application couldn't be read. Please try again."); }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new BadRequestException("Fill in the application form.");
  const dto = plainToInstance(cls, data);
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
  /** When the CURRENT submission was made (the latest, after a reapplication). */
  submittedAt: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  /** How many times it has been submitted: 1 at first, one more for each reapplication. */
  attempts: number;
  /** Every rejection so far, oldest first, with the reason given. Kept after a reapplication so the applicant can still read what was said. */
  rejections: { at: string; reason: string | null }[];
  /** True only when the applicant may use Edit & Reapply: the application is REJECTED. */
  canReapply: boolean;
  /** The applicant's own answers that the profile doesn't carry, so the form can be prefilled. */
  form: { email: string | null; phone: string | null; consultationServices: string | null; preferredMinutes: number | null; linkedinUrl: string | null; websiteUrl: string | null };
  documents: { id: string; kind: string; fileName: string; size: number }[];
  timeline: { type: "SUBMITTED" | "RESUBMITTED" | "APPROVED" | "REJECTED" | "SUSPENDED"; at: string }[];
}

const TIMELINE_TYPES = ["SUBMITTED", "RESUBMITTED", "APPROVED", "REJECTED", "SUSPENDED"];

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
      case AdvisorStatus.REJECTED: return "Your application was not approved. Open your Advisor Dashboard and choose Edit & Reapply to update it and submit it again.";
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

  /** Edit & Reapply. Only the owner of a REJECTED application may do this. The same answers and files rules as a first application apply; the CV on file is kept
   * unless a new one is attached, and the applicant chooses which other documents to remove. The change to PENDING_REVIEW is ONE conditional update (only while the
   * application is still REJECTED, only for this owner), so a double click or two tabs produce exactly one resubmission and one email, and a pending application can't be
   * duplicated. The earlier rejection, its reason and every earlier event stay in the history untouched; replaced files are deleted (see the retention notes). */
  async resubmit(user: AuthUser, rawData: unknown, uploads: { cv?: UploadedFile[]; certificates?: UploadedFile[]; photo?: UploadedFile[] }) {
    const advisor = await this.advisorsSvc.findByUser(user.userId);
    if (!advisor || !advisor.applicationReference) throw new NotFoundException("You don't have an application to update.");
    if (advisor.status !== AdvisorStatus.REJECTED) throw new ConflictException(advisor.status === AdvisorStatus.PENDING_REVIEW ? this.alreadyMessage(advisor) : "Only a rejected application can be updated and resubmitted.");

    const problems: string[] = [];
    let dto: ReapplicationDto | null = null;
    try { dto = await parseApplication(rawData, ReapplicationDto); } catch (e) {
      if (e instanceof BadRequestException) { const m = (e.getResponse() as { message?: string | string[] }).message; problems.push(...(Array.isArray(m) ? m : [m ?? "The application is invalid."])); } else throw e;
    }
    const checked = checkApplicationFiles(uploads, { requireCv: false });
    problems.push(...checked.errors);

    const existing = await this.docs.find({ where: { advisorId: advisor.id }, order: { createdAt: "ASC" } });
    const removeIds = new Set(dto?.removeDocumentIds ?? []);
    for (const id of removeIds) if (!existing.some((d) => d.id === id)) problems.push("One of the documents you chose to remove isn't part of this application.");
    const newOf = (k: string) => checked.files.filter((f) => f.kind === k);
    // A new CV or photograph replaces the old one; otherwise the old one stays unless removed.
    const gone = new Set(existing.filter((d) => removeIds.has(d.id) || (d.kind === "CV" && newOf("CV").length > 0) || (d.kind === "PHOTO" && newOf("PHOTO").length > 0)).map((d) => d.id));
    const kept = existing.filter((d) => !gone.has(d.id));
    if (!kept.some((d) => d.kind === "CV") && newOf("CV").length === 0) problems.push("Attach your CV or resume as a PDF.");
    if (kept.filter((d) => d.kind === "CERTIFICATE").length + newOf("CERTIFICATE").length > DOC_RULES.CERTIFICATE.maxCount) problems.push(`You can attach at most ${DOC_RULES.CERTIFICATE.maxCount} certificates in total.`);
    if (kept.reduce((s, d) => s + d.size, 0) + checked.files.reduce((s, f) => s + f.size, 0) > MAX_TOTAL_APPLICATION_BYTES) problems.push(`All files together must be ${MAX_TOTAL_APPLICATION_BYTES / 1024 / 1024} MB or smaller.`);
    if (problems.length || !dto) throw new BadRequestException([...new Set(problems)]);

    const now = new Date();
    const attempts = (await this.events.count({ where: { advisorId: advisor.id, type: In(["SUBMITTED", "RESUBMITTED"]) } })) + 1;
    const fields = this.advisorsSvc.profileFields(this.profileFrom(dto));
    const ok = await this.dataSource.transaction(async (m) => {
      const res = await m.createQueryBuilder().update(AdvisoryAdvisor)
        .set({
          ...fields, contactEmail: dto!.email.trim().toLowerCase(), phone: cleanText(dto!.phone), consultationServices: cleanText(dto!.consultationServices) || null,
          preferredMinutes: dto!.preferredMinutes ?? null, linkedinUrl: cleanText(dto!.linkedinUrl) || null, websiteUrl: cleanText(dto!.websiteUrl) || null,
          status: AdvisorStatus.PENDING_REVIEW, reviewedByUserId: null, reviewedAt: null, reviewNotes: null, submittedAt: now, declarationAcceptedAt: now,
          // A new profile text means any earlier affiliation check no longer applies.
          affiliationVerified: false,
        })
        .where(`"id" = :id AND "userId" = :uid AND "status" = :st`, { id: advisor.id, uid: user.userId, st: AdvisorStatus.REJECTED })
        .execute();
      if (!res.affected) return false;
      if (gone.size) await m.getRepository(AdvisoryApplicationDocument).delete({ id: In([...gone]), advisorId: advisor.id });
      if (checked.files.length) await m.getRepository(AdvisoryApplicationDocument).insert(checked.files.map((f: CheckedFile) => ({ advisorId: advisor.id, kind: f.kind, fileName: f.fileName, mimeType: f.mimeType, size: f.size, data: f.data })));
      await m.getRepository(AdvisoryApplicationEvent).insert({
        advisorId: advisor.id, actorUserId: user.userId, actorRole: "APPLICANT", type: "RESUBMITTED", fromStatus: AdvisorStatus.REJECTED, toStatus: AdvisorStatus.PENDING_REVIEW, note: null,
        details: { reference: advisor.applicationReference!, attempt: attempts, removed: existing.filter((d) => gone.has(d.id)).map((d) => ({ kind: d.kind, fileName: d.fileName })), added: checked.files.map((f) => ({ kind: f.kind, fileName: f.fileName })) },
      });
      return true;
    });
    if (!ok) throw new ConflictException("This application was already resubmitted.");

    const saved = await this.advisorsSvc.byIdOrThrow(advisor.id);
    try { await this.notifier.reapplication(saved, attempts); } catch (e) { this.logger.error(`Reapplication notification failed: ${e instanceof Error ? e.message : "unknown error"}`); }
    return { reference: saved.applicationReference!, status: saved.status, submittedAt: now.toISOString(), attempt: attempts };
  }

  // ---- the applicant's own view -----------------------------------------------------------------------------------------------------------

  /** Null for profiles that did not come through the application form. */
  async statusFor(advisor: AdvisoryAdvisor): Promise<ApplicationStatusView | null> {
    if (!advisor.applicationReference) return null;
    const [docs, events] = await Promise.all([
      this.docs.find({ where: { advisorId: advisor.id }, order: { createdAt: "ASC" } }),
      this.events.find({ where: { advisorId: advisor.id, type: In(TIMELINE_TYPES) }, order: { createdAt: "ASC" } }),
    ]);
    const rejections = events.filter((e) => e.type === "REJECTED").map((e) => ({ at: e.createdAt.toISOString(), reason: e.note }));
    return {
      reference: advisor.applicationReference,
      stage: advisor.status === AdvisorStatus.DRAFT ? "PENDING_REVIEW" : (advisor.status as ApplicationStage),
      submittedAt: advisor.submittedAt?.toISOString() ?? null,
      decidedAt: advisor.status === AdvisorStatus.PENDING_REVIEW ? null : advisor.reviewedAt?.toISOString() ?? null,
      rejectionReason: advisor.status === AdvisorStatus.REJECTED ? advisor.reviewNotes : null,
      attempts: events.filter((e) => e.type === "SUBMITTED" || e.type === "RESUBMITTED").length,
      rejections,
      canReapply: advisor.status === AdvisorStatus.REJECTED,
      form: { email: advisor.contactEmail, phone: advisor.phone, consultationServices: advisor.consultationServices, preferredMinutes: advisor.preferredMinutes, linkedinUrl: advisor.linkedinUrl, websiteUrl: advisor.websiteUrl },
      documents: docs.map((d) => ({ id: d.id, kind: d.kind, fileName: d.fileName, size: d.size })),
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
    const resub: { advisorId: string; n: number }[] = rows.length ? await this.events.query(`SELECT "advisorId", count(*)::int AS n FROM advisory_application_events WHERE type = 'RESUBMITTED' AND "advisorId" = ANY($1) GROUP BY "advisorId"`, [rows.map((r) => r.id)]) : [];
    const userIds = rows.flatMap((r) => (r.userId ? [r.userId] : []));
    const users = userIds.length ? await this.users.find({ where: { id: In(userIds) }, select: { id: true, email: true } }) : [];
    return {
      counts,
      applications: rows.map((r) => ({
        id: r.id, reference: r.applicationReference, name: r.name, institution: r.institution, specialization: r.specialization,
        email: r.contactEmail ?? users.find((u) => u.id === r.userId)?.email ?? null, submittedAt: new Date(r.submittedAt ?? r.createdAt).toISOString(), status: r.status,
        resubmissions: resub.find((x) => x.advisorId === r.id)?.n ?? 0,
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
