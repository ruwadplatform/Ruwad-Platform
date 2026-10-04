import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { HistoricalImportBatch } from "./historical-import-batch.entity";
import { HistoricalImportRow } from "./historical-import-row.entity";
import { StartupOutcomeEvent } from "../outcome-event.entity";
import { StartupIdentityMatchingService, type IdentityCandidateInput } from "./startup-identity-matching.service";
import { HistoricalEvidenceService } from "./historical-evidence.service";
import { defaultReliability, parseHistoricalCsv, toOutcomeEventSource, type ParsedRow } from "./historical-csv.parser";
import { HistoricalEvidenceSourceType, HistoricalRecordType, IdentityMatchStatus, ImportBatchStatus } from "../../common/enums";

export interface ImportInput {
  csvText: string;
  sourceName: string;
  sourceType: HistoricalEvidenceSourceType;
  fileName: string;
  importedBy: string;
  dryRun: boolean;
}

interface RowOutcome { rowNumber: number; startupName: string; matchStatus: IdentityMatchStatus; matchConfidence?: number }

/** Orchestrates one CSV upload end to end. A dry run (dryRun: true) parses,
 * validates, and matches identities READ-ONLY — it writes exactly one row,
 * the batch itself (status DRY_RUN_COMPLETE), and nothing else (see the
 * task's own Phase 6 instruction: "do not write anything during dry
 * run"). A commit does the same work for real: writes/updates
 * startup_external_identities, stages every row in historical_import_rows,
 * and for every row whose identity resolves, writes the real
 * startup_historical_evidence or startup_outcome_events row. */
@Injectable()
export class HistoricalImportBatchService {
  constructor(
    @InjectRepository(HistoricalImportBatch) private readonly batches: Repository<HistoricalImportBatch>,
    @InjectRepository(HistoricalImportRow) private readonly rows: Repository<HistoricalImportRow>,
    @InjectRepository(StartupOutcomeEvent) private readonly events: Repository<StartupOutcomeEvent>,
    private readonly matching: StartupIdentityMatchingService,
    private readonly evidenceSvc: HistoricalEvidenceService,
  ) {}

  list(): Promise<HistoricalImportBatch[]> {
    return this.batches.find({ order: { importedAt: "DESC" } });
  }

  async get(id: string): Promise<HistoricalImportBatch> {
    const batch = await this.batches.findOne({ where: { id } });
    if (!batch) throw new NotFoundException(`Unknown import batch ${id}`);
    return batch;
  }

  async process(input: ImportInput): Promise<HistoricalImportBatch> {
    const now = new Date();
    const { rows: parsed, errors } = parseHistoricalCsv(input.csvText, now);

    const batch = await this.batches.save(this.batches.create({
      sourceName: input.sourceName, sourceType: input.sourceType, fileName: input.fileName, importedAt: now, importedBy: input.importedBy,
      dryRun: input.dryRun, rawCsv: input.csvText, rowsTotal: parsed.length + errors.length,
      status: input.dryRun ? ImportBatchStatus.VALIDATING : ImportBatchStatus.IMPORTING,
    }));

    const unmatched: RowOutcome[] = [];
    const accepted: RowOutcome[] = [];
    let acceptedCount = 0;
    let needsReviewCount = 0;

    for (const row of parsed) {
      const identityInput: IdentityCandidateInput = {
        startupName: row.startupName,
        startupDomain: row.startupDomain,
        country: row.recordType === HistoricalRecordType.IDENTITY ? row.country : undefined,
        externalId: row.externalId,
        sourceName: row.recordType === HistoricalRecordType.IDENTITY ? row.sourceName : (row.sourceName ?? input.sourceName),
      };

      const match = input.dryRun ? await this.matching.matchCandidate(identityInput) : (await this.matching.resolveAndPersist(identityInput));
      const matchStatus = match.matchStatus;
      const startupId = match.startupId;

      if (matchStatus !== IdentityMatchStatus.MATCHED) {
        needsReviewCount++;
        unmatched.push({ rowNumber: row.rowNumber, startupName: row.startupName, matchStatus, matchConfidence: match.matchConfidence });
        if (!input.dryRun) {
          await this.rows.save(this.rows.create({ importBatchId: batch.id, rowNumber: row.rowNumber, recordType: row.recordType, rawRow: row as unknown as Record<string, string>, status: "PENDING" }));
        }
        continue;
      }

      acceptedCount++;
      accepted.push({ rowNumber: row.rowNumber, startupName: row.startupName, matchStatus });
      if (input.dryRun || row.recordType === HistoricalRecordType.IDENTITY) continue;

      await this.commitRow(row, startupId!, batch.id, input.importedBy);
    }

    batch.rowsAccepted = acceptedCount;
    batch.rowsRejected = errors.length;
    batch.rowsNeedsReview = needsReviewCount;
    batch.summaryJson = { invalidRows: errors, unmatched, accepted: accepted.slice(0, 500) };
    batch.status = input.dryRun
      ? ImportBatchStatus.DRY_RUN_COMPLETE
      : (errors.length && !acceptedCount ? ImportBatchStatus.FAILED : needsReviewCount ? ImportBatchStatus.PARTIAL : ImportBatchStatus.COMPLETED);
    return this.batches.save(batch);
  }

