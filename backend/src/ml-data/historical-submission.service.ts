import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { HistoricalSubmission } from "./historical-submission.entity";
import { StartupFounderCareer } from "./founder-career.entity";
import { StartupOutcomeEvent } from "./outcome-event.entity";
import { HistoricalEvidence } from "./historical/historical-evidence.entity";
import { HistoricalEvidenceService } from "./historical/historical-evidence.service";
import { FeatureApplicabilityService } from "./feature-applicability.service";
import { OutcomeCoverageService } from "./outcome-coverage.service";
import { Startup } from "../startups/startup.entity";
import { FundingRound } from "../startups/funding-round.entity";
import { DocumentRef } from "../directory-shared/document-ref.entity";
import {
  EntityKind, EvidenceStatus, HistoricalEvidenceSourceType, HistoricalReviewStatus, HistoricalSubmissionKind, OutcomeCoverageMethod, OutcomeEventSource, ScoreDataSource, SourceReliability, StartupOutcomeEventType, UserRole,
} from "../common/enums";
import type { AuthUser } from "../common/decorators/current-user.decorator";
import {
  CUSTOMER_METRIC_TYPES, CURRENCIES, findFundingDuplicates, FundingDuplicateCandidate, plannedWrites, REGULATORY_ANSWERS, REVENUE_TYPES, SUPPORTING_DOCUMENT_TYPES, validateEntry,
} from "./historical-submission.validation";
import { LADDERS, pathwayFor } from "../scoring/engines/regulatory.engine";
import { FOUNDER_ATTESTABLE_FAMILIES } from "./historical-submission.validation";
import { todayIso } from "./feature-applicability.service";

export interface SubmitEntryInput {
  kind: HistoricalSubmissionKind;
  entry: unknown;
  supportingDocumentId?: string;
  supportingDocumentType?: string;
  founderNote?: string;
}

export type ReviewAction = "VERIFY" | "REJECT" | "REQUEST_CORRECTION";

export interface ReviewOptions {
  notes?: string;
  /** The reviewer actually checked the supporting document: the record is stored as VERIFIED_DOCUMENT (the strongest provenance). */
  documentValidated?: boolean;
  /** Required to approve a funding round that looks like one already on file. */
  confirmNotDuplicate?: boolean;
}

/** Allowed review-state moves (VALID_TRANSITIONS pattern, as in the model
 * registry). VERIFIED and REJECTED are terminal: once approved, a record is
 * corrected through the existing evidence-conflict tools, never silently
 * edited here. */
const VALID_TRANSITIONS: Record<HistoricalReviewStatus, HistoricalReviewStatus[]> = {
  [HistoricalReviewStatus.PENDING_REVIEW]: [HistoricalReviewStatus.VERIFIED, HistoricalReviewStatus.REJECTED, HistoricalReviewStatus.CHANGES_REQUESTED],
  [HistoricalReviewStatus.CHANGES_REQUESTED]: [HistoricalReviewStatus.PENDING_REVIEW, HistoricalReviewStatus.REJECTED],
  [HistoricalReviewStatus.VERIFIED]: [],
  [HistoricalReviewStatus.REJECTED]: [],
};

const isAdmin = (u: AuthUser) => u.role === UserRole.RUWAD_ADMIN || u.role === UserRole.SUPER_ADMIN;

/** Founder/admin historical-data workflow. A founder's entry is held in
 * startup_historical_submissions (FOUNDER_SUBMITTED, PENDING_REVIEW) and
 * touches NOTHING that feeds snapshots or labels until an admin verifies it;
 * verification materialises it into the existing evidence / outcome-event /
 * applicability / career / coverage tables with the provenance the reviewer
 * assigns (ADMIN_ENTERED, or VERIFIED_DOCUMENT when the document was
 * checked). Saving evidence never builds an ML snapshot — snapshot
 * generation stays a separate, explicit step. All of it is internal: nothing
 * here is returned by a public startup endpoint. */
