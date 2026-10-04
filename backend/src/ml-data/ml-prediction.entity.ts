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

  /** Null for a current-state EXPERIMENTAL prediction (no historical snapshot exists for "now"; the vector it was made from is stored in `inputFeatures`). */
  @Index()
  @Column({ type: "uuid", nullable: true })
  snapshotId?: string;

  @Column()
  targetName!: string;

  @Column()
  targetVersion!: string;

  @Index()
  @Column()
  modelVersion!: string;

  /** Null only on an `outcome: INSUFFICIENT_DATA` marker row: the model declined to answer and no substitute number exists. */
  @Column({ type: "numeric", precision: 10, scale: 6, nullable: true, transformer: numericTransformer })
  prediction!: number | null;

  /** PREDICTED (a real model output) or INSUFFICIENT_DATA (marker: not enough structured data). Shadow rows are always PREDICTED. */
  @Column({ type: "varchar", default: "PREDICTED" })
  outcome!: "PREDICTED" | "INSUFFICIENT_DATA";

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

  // ---- live EXPERIMENTAL inference audit fields (null for shadow predictions) ----
  @Column({ type: "varchar", nullable: true })
  featureSchemaVersion?: string;

  /** Share of the model's own features that were populated, 0..1. */
  @Column({ type: "numeric", precision: 4, scale: 3, nullable: true, transformer: numericTransformer })
  featureCompleteness?: number;

  /** VERY_LOW | LOW — never higher while the model is experimental. */
  @Column({ type: "varchar", nullable: true })
  reliability?: string;

  /** The allow-listed feature vector actually sent (no names, contacts, documents or scores). */
  @Column({ type: "jsonb", nullable: true })
  inputFeatures?: Record<string, number | boolean>;

  /** sha256 of (startup, model, schema, vector): a repeat page-load or recalculation with the same input never creates a duplicate. */
  @Index()
  @Column({ type: "varchar", nullable: true })
  inputHash?: string;
}
