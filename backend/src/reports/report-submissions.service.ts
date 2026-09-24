import { BadRequestException, ConflictException, GoneException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash } from "crypto";
import * as path from "path";
import { DataSource, IsNull, Repository } from "typeorm";
import { EmailService } from "../email/email.service";
import { UsersService } from "../users/users.service";
import { SubmitReportDto } from "./dto/submit-report.dto";
import { ReportFile } from "./report-file.entity";
import { ReportReviewToken } from "./report-review-token.entity";
import { ReportSubmission } from "./report-submission.entity";
import { MAX_REPORT_PDF_BYTES, REPORT_CATEGORY_CHIPS, REVIEW_TOKEN_TTL_MS, type SourceLink } from "./report-submission.constants";
import { Report } from "./report.entity";
import { ReportsService } from "./reports.service";
import { hashReviewToken, looksLikeReviewToken, newReviewToken } from "./review-token";

export interface FileStream { fileName: string; mimeType: string; data: Buffer }

const INVALID_LINK = "This review link isn't valid.";
const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "23505";

/** A PDF starts with "%PDF-" (a few producers put up to 1 KB of junk before it). Judged from the bytes, never the file name. */
export function looksLikePdf(buf: Buffer): boolean {
  return buf.length > 8 && buf.subarray(0, 1024).toString("latin1").indexOf("%PDF-") >= 0;
}