@Injectable()
export class HistoricalSubmissionService {
  constructor(
    @InjectRepository(HistoricalSubmission) private readonly repo: Repository<HistoricalSubmission>,
    @InjectRepository(Startup) private readonly startups: Repository<Startup>,
    @InjectRepository(StartupOutcomeEvent) private readonly events: Repository<StartupOutcomeEvent>,
    @InjectRepository(FundingRound) private readonly profileRounds: Repository<FundingRound>,
    @InjectRepository(DocumentRef) private readonly documents: Repository<DocumentRef>,
    @InjectRepository(StartupFounderCareer) private readonly careers: Repository<StartupFounderCareer>,
    @InjectRepository(HistoricalEvidence) private readonly evidenceRows: Repository<HistoricalEvidence>,
    private readonly evidence: HistoricalEvidenceService,
    private readonly applicability: FeatureApplicabilityService,
    private readonly coverage: OutcomeCoverageService,
  ) {}

  // ---------------------------------------------------------------- vocab for the form

  /** Everything the form needs to offer — the pathway ladder is the company's own, so a milestone can only ever be an existing ladder value. */
  async options(startupId: string) {
    const startup = await this.requireStartup(startupId);
    return {
      kinds: Object.values(HistoricalSubmissionKind),
      revenueTypes: REVENUE_TYPES,
      customerMetricTypes: CUSTOMER_METRIC_TYPES,
      currencies: CURRENCIES,
      supportingDocumentTypes: SUPPORTING_DOCUMENT_TYPES,
      regulatoryAnswers: REGULATORY_ANSWERS,
      regulatoryLadder: LADDERS[pathwayFor(startup.category)],
      attestableFamilies: FOUNDER_ATTESTABLE_FAMILIES,
    };
  }

  // ---------------------------------------------------------------- submitting

  async submit(startupId: string, actor: AuthUser, input: SubmitEntryInput): Promise<HistoricalSubmission> {
    const startup = await this.requireStartup(startupId);
    const admin = isAdmin(actor);
    const { effectiveDate, payload } = validateEntry(input.kind, input.entry, { startupCategory: startup.category, today: todayIso(), actor: admin ? "ADMIN" : "FOUNDER" });
    await this.checkDocument(startupId, input.supportingDocumentId, input.supportingDocumentType);
    if (input.kind === HistoricalSubmissionKind.FUNDING_ROUND) {
      const exact = (await this.fundingDuplicates(startupId, effectiveDate, payload.sarAmount as number | undefined)).filter((d) => d.match === "EXACT");
      if (exact.length) throw new ConflictException("This funding round is already on file (same date and amount). Please do not add it twice.");
    }
    const saved = await this.repo.save(this.repo.create({
      startupId, kind: input.kind, payload, effectiveDate,
      // A founder's entry is ALWAYS FOUNDER_SUBMITTED, whatever the request body claims; only an admin actor produces ADMIN_ENTERED.
      source: admin ? ScoreDataSource.ADMIN_ENTERED : ScoreDataSource.FOUNDER_SUBMITTED,
      reviewStatus: HistoricalReviewStatus.PENDING_REVIEW,
      submittedBy: actor.userId,
      supportingDocumentId: input.supportingDocumentId, supportingDocumentType: input.supportingDocumentType,
      founderNote: input.founderNote?.trim().slice(0, 2000) || undefined,
    }));
    if (admin) return (await this.review(saved.id, actor, "VERIFY", { notes: "Entered directly by an admin." })).submission;
    return saved;
  }

