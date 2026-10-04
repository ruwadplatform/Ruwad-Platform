import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { FeatureApplicabilityStatus, ScoreDataSource } from "../common/enums";

/** An explicit, reasoned statement about whether ONE feature applies to ONE
 * startup from a date onward (e.g. "regulatoryMilestone does not apply: a
 * marketplace with no regulated product"). Append-only history: a later
 * declaration for the same feature supersedes an earlier one by
 * effectiveDate; nothing is overwritten. NOT_APPLICABLE is never inferred
 * from a missing value — it exists only because a row says so, with a
 * reason. Provenance reuses ScoreDataSource and its SOURCE_RANK precedence
 * (scoring/scoring.constants.ts) — no parallel hierarchy. A founder's own
 * declaration reaches this table only after an admin approves it (see
 * HistoricalSubmissionService); it is then stored as ADMIN_ENTERED (or
 * VERIFIED_DOCUMENT when a supporting document was validated). */
@Entity("startup_feature_applicability")
export class StartupFeatureApplicability extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  startupId!: string;

  /** A key in ML_FEATURES_V1. */
  @Column()
  featureKey!: string;

  @Column({ type: "enum", enum: FeatureApplicabilityStatus })
  status!: FeatureApplicabilityStatus;

  /** The date from which this statement held. */
  @Column({ type: "date" })
  effectiveDate!: string;

  @Column({ type: "enum", enum: ScoreDataSource })
  source!: ScoreDataSource;

  @Column({ type: "uuid", nullable: true })
  sourceDocumentId?: string;

  /** Required for NOT_APPLICABLE (enforced in the service). */
  @Column({ type: "text", nullable: true })
  reason?: string;

  /** Entered is not the same as verified (same rule as every evidence row). */
  @Column({ default: false })
  verified!: boolean;

  @Column({ type: "uuid", nullable: true })
  createdBy?: string;

  /** The founder submission this row was approved from, if any. */
  @Index()
  @Column({ type: "uuid", nullable: true })
  submissionId?: string;

  /** Set when an admin later withdraws the declaration; revoked rows are
   * ignored by coverage but never deleted. */
  @Column({ type: "timestamptz", nullable: true })
  revokedAt?: Date;

  @Column({ type: "text", nullable: true })
  revokedReason?: string;
}
