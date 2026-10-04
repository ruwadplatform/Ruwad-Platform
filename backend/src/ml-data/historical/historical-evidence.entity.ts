import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../../common/base.entity";
import { EvidenceStatus, HistoricalEvidenceSourceType, SourceReliability } from "../../common/enums";
import { numericTransformer } from "../../common/numeric.transformer";

/** One row per historical FACT about a startup — e.g. "annualRevenue was
 * 2,500,000 SAR as of 2023-01-01, per this company press release." This is
 * the raw material HistoricalSnapshotBuilder reconstructs feature vectors
 * from; it is never itself a feature vector or a snapshot. Both sides of a
 * conflict are always kept (see EvidenceStatus) — a value here is never
 * silently overwritten, only superseded/preferred via an explicit admin
 * action logged in historical_evidence_audit. */
@Entity("startup_historical_evidence")
export class HistoricalEvidence extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  startupId!: string;

  @Index()
  @Column({ type: "uuid", nullable: true })
  importBatchId?: string;

  /** Must be a key in ML_FEATURES_V1 (ml-data/ml-data.constants.ts) —
   * validated at write time, never trusted blindly from a CSV row. */
  @Column()
  fieldKey!: string;

  @Column({ type: "numeric", precision: 18, scale: 4, nullable: true, transformer: numericTransformer })
  valueNumeric?: number;

  @Column({ nullable: true })
  valueText?: string;

  @Column({ type: "boolean", nullable: true })
  valueBoolean?: boolean;

  @Column({ nullable: true })
  currency?: string;

  /** Optional, admin/researcher-supplied conversion — never computed
   * automatically from a live FX rate (see docs/ml-training-methodology.md's
   * sibling doc for why: a historical value converted at today's rate would
   * misrepresent what was actually true on effectiveDate). */
  @Column({ type: "numeric", precision: 18, scale: 4, nullable: true, transformer: numericTransformer })
  normalizedValue?: number;

  @Column({ nullable: true })
  normalizedCurrency?: string;

  @Column({ type: "date", nullable: true })
  fxDate?: string;

  @Column({ nullable: true })
  fxSource?: string;

  /** The date this fact was actually true — the historical anchor. Without
   * this, a value must never be used to reconstruct an earlier snapshot. */
  @Column({ type: "date" })
  effectiveDate!: string;

  /** When the source was published/recorded — distinct from effectiveDate:
   * a 2024-03-01 article can report 2023 revenue. Both are preserved. */
  @Column({ type: "date", nullable: true })
  publishedAt?: string;

  @Column({ type: "enum", enum: HistoricalEvidenceSourceType })
  sourceType!: HistoricalEvidenceSourceType;

  @Column({ nullable: true })
  sourceName?: string;

  @Column({ nullable: true })
  sourceUrl?: string;

  @Column({ type: "uuid", nullable: true })
  sourceDocumentId?: string;

  /** Entered is not the same as verified — a separate, explicit flag, same
   * rule as StartupOutcomeEvent.verified. */
  @Column({ default: false })
  verified!: boolean;

  @Column({ type: "text", nullable: true })
  verificationNotes?: string;

  @Column({ type: "enum", enum: SourceReliability })
  reliability!: SourceReliability;

  @Column({ type: "enum", enum: EvidenceStatus, default: EvidenceStatus.NO_CONFLICT })
  status!: EvidenceStatus;

  /** Tags which research cohort/source batch this fact came from (e.g.
   * "MAGNITT_HEALTHCARE") — lets a later analysis detect overrepresentation
   * of one company type/source, never used by the label engine itself. */
  @Column({ nullable: true })
  cohortSource?: string;

  @Column({ type: "timestamptz", default: () => "now()" })
  collectedAt!: Date;

  @Column({ type: "uuid", nullable: true })
  createdBy?: string;
}
