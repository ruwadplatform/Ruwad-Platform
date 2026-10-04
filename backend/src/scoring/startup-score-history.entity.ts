import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { ScoreStatus, ScoreTrigger } from "../common/enums";
import type { FactorKey, FactorResult } from "./scoring.types";

/** Append-only audit trail for one startup's RUWĀD Score — never updated or
 * deleted, mirroring submission_review_events. The latest row per
 * startupId IS the current score (also cached on startups.ruwadScore etc.
 * for fast reads); every row before that is history, so "why did this
 * change on this date" is always answerable. */
@Entity("startup_score_history")
export class StartupScoreHistory extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  startupId!: string;

  @Column({ type: "enum", enum: ScoreStatus })
  status!: ScoreStatus;

  @Column({ type: "numeric", precision: 4, scale: 2, nullable: true })
  ruwadScore?: number;

  @Column({ type: "numeric", precision: 3, scale: 2, nullable: true })
  confidenceScore?: number;

  @Column()
  version!: string;

  @Column({ type: "jsonb" })
  factors!: Record<FactorKey, FactorResult>;

  @Column("text", { array: true, default: [] })
  missingFactors!: FactorKey[];

  @Column({ type: "enum", enum: ScoreTrigger })
  triggeredBy!: ScoreTrigger;

  @Column({ type: "timestamptz" })
  calculatedAt!: Date;
}