  /** Re-attempts every still-PENDING row of a batch — call this after a
   * match-review action (confirm/create-new) has given the row's startup
   * identity a real startupId. Never re-parses the original file; the
   * already-validated ParsedRow is stored verbatim in rawRow. */
  async retryPendingRows(batchId: string, adminUserId: string): Promise<{ committed: number; stillPending: number }> {
    const batch = await this.get(batchId);
    const pending = await this.rows.find({ where: { importBatchId: batchId, status: "PENDING" } });
    let committed = 0;
    for (const stagedRow of pending) {
      const row = stagedRow.rawRow as unknown as ParsedRow;
      const identityInput: IdentityCandidateInput = {
        startupName: row.startupName,
        startupDomain: row.startupDomain,
        country: row.recordType === HistoricalRecordType.IDENTITY ? row.country : undefined,
        externalId: row.externalId,
        sourceName: row.recordType === HistoricalRecordType.IDENTITY ? row.sourceName : (row.sourceName ?? batch.sourceName),
      };
      const match = await this.matching.matchCandidate(identityInput);
      if (match.matchStatus !== IdentityMatchStatus.MATCHED || !match.startupId) continue;

      if (row.recordType !== HistoricalRecordType.IDENTITY) await this.commitRow(row, match.startupId, batchId, adminUserId);
      stagedRow.status = "COMMITTED";
      await this.rows.save(stagedRow);
      committed++;
    }
    const stillPending = pending.length - committed;
    if (!stillPending) batch.status = ImportBatchStatus.COMPLETED;
    batch.rowsNeedsReview = Math.max(0, batch.rowsNeedsReview - committed);
    batch.rowsAccepted += committed;
    await this.batches.save(batch);
    return { committed, stillPending };
  }

  private async commitRow(row: ParsedRow, startupId: string, importBatchId: string, importedBy: string): Promise<void> {
    if (row.recordType === HistoricalRecordType.FEATURE) {
      await this.evidenceSvc.record({
        startupId, importBatchId, fieldKey: row.fieldKey, valueNumeric: row.valueNumeric, valueText: row.valueText, valueBoolean: row.valueBoolean,
        currency: row.currency, effectiveDate: row.effectiveDate, publishedAt: row.publishedAt, sourceType: row.sourceType, sourceName: row.sourceName,
        sourceUrl: row.sourceUrl, verified: row.verified, verificationNotes: row.verificationNotes, reliability: defaultReliability(row.sourceType),
        cohortSource: row.cohortSource, createdBy: importedBy,
      });
      return;
    }
    if (row.recordType === HistoricalRecordType.OUTCOME_EVENT) {
      // Dedup: same startup + event type + date + numeric value already
      // recorded from ANY source — never double-count a round already in RUWĀD.
      const dup = await this.events.findOne({ where: { startupId, eventType: row.eventType, eventDate: row.eventDate, valueNumeric: row.valueNumeric === undefined ? IsNull() : row.valueNumeric } });
      if (dup) return;
      await this.events.save(this.events.create({
        startupId, eventType: row.eventType, eventDate: row.eventDate, valueNumeric: row.valueNumeric, valueText: row.valueText,
        source: toOutcomeEventSource(row.sourceType), verified: row.verified, sourceUrl: row.sourceUrl, notes: row.verificationNotes,
        createdByUserId: importedBy, importBatchId, publishedAt: row.publishedAt,
      }));
    }
  }
}

/** Thrown by the controller layer when a non-CSV file is uploaded — kept
 * here so the parser/service layer and the multer fileFilter share the
 * same error message. */
export class InvalidCsvFileError extends BadRequestException {
  constructor() { super("Only .csv files are accepted for historical data import."); }
}
