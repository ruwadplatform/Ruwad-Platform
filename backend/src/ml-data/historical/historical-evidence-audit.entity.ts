import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../../common/base.entity";

/** Append-only record of every conflict resolution / status change made to
 * a historical_evidence row — same who/when/previousValue/newValue/reason
 * shape as startup_scoring_feature_audit, so an evidence preference is
 * never silent. */
@Entity("startup_historical_evidence_audit")
export class HistoricalEvidenceAudit extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  evidenceId!: string;

  @Column({ type: "jsonb", nullable: true })
  previousValue?: unknown;

  @Column({ type: "jsonb", nullable: true })
  newValue?: unknown;

  @Column({ type: "uuid" })
  adminUserId!: string;

  @Column({ type: "text" })
  reason!: string;
}
