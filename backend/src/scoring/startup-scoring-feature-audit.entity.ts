import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";

/** Append-only record of every admin write to a startup's scoring features —
 * never updated or deleted, same audit-trail shape as
 * submission_review_events/startup_score_history. Required so an override
 * is never silent: who changed what, from what, to what, and why. */
@Entity("startup_scoring_feature_audit")
export class StartupScoringFeatureAudit extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  startupId!: string;

  @Column()
  featureKey!: string;

  @Column({ type: "jsonb", nullable: true })
  previousValue?: unknown;

  @Column({ type: "jsonb", nullable: true })
  newValue?: unknown;

  @Column({ type: "uuid" })
  adminUserId!: string;

  @Column({ type: "text" })
  reason!: string;
}
