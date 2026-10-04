import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { HistoricalEvidence } from "./historical-evidence.entity";
import { HistoricalEvidenceAudit } from "./historical-evidence-audit.entity";
import { EvidenceStatus } from "../../common/enums";

export interface RecordEvidenceInput {
  startupId: string;
  importBatchId?: string;
  fieldKey: string;
  valueNumeric?: number;
  valueText?: string;
  valueBoolean?: boolean;
  currency?: string;
  effectiveDate: string;
  publishedAt?: string;
  sourceType: HistoricalEvidence["sourceType"];
  sourceName?: string;
  sourceUrl?: string;
  sourceDocumentId?: string;
  verified: boolean;
  verificationNotes?: string;
  reliability: HistoricalEvidence["reliability"];
  cohortSource?: string;
  createdBy?: string;
}

function valuesEqual(a: HistoricalEvidence, b: RecordEvidenceInput): boolean {
  return a.valueNumeric === b.valueNumeric && a.valueText === b.valueText && a.valueBoolean === b.valueBoolean;
}

/** Owns conflict detection: two evidence rows for the same startup+field+
 * effectiveDate with different values are a genuine conflict (the same
 * point in time, reported two different ways) — NOT two rows for
 * different dates, which legitimately differ because time passed. Never
 * auto-picks a winner (see the task's own Phase 7 instruction: "do not
 * silently choose one") — record() only ever marks both CONFLICT; only
 * resolveConflict(), an explicit admin action, sets PREFERRED/SUPERSEDED,
 * and always writes an audit row. */
@Injectable()
export class HistoricalEvidenceService {
  constructor(
    @InjectRepository(HistoricalEvidence) private readonly repo: Repository<HistoricalEvidence>,
    @InjectRepository(HistoricalEvidenceAudit) private readonly audit: Repository<HistoricalEvidenceAudit>,
  ) {}

  async record(input: RecordEvidenceInput): Promise<HistoricalEvidence> {
    const saved = await this.repo.save(this.repo.create({ ...input, status: EvidenceStatus.NO_CONFLICT }));

    const siblings = await this.repo.find({ where: { startupId: input.startupId, fieldKey: input.fieldKey, effectiveDate: input.effectiveDate } });
    const conflicting = siblings.filter((s) => s.id !== saved.id && s.status !== EvidenceStatus.REJECTED && s.status !== EvidenceStatus.SUPERSEDED && !valuesEqual(s, input));
    if (!conflicting.length) return saved;

    saved.status = EvidenceStatus.CONFLICT;
    await this.repo.save(saved);
    for (const row of conflicting) {
      if (row.status !== EvidenceStatus.PREFERRED) { row.status = EvidenceStatus.CONFLICT; await this.repo.save(row); }
    }
    return saved;
  }

  listConflicts(): Promise<HistoricalEvidence[]> {
    return this.repo.find({ where: { status: EvidenceStatus.CONFLICT }, order: { startupId: "ASC", fieldKey: "ASC", effectiveDate: "ASC" } });
  }

  /** Marks `preferredId` PREFERRED and every other row conflicting with it
   * (same startup+field+effectiveDate) SUPERSEDED — never deletes either,
   * always logs who/why. */
  async resolveConflict(preferredId: string, adminUserId: string, reason: string): Promise<HistoricalEvidence> {
    const preferred = await this.repo.findOne({ where: { id: preferredId } });
    if (!preferred) throw new NotFoundException(`Unknown evidence row ${preferredId}`);
    if (preferred.status !== EvidenceStatus.CONFLICT) throw new BadRequestException(`Evidence row ${preferredId} is not in CONFLICT`);

    const siblings = await this.repo.find({ where: { startupId: preferred.startupId, fieldKey: preferred.fieldKey, effectiveDate: preferred.effectiveDate } });
    for (const row of siblings) {
      const previousValue = { status: row.status };
      if (row.id === preferred.id) row.status = EvidenceStatus.PREFERRED;
      else if (row.status === EvidenceStatus.CONFLICT) row.status = EvidenceStatus.SUPERSEDED;
      else continue;
      await this.repo.save(row);
      await this.audit.save(this.audit.create({ evidenceId: row.id, previousValue, newValue: { status: row.status }, adminUserId, reason }));
    }
    return preferred;
  }

  /** Explicitly leaves a conflict unresolved — no status change, just an
   * audit trail entry so "an admin looked at this and chose to wait" is
   * distinguishable from "nobody has reviewed this yet." */
  async leaveUnresolved(evidenceId: string, adminUserId: string, reason: string): Promise<void> {
    const row = await this.repo.findOne({ where: { id: evidenceId } });
    if (!row) throw new NotFoundException(`Unknown evidence row ${evidenceId}`);
    await this.audit.save(this.audit.create({ evidenceId, previousValue: { status: row.status }, newValue: { status: row.status }, adminUserId, reason }));
  }
}
