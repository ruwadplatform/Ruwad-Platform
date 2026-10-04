import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../../common/base.entity";
import { HistoricalRecordType } from "../../common/enums";

/** One parsed CSV row, staged. A row whose startup identity isn't resolved
 * yet stays PENDING here indefinitely — nothing is lost, nothing is
 * fabricated to force a match. Once StartupExternalIdentity.startupId is
 * set (auto-match or admin review), HistoricalImportBatchService.
 * retryPendingRows() commits it into a real evidence/event row and flips
 * this to COMMITTED. */
@Entity("historical_import_rows")
export class HistoricalImportRow extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  importBatchId!: string;

  @Column({ type: "int" })
  rowNumber!: number;

  @Column({ type: "enum", enum: HistoricalRecordType })
  recordType!: HistoricalRecordType;

  @Column({ type: "jsonb" })
  rawRow!: Record<string, string>;

  @Index()
  @Column({ type: "uuid", nullable: true })
  externalIdentityId?: string;

  @Column({ default: "PENDING" })
  status!: "PENDING" | "COMMITTED" | "REJECTED";

  @Column({ type: "text", nullable: true })
  errorMessage?: string;
}