  /** The owner revises an entry an admin sent back (or one still pending). */
  async resubmit(startupId: string, id: string, actor: AuthUser, input: Pick<SubmitEntryInput, "entry" | "supportingDocumentId" | "supportingDocumentType" | "founderNote">): Promise<HistoricalSubmission> {
    const row = await this.requireOwned(startupId, id);
    if (row.reviewStatus !== HistoricalReviewStatus.CHANGES_REQUESTED && row.reviewStatus !== HistoricalReviewStatus.PENDING_REVIEW) throw new BadRequestException(`A ${row.reviewStatus} entry can no longer be edited.`);
    if (row.source !== ScoreDataSource.FOUNDER_SUBMITTED && !isAdmin(actor)) throw new ForbiddenException("This entry was not submitted by a founder.");
    const startup = await this.requireStartup(startupId);
    const { effectiveDate, payload } = validateEntry(row.kind, input.entry, { startupCategory: startup.category, today: todayIso(), actor: isAdmin(actor) ? "ADMIN" : "FOUNDER" });
    await this.checkDocument(startupId, input.supportingDocumentId, input.supportingDocumentType);
    row.payload = payload;
    row.effectiveDate = effectiveDate;
    row.supportingDocumentId = input.supportingDocumentId;
    row.supportingDocumentType = input.supportingDocumentType;
    row.founderNote = input.founderNote?.trim().slice(0, 2000) || undefined;
    row.reviewStatus = HistoricalReviewStatus.PENDING_REVIEW;
    return this.repo.save(row);
  }

  /** Withdraws an entry that has not been approved. Nothing downstream exists for it, so it is simply removed. */
  async withdraw(startupId: string, id: string): Promise<void> {
    const row = await this.requireOwned(startupId, id);
    if (row.reviewStatus === HistoricalReviewStatus.VERIFIED) throw new BadRequestException("An approved entry has already become evidence and cannot be withdrawn here; ask RUWĀD to correct it.");
    await this.repo.delete({ id: row.id });
  }

  listForStartup(startupId: string): Promise<HistoricalSubmission[]> {
    return this.repo.find({ where: { startupId }, order: { createdAt: "DESC" } });
  }

  // ---------------------------------------------------------------- admin review

  /** The review queue; PENDING_REVIEW by default. */
  async queue(status: HistoricalReviewStatus = HistoricalReviewStatus.PENDING_REVIEW) {
    const rows = await this.repo.find({ where: { reviewStatus: status }, order: { createdAt: "ASC" } });
    const names = new Map((await this.startups.find({ select: { id: true, name: true } })).map((s) => [s.id, s.name]));
    return rows.map((r) => ({ ...r, startupName: names.get(r.startupId) ?? null }));
  }

  /** Everything a reviewer needs: the entry, who/what/when, provenance, the supporting document, what approving would write, and any conflicts or duplicates. */
  async detail(id: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Unknown submission ${id}`);
    const startup = await this.requireStartup(row.startupId);
    const planned = plannedWrites(row.kind, row.effectiveDate, row.payload);
    const document = row.supportingDocumentId ? await this.documents.findOne({ where: { id: row.supportingDocumentId } }) : null;
    const conflicts: unknown[] = [];
    for (const ev of planned.evidence) {
      const existing = await this.evidenceRows.find({ where: { startupId: row.startupId, fieldKey: ev.fieldKey } });
      for (const e of existing) {
        if (e.status === EvidenceStatus.REJECTED || e.status === EvidenceStatus.SUPERSEDED) continue;
        const sameDate = e.effectiveDate === ev.effectiveDate;
        const differs = (e.valueNumeric ?? null) !== (ev.valueNumeric ?? null) || (e.valueText ?? null) !== (ev.valueText ?? null);
        if (sameDate && differs) conflicts.push({ fieldKey: ev.fieldKey, effectiveDate: e.effectiveDate, existingValue: e.valueNumeric ?? e.valueText, newValue: ev.valueNumeric ?? ev.valueText, existingSource: e.sourceType, existingVerified: e.verified, evidenceId: e.id });
      }
    }
    const duplicates = row.kind === HistoricalSubmissionKind.FUNDING_ROUND ? await this.fundingDuplicates(row.startupId, row.effectiveDate, row.payload.sarAmount as number | undefined) : [];
    return {
      submission: row,
      startup: { id: startup.id, name: startup.name, category: startup.category, founded: startup.founded, foundedBasis: startup.foundedBasis },
      provenance: { submittedSource: row.source, wouldBecome: row.supportingDocumentId ? "VERIFIED_DOCUMENT if the document is validated, otherwise ADMIN_ENTERED" : "ADMIN_ENTERED" },
      supportingDocument: document ? { id: document.id, name: document.name, onFile: document.onFile, type: row.supportingDocumentType } : null,
      plannedWrites: planned,
      conflicts,
      duplicates,
    };
  }

  async review(id: string, admin: AuthUser, action: ReviewAction, opts: ReviewOptions = {}): Promise<{ submission: HistoricalSubmission; conflictsCreated: number }> {
    if (!isAdmin(admin)) throw new ForbiddenException("Only an admin can review historical entries.");
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Unknown submission ${id}`);
    const next = action === "VERIFY" ? HistoricalReviewStatus.VERIFIED : action === "REJECT" ? HistoricalReviewStatus.REJECTED : HistoricalReviewStatus.CHANGES_REQUESTED;
    if (!VALID_TRANSITIONS[row.reviewStatus].includes(next)) throw new BadRequestException(`A ${row.reviewStatus} entry cannot move to ${next}.`);
    const notes = opts.notes?.trim();
    if ((action === "REJECT" || action === "REQUEST_CORRECTION") && !notes) throw new BadRequestException("Please say why, so the founder knows what to fix.");

