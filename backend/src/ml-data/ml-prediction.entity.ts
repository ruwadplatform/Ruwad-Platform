import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { MlModelStatus, MlPredictionType } from "../common/enums";
import { numericTransformer } from "../common/numeric.transformer";

/** A single shadow prediction — internal-only, never surfaced on any public
 * route, never blended into `startups.ruwadScore`. Written by
 * MlShadowPredictionService right after a feature snapshot is created,
 * one row per (snapshot, model) pair. `actualOutcome`/`evaluatedAt` are
 * filled in later, once the target's observation window actually matures,
 * by re-running the same label calculator the export pipeline uses — see
 * MlShadowPredictionService.evaluateMaturedPredictions(). */
@Entity("ml_predictions")
export class MlPrediction extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  startupId!: string;

  @Index()
  @Column({ type: "uuid" })
  snapshotId!: string;

  @Column()
  targetName!: string;

  @Column()
  targetVersion!: string;

  @Index()
  @Column()
  modelVersion!: string;

  @Column({ type: "numeric", precision: 10, scale: 6, transformer: numericTransformer })
  prediction!: number;

  @Column({ type: "enum", enum: MlPredictionType })
  predictionType!: MlPredictionType;

  @Column({ type: "timestamptz" })
  predictedAt!: Date;

  /** The model's own status AT prediction time — audit only, never the
   * authority on whether this prediction should currently be shown
   * anywhere (that's always re-checked against the live ml_models row). */
  @Column({ type: "enum", enum: MlModelStatus })
  modelStatus!: MlModelStatus;

  @Column({ type: "numeric", precision: 14, scale: 4, nullable: true, transformer: numericTransformer })
  actualOutcome?: number;

  @Column({ type: "timestamptz", nullable: true })
  evaluatedAt?: Date;
}
