import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { HistoricalReviewStatus, HistoricalSubmissionKind, ScoreDataSource } from "../common/enums";

/** A founder's (or admin's) historical-data entry, held HERE until reviewed.
 * It deliberately lives in its own table: an unreviewed founder claim never
 * touches the evidence, outcome-event, applicability, career or coverage
 * tables that feed snapshots and labels, so it cannot leak into training by
 * a missed filter. Approval materialises it into those tables with the
 * provenance the reviewer assigns (see HistoricalSubmissionService).
 * Internal/private by default: never exposed by public startup endpoints. */
@Entity("startup_historical_submissions")
export class HistoricalSubmission extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  startupId!: string;

  @Column({ type: "enum", enum: HistoricalSubmissionKind })
  kind!: HistoricalSubmissionKind;

  /** The entry exactly as submitted (validated per kind). */
  @Column({ type: "jsonb" })
  payload!: Record<string, unknown>;

  /** The date the fact was true — the leakage anchor. */
  @Column({ type: "date" })
  effectiveDate!: string;

  /** Provenance of the submission itself: FOUNDER_SUBMITTED, or
   * ADMIN_ENTERED for an admin entering data directly. */
  @Column({ type: "enum", enum: ScoreDataSource })
  source!: ScoreDataSource;

  @Index()
  @Column({ type: "enum", enum: HistoricalReviewStatus, default: HistoricalReviewStatus.PENDING_REVIEW })
  reviewStatus!: HistoricalReviewStatus;

  @Column({ type: "uuid" })
  submittedBy!: string;

  /** Optional supporting document (an entity_documents row) and its kind. */
  @Column({ type: "uuid", nullable: true })
  supportingDocumentId?: string;

  @Column({ type: "varchar", nullable: true })
  supportingDocumentType?: string;

  @Column({ type: "text", nullable: true })
  founderNote?: string;

  @Column({ type: "uuid", nullable: true })
  reviewedBy?: string;

  @Column({ type: "timestamptz", nullable: true })
  reviewedAt?: Date;

  @Column({ type: "text", nullable: true })
  reviewNotes?: string;

  /** Ids of the rows written on approval, e.g. {evidence:[..], event:[..]}. */
  @Column({ type: "jsonb", nullable: true })
  materialized?: Record<string, string[]>;
}