export function safeFileName(name: string | undefined): string {
  const base = path.basename(name ?? "report.pdf").replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "report.pdf";
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

/** "2026" -> 2026-01-01; a full date is kept; anything else is treated as not given. */
export function normalizePublicationDate(value?: string): string | null {
  if (!value) return null;
  const full = /^\d{4}$/.test(value) ? `${value}-01-01` : value;
  const d = new Date(`${full}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== full ? null : full;
}

/** Files a submitted report under one of the category chips the Reports directory already has. */
export function chooseCategory(reportType: string, sector: string): string {
  const chips = REPORT_CATEGORY_CHIPS as readonly string[];
  return chips.includes(reportType) ? reportType : chips.includes(sector) ? sector : "Market Intelligence";
}

@Injectable()
export class ReportSubmissionsService {
  private readonly logger = new Logger(ReportSubmissionsService.name);

  constructor(
    @InjectRepository(ReportSubmission) private readonly subs: Repository<ReportSubmission>,
    @InjectRepository(ReportFile) private readonly files: Repository<ReportFile>,
    @InjectRepository(ReportReviewToken) private readonly tokens: Repository<ReportReviewToken>,
    @InjectRepository(Report) private readonly reports: Repository<Report>,
    private readonly reportsService: ReportsService,
    private readonly users: UsersService,
    private readonly email: EmailService,
    private readonly db: DataSource,
  ) {}

  /* ------------------------------------------------------------------ submitting */

  /** Stores a PDF privately for the signed-in user. It isn't reachable by anyone else until its report is published. */
  async saveFile(file: Express.Multer.File | undefined, userId: string): Promise<{ fileId: string; fileName: string; size: number }> {
    if (!file) throw new BadRequestException("No file uploaded");
    if (file.size > MAX_REPORT_PDF_BYTES) throw new BadRequestException("The PDF must be 10 MB or smaller");
    if (!looksLikePdf(file.buffer)) throw new BadRequestException("The file must be a PDF");
    const fileName = safeFileName(file.originalname);
    const saved = await this.files.save(this.files.create({
      ownerUserId: userId, fileName, mimeType: "application/pdf", size: file.size,
      sha256: createHash("sha256").update(file.buffer).digest("hex"), data: file.buffer,
    }));
    return { fileId: saved.id, fileName, size: file.size };
  }

  async submit(userId: string, dto: SubmitReportDto) {
    const already = await this.subs.findOne({ where: { userId, idempotencyKey: dto.idempotencyKey } });
    if (already) return this.ownerView(already); // a repeated click / retry: the first request stands

    if (!dto.reportUrl && !dto.fileId) throw new BadRequestException("Add a link to the report or upload a PDF");
    if (dto.fileId) {
      const file = await this.files.findOne({ where: { id: dto.fileId, ownerUserId: userId }, select: { id: true } });
      if (!file) throw new BadRequestException("The uploaded PDF was not found. Please upload it again.");
      if (await this.subs.count({ where: { fileId: dto.fileId } })) throw new BadRequestException("That PDF is already attached to another submission.");
    }

    const sources: SourceLink[] = (dto.sources ?? []).map((s) => ({ title: s.title.trim(), url: s.url.trim() }));
    let saved: ReportSubmission;
    try {
      saved = await this.subs.save(this.subs.create({
        userId, title: dto.title.trim(), reportType: dto.reportType, sector: dto.sector, geography: dto.geography,
        publicationDate: normalizePublicationDate(dto.publicationDate), description: dto.description.trim(), executiveSummary: dto.executiveSummary.trim(),
        authorName: dto.authorName.trim(), organizationName: dto.organizationName.trim(), authorEmail: dto.authorEmail.trim().toLowerCase(),
        website: dto.website?.trim() || null, linkedin: dto.linkedin?.trim() || null, reportUrl: dto.reportUrl?.trim() || null, fileId: dto.fileId ?? null,
        sources, declarationAccepted: true, status: "PENDING_REVIEW", idempotencyKey: dto.idempotencyKey, submittedAt: new Date(), reviewEmailAttempts: 0,
      }));
    } catch (e) {
      // Two identical requests raced: the unique (user, key) index let only one through.
      if (isUniqueViolation(e)) {
        const winner = await this.subs.findOne({ where: { userId, idempotencyKey: dto.idempotencyKey } });
        if (winner) return this.ownerView(winner);
      }
      throw e;
    }

    // The submission is safe in the database whatever happens to the email.
    await this.issueTokenAndEmail(saved);
    return this.ownerView(saved);
  }

  /** Makes a fresh review link (voiding older ones) and emails it. Never throws: a failed send leaves the submission
   * pending and is visible to admins, who can resend. */
  private async issueTokenAndEmail(sub: ReportSubmission): Promise<boolean> {
    await this.tokens.update({ submissionId: sub.id, usedAt: IsNull() }, { usedAt: new Date() });
    const token = newReviewToken();
    await this.tokens.save(this.tokens.create({ submissionId: sub.id, tokenHash: hashReviewToken(token), expiresAt: new Date(Date.now() + REVIEW_TOKEN_TTL_MS) }));
    let sent = false;
    try {
      sent = await this.email.sendReportSubmissionReview({
        token, title: sub.title, reportType: sub.reportType, sector: sub.sector, geography: sub.geography, authorName: sub.authorName,
        organizationName: sub.organizationName, authorEmail: sub.authorEmail, submittedAt: sub.submittedAt, executiveSummary: sub.executiveSummary,
        reportUrl: sub.reportUrl, hasFile: !!sub.fileId, sources: sub.sources,
      });
    } catch (e) {
      this.logger.error(`Review email for report submission ${sub.id} failed: ${e instanceof Error ? e.message : "unknown error"}`);
    }
    if (!sent) this.logger.warn(`Report submission ${sub.id} is pending but its review email was not sent — an admin can resend it.`);
    await this.subs.update(sub.id, { reviewEmailAttempts: (sub.reviewEmailAttempts ?? 0) + 1, ...(sent ? { reviewEmailSentAt: new Date() } : {}) });
    return sent;
  }

  /* -------------------------------------------------------------- the owner's view */

  private async publishedSlugs(subs: ReportSubmission[]): Promise<Map<string, string>> {
    const ids = subs.map((s) => s.publishedReportId).filter((x): x is string => !!x);
    if (!ids.length) return new Map();
    const rows = await this.reports.find({ where: ids.map((id) => ({ id })), select: { id: true, slug: true } });
    return new Map(rows.map((r) => [r.id, r.slug]));
  }

  private ownerView(s: ReportSubmission, slugs?: Map<string, string>) {
    return {
      id: s.id, title: s.title, status: s.status, submittedAt: s.submittedAt, reviewedAt: s.reviewedAt ?? null,
      reportType: s.reportType, sector: s.sector, geography: s.geography, publicationDate: s.publicationDate ?? null,
      description: s.description, executiveSummary: s.executiveSummary, authorName: s.authorName, organizationName: s.organizationName,
      reportUrl: s.reportUrl ?? null, hasFile: !!s.fileId, sources: s.sources,
      rejectionReason: s.status === "REJECTED" ? s.rejectionReason ?? null : null,
      reportSlug: s.publishedReportId ? slugs?.get(s.publishedReportId) ?? null : null,
    };
  }

  async listMine(userId: string) {
    const rows = await this.subs.find({ where: { userId }, order: { submittedAt: "DESC" } });
    const slugs = await this.publishedSlugs(rows);
    return rows.map((r) => this.ownerView(r, slugs));
  }

  private async ownOrThrow(userId: string, id: string): Promise<ReportSubmission> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundException("Submission not found");
    const s = await this.subs.findOne({ where: { id, userId } });
    if (!s) throw new NotFoundException("Submission not found"); // someone else's request looks exactly like a missing one
    return s;
  }

  async getMine(userId: string, id: string) {
    const s = await this.ownOrThrow(userId, id);
    return this.ownerView(s, await this.publishedSlugs([s]));
  }

  async ownerFile(userId: string, id: string): Promise<FileStream> {
    const s = await this.ownOrThrow(userId, id);
    if (!s.fileId) throw new NotFoundException("This submission has no PDF");
    return this.loadFile(s.fileId);
  }

  /* ---------------------------------------------------------------- public file */

  /** A submitted PDF is public only while the report it belongs to is published. */
  async publishedFile(fileId: string): Promise<FileStream> {
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) throw new NotFoundException("File not found");
    const report = await this.reports.findOne({ where: { reportFileId: fileId, isPublished: true }, select: { id: true } });
    if (!report) throw new NotFoundException("File not found");
    return this.loadFile(fileId);
  }

  private async loadFile(fileId: string): Promise<FileStream> {
    const f = await this.files.createQueryBuilder("f").addSelect("f.data").where("f.id = :id", { id: fileId }).getOne();
    if (!f) throw new NotFoundException("File not found");
    return { fileName: f.fileName, mimeType: f.mimeType, data: f.data };
  }

  /* ------------------------------------------------------------- the review link */

  private assertUsable(token: ReportReviewToken | null, sub: ReportSubmission | null): asserts token is ReportReviewToken {
    if (!token || !sub) throw new NotFoundException(INVALID_LINK);
    if (token.usedAt) throw new ConflictException("This review link has already been used or was replaced by a newer one.");
    if (token.expiresAt.getTime() < Date.now()) throw new GoneException("This review link has expired. An admin can send a new one.");
    if (sub.status !== "PENDING_REVIEW") throw new ConflictException("This report has already been reviewed.");
  }

  private async resolve(raw: string | undefined) {
    if (!looksLikeReviewToken(raw)) throw new NotFoundException(INVALID_LINK);
    const token = await this.tokens.findOne({ where: { tokenHash: hashReviewToken(raw) } });
    const sub = token ? await this.subs.findOne({ where: { id: token.submissionId } }) : null;
    this.assertUsable(token, sub);
    return { token, sub: sub! };
  }

  /** Read-only: opening the link (or a mail scanner pre-fetching it) changes nothing. */
  async reviewInfo(raw: string | undefined) {
    const { token, sub } = await this.resolve(raw);
    return {
      title: sub.title, reportType: sub.reportType, sector: sub.sector, geography: sub.geography, publicationDate: sub.publicationDate ?? null,
      authorName: sub.authorName, organizationName: sub.organizationName, description: sub.description, executiveSummary: sub.executiveSummary,
      sources: sub.sources, reportUrl: sub.reportUrl ?? null, hasFile: !!sub.fileId, submittedAt: sub.submittedAt, expiresAt: token.expiresAt,
    };
  }

  async reviewFile(raw: string | undefined): Promise<FileStream> {
    const { sub } = await this.resolve(raw);
    if (!sub.fileId) throw new NotFoundException("This submission has no PDF");
    return this.loadFile(sub.fileId);
  }

  /** The only place a decision is made: one transaction that locks the link and the submission, so two clicks (or a click
   * and a scanner) can't both succeed. Accept creates the public report; reject leaves nothing public. */
  async decide(raw: string | undefined, action: "ACCEPT" | "REJECT", reason?: string) {
    if (!looksLikeReviewToken(raw)) throw new NotFoundException(INVALID_LINK);
    const hash = hashReviewToken(raw);
    const outcome = await this.db.transaction(async (m) => {
      const token = await m.getRepository(ReportReviewToken).createQueryBuilder("t").setLock("pessimistic_write").where("t.tokenHash = :hash", { hash }).getOne();
      const sub = token ? await m.getRepository(ReportSubmission).createQueryBuilder("s").setLock("pessimistic_write").where("s.id = :id", { id: token.submissionId }).getOne() : null;
      this.assertUsable(token, sub);
      const now = new Date();
      await m.getRepository(ReportReviewToken).update({ submissionId: sub!.id, usedAt: IsNull() }, { usedAt: now }); // this link and any other open one
      let report: Report | null = null;
      if (action === "ACCEPT") {
        report = await m.getRepository(Report).save(m.getRepository(Report).create(await this.reportFromSubmission(sub!, now)));
        Object.assign(sub!, { status: "PUBLISHED", publishedAt: now, publishedReportId: report.id, reviewAction: "ACCEPT" });
      } else {
        Object.assign(sub!, { status: "REJECTED", rejectedAt: now, rejectionReason: reason?.trim() || null, reviewAction: "REJECT" });
      }
      Object.assign(sub!, { reviewedAt: now, reviewedVia: "EMAIL_TOKEN", reviewedByUserId: null });
      await m.getRepository(ReportSubmission).save(sub!);
      return { sub: sub!, report };
    });

    await this.notifyRequester(outcome.sub, outcome.report);
    return { status: outcome.sub.status, title: outcome.sub.title, reportSlug: outcome.report?.slug ?? null };
  }

  private async reportFromSubmission(sub: ReportSubmission, now: Date): Promise<Partial<Report>> {
    const today = now.toISOString().slice(0, 10);
    const hosts = [...new Set(sub.sources.map((s) => { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return ""; } }).filter(Boolean))];
    return {
      slug: await this.reportsService.uniqueSlug(sub.title), title: sub.title, category: chooseCategory(sub.reportType, sub.sector), reportType: sub.reportType,
      publicationDate: today, reportDate: sub.publicationDate ?? null, description: sub.description, geography: sub.geography, sector: sub.sector, authors: [sub.authorName],
      readingTime: "", pages: 0, badges: [], executiveSummary: sub.executiveSummary, keyFindings: [], marketStats: [], sections: [],
      sources: sub.sources.map((s) => s.title), relatedStartupIds: [], relatedInvestorIds: [], relatedReportIds: [], publishedAt: now,
      provenanceConfidence: "Low", provenanceLastUpdated: today, provenanceSources: hosts, isPublished: true,
      origin: "USER_SUBMITTED", submissionId: sub.id, organizationName: sub.organizationName, reportUrl: sub.reportUrl ?? null, reportFileId: sub.fileId ?? null, referenceLinks: sub.sources,
    };
  }

  /** Emails the requester about the decision. The decision is already saved; a failed email is only logged. */
  private async notifyRequester(sub: ReportSubmission, report: Report | null): Promise<void> {
    try {
      const user = await this.users.findByIdOrThrow(sub.userId).catch(() => null);
      const to = user?.email ?? sub.authorEmail;
      const firstName = user?.firstName ?? sub.authorName.split(" ")[0];
      if (report) await this.email.sendReportPublished({ to, firstName, title: sub.title, slug: report.slug });
      else await this.email.sendReportRejected({ to, firstName, title: sub.title, reason: sub.rejectionReason });
    } catch (e) {
      this.logger.error(`Could not notify the requester of report submission ${sub.id}: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }

  /* ------------------------------------------------------------------- admin */

  async adminList() {
    const rows = await this.subs.find({ order: { submittedAt: "DESC" }, take: 200 });
    return rows.map((s) => ({
      id: s.id, title: s.title, status: s.status, submittedAt: s.submittedAt, authorName: s.authorName, organizationName: s.organizationName,
      reviewEmailSentAt: s.reviewEmailSentAt ?? null, reviewEmailAttempts: s.reviewEmailAttempts, reviewedAt: s.reviewedAt ?? null, reviewAction: s.reviewAction ?? null,
    }));
  }

  /** Retry for a request whose email failed or whose link expired: voids older links and emails a new one. */
  async resendReviewEmail(id: string): Promise<{ sent: boolean }> {
    const s = await this.subs.findOne({ where: { id } });
    if (!s) throw new NotFoundException("Submission not found");
    if (s.status !== "PENDING_REVIEW") throw new ConflictException("Only a pending submission can be re-sent for review");
    return { sent: await this.issueTokenAndEmail(s) };
  }
}