    let conflictsCreated = 0;
    if (action === "VERIFY") {
      if (opts.documentValidated && !row.supportingDocumentId) throw new BadRequestException("documentValidated needs a supporting document on the entry.");
      conflictsCreated = await this.materialize(row, admin, opts);
    }
    row.reviewStatus = next;
    row.reviewedBy = admin.userId;
    row.reviewedAt = new Date();
    row.reviewNotes = notes || row.reviewNotes;
    return { submission: await this.repo.save(row), conflictsCreated };
  }

  // ---------------------------------------------------------------- materialisation

  /** Writes the approved entry into the existing tables. Evidence conflicts are preserved (HistoricalEvidenceService marks both sides CONFLICT), never overwritten. Returns how many conflicts the new rows created. */
  private async materialize(row: HistoricalSubmission, admin: AuthUser, opts: ReviewOptions): Promise<number> {
    const planned = plannedWrites(row.kind, row.effectiveDate, row.payload);
    const validated = !!opts.documentValidated;
    const scoreSource = validated ? ScoreDataSource.VERIFIED_DOCUMENT : ScoreDataSource.ADMIN_ENTERED;
    const written: Record<string, string[]> = {};
    let conflicts = 0;
    const push = (k: string, id: string) => { (written[k] ||= []).push(id); };

    if (row.kind === HistoricalSubmissionKind.FUNDING_ROUND) {
      const dups = (await this.fundingDuplicates(row.startupId, row.effectiveDate, row.payload.sarAmount as number | undefined));
      if (dups.some((d) => d.match === "EXACT")) throw new ConflictException("This funding round is already on file (same date and amount).");
      if (dups.length && !opts.confirmNotDuplicate) throw new BadRequestException(`This looks like a round already on file (${dups.map((d) => `${d.source} ${d.date}`).join(", ")}). Confirm it is a different round (confirmNotDuplicate) or reject it.`);
    }

    for (const ev of planned.evidence) {
      const saved = await this.evidence.record({
        startupId: row.startupId, fieldKey: ev.fieldKey, valueNumeric: ev.valueNumeric, valueText: ev.valueText, currency: ev.currency, effectiveDate: ev.effectiveDate,
        publishedAt: row.createdAt.toISOString().slice(0, 10),
        sourceType: validated ? HistoricalEvidenceSourceType.VERIFIED_DOCUMENT : HistoricalEvidenceSourceType.ADMIN_ENTERED,
        sourceName: row.source === ScoreDataSource.FOUNDER_SUBMITTED ? "Founder submission (admin-reviewed)" : "Admin entry",
        verified: true,
        verificationNotes: [ev.note, `Submission ${row.id}; reviewed by admin ${admin.userId}.`, opts.notes].filter(Boolean).join(" "),
        reliability: validated ? SourceReliability.PRIMARY : SourceReliability.HIGH,
        cohortSource: "HISTORICAL_SUBMISSION", createdBy: row.submittedBy,
        sourceDocumentId: row.supportingDocumentId,
      });
      push("evidence", saved.id);
      if (saved.status === EvidenceStatus.CONFLICT) conflicts++;
    }
    if (planned.event) {
      const e = planned.event;
      const saved = await this.events.save(this.events.create({
        startupId: row.startupId, eventType: e.eventType, eventDate: e.eventDate, valueNumeric: e.valueNumeric, valueText: e.valueText,
        source: validated ? OutcomeEventSource.VERIFIED_DOCUMENT : OutcomeEventSource.ADMIN_ENTERED, verified: true,
        sourceDocumentId: row.supportingDocumentId, notes: [e.notes, `Submission ${row.id}.`].filter(Boolean).join(" "), createdByUserId: admin.userId,
        publishedAt: row.createdAt.toISOString().slice(0, 10),
      }));
      push("event", saved.id);
    }
    if (planned.applicability) {
      const a = planned.applicability;
      const saved = await this.applicability.declare({
        startupId: row.startupId, featureKey: a.featureKey, status: a.status, effectiveDate: a.effectiveDate, reason: a.reason,
        source: scoreSource, verified: true, sourceDocumentId: row.supportingDocumentId, createdBy: admin.userId, submissionId: row.id,
      });
      push("applicability", saved.id);
    }
    if (planned.career) {
      const c = planned.career;
      const saved = await this.careers.save(this.careers.create({ startupId: row.startupId, ...c, source: scoreSource, verified: true, sourceDocumentId: row.supportingDocumentId, createdBy: row.submittedBy, submissionId: row.id }));
      push("career", saved.id);
    }
    if (planned.coverage) {
      const c = planned.coverage;
      const saved = await this.coverage.attest({
        startupId: row.startupId, coverageType: c.coverageType, coverageThrough: c.coverageThrough, sourceSummary: c.sourceSummary,
        method: row.source === ScoreDataSource.FOUNDER_SUBMITTED ? OutcomeCoverageMethod.FOUNDER_ATTESTED : OutcomeCoverageMethod.ADMIN_RESEARCH,
        confidence: validated ? SourceReliability.PRIMARY : SourceReliability.HIGH, verifiedBy: admin.userId, createdBy: row.submittedBy, submissionId: row.id, notes: opts.notes,
      });
      push("coverage", saved.id);
    }
    row.materialized = written;
    return conflicts;
  }

  // ---------------------------------------------------------------- helpers

  private async fundingDuplicates(startupId: string, date: string, sarAmount?: number): Promise<FundingDuplicateCandidate[]> {
    const [events, profile] = await Promise.all([
      this.events.find({ where: { startupId, eventType: StartupOutcomeEventType.FUNDING_ROUND } }),
      this.profileRounds.find({ where: { startupId } }),
    ]);
    return findFundingDuplicates({ date, sarAmount }, events.map((e) => ({ id: e.id, eventDate: e.eventDate, valueNumeric: e.valueNumeric, valueText: e.valueText })), profile.map((p) => ({ id: p.id, date: p.date, amount: Number(p.amount), round: p.round })));
  }

  private async requireStartup(id: string): Promise<Startup> {
    const s = await this.startups.findOne({ where: { id } });
    if (!s) throw new NotFoundException(`Unknown startup ${id}`);
    return s;
  }

  /** Loads a submission and proves it belongs to the startup in the URL, so a founder of one company can never touch another's entries by guessing an id. */
  private async requireOwned(startupId: string, id: string): Promise<HistoricalSubmission> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row || row.startupId !== startupId) throw new NotFoundException(`Unknown entry ${id}`);
    return row;
  }

  private async checkDocument(startupId: string, documentId?: string, documentType?: string): Promise<void> {
    if (documentType && !(SUPPORTING_DOCUMENT_TYPES as readonly string[]).includes(documentType)) throw new BadRequestException(`supportingDocumentType must be one of ${SUPPORTING_DOCUMENT_TYPES.join(", ")}.`);
    if (!documentId) return;
    const doc = await this.documents.findOne({ where: { id: documentId } });
    if (!doc || doc.entityType !== EntityKind.STARTUP || doc.entityId !== startupId) throw new BadRequestException("The supporting document must be one of this company's own Data Room documents.");
  }
}
