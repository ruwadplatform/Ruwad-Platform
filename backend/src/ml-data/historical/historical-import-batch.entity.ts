import { Column, Entity } from "typeorm";
import { BaseEntity } from "../../common/base.entity";
import { HistoricalEvidenceSourceType, ImportBatchStatus } from "../../common/enums";

/** One row per uploaded CSV file. A dry run (dryRun: true) only ever
 * writes THIS row — never any evidence/event/identity row — with a
 * summaryJson report of what a real commit would do. */
@Entity("historical_import_batches")
export class HistoricalImportBatch extends BaseEntity {
  @Column()
  sourceName!: string;

  @Column({ type: "enum", enum: HistoricalEvidenceSourceType })
  sourceType!: HistoricalEvidenceSourceType;

  @Column()
  fileName!: string;

  @Column({ type: "timestamptz" })
  importedAt!: Date;

  @Column({ type: "uuid" })
  importedBy!: string;

  @Column({ type: "enum", enum: ImportBatchStatus, default: ImportBatchStatus.UPLOADED })
  status!: ImportBatchStatus;

  @Column({ type: "int", default: 0 })
  rowsTotal!: number;

  @Column({ type: "int", default: 0 })
  rowsAccepted!: number;

  @Column({ type: "int", default: 0 })
  rowsRejected!: number;

  @Column({ type: "int", default: 0 })
  rowsNeedsReview!: number;

  @Column({ default: false })
  dryRun!: boolean;

  @Column({ type: "text", nullable: true })
  notes?: string;

  /** The uploaded file's raw text, kept so a dry-run batch can later be
   * committed for real without re-uploading, and so a partial commit can
   * retry its still-pending rows. */
  @Column({ type: "text" })
  rawCsv!: string;

  /** Structured dry-run/commit report: unmatched companies, probable
   * duplicates, conflicts, invalid rows, unsupported feature keys, invalid
   * dates/currencies, future-dated claims, weak-source conflicts. */
  @Column({ type: "jsonb", nullable: true })
  summaryJson?: unknown;
}
