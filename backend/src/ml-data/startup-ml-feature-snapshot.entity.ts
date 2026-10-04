import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { MlSnapshotSource, SnapshotSelectionMethod, TrainingEligibility } from "../common/enums";
import { numericTransformer } from "../common/numeric.transformer";
import type { ScoringFeatures, FeatureProvenance } from "../scoring/scoring.types";

/** Append-only, immutable-once-written record of exactly what RUWĀD knew
 * about a startup at one point in time — the frozen "X" half of the
 * `startup state at X -> outcome after X` learning problem. Never updated
 * after creation: a later change to the startup's live scoring features
 * creates a NEW row (via MlSnapshotService), it never mutates this one.
 * This immutability is what makes the dataset exporter leakage-safe — it
 * only ever reads what was true as of `snapshotAt`, never the startup's
 * current state. */
@Entity("startup_ml_feature_snapshots")
export class StartupMlFeatureSnapshot extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  startupId!: string;

  @Column({ type: "timestamptz" })
  snapshotAt!: Date;

  /** SCORE_VERSION at the moment of this snapshot — lets a future reader
   * know which scoring methodology produced `dataConfidence`/`scoreStatus`. */
  @Column()
  scoreVersion!: string;

  /** Versions the SHAPE of `features` below (see ml-data.constants.ts's
   * ML_FEATURE_SCHEMA_VERSION) — distinct from ML_FEATURES_V1, the
   * export-time allowlist, which can evolve independently of this. */
  @Column()
  featureSchemaVersion!: string;

  /** Full ScoringFeatures object as it existed at snapshotAt — deliberately
   * the complete set, not pre-filtered to an export allowlist, so a future
   * allowlist change doesn't require new snapshots. Never contains
   * ruwadScore/factorScores — those were never part of ScoringFeatures. */
  @Column({ type: "jsonb" })
  features!: ScoringFeatures;

  @Column({ type: "jsonb" })
  provenanceSummary!: FeatureProvenance;

  @Column({ type: "numeric", precision: 3, scale: 2, nullable: true, transformer: numericTransformer })
  dataConfidence?: number;

  @Column()
  scoreStatus!: string;

  @Column()
  startupStage!: string;

  @Column()
  category!: string;

  @Column({ type: "enum", enum: MlSnapshotSource })
  snapshotSource!: MlSnapshotSource;

  /** Human-readable trigger note, e.g. "regulatoryMilestone changed" —
   * audit trail for "why is this row in the dataset" (see docs/
   * ml-data-methodology.md). */
  @Column({ nullable: true })
  reason?: string;

  /** Why snapshotAt was chosen (see SnapshotSelectionMethod). Metadata about
   * the row, not a historical value: it can be declared once on an existing
   * row without touching `features`, `snapshotAt` or any label input. */
  @Column({ type: "enum", enum: SnapshotSelectionMethod, nullable: true })
  selectionMethod?: SnapshotSelectionMethod;

  /** Whether this row may feed REAL production training (see
   * TrainingEligibility). Metadata like `selectionMethod`: changing it never
   * touches `features`, `snapshotAt` or any label input. Defaults to
   * ANALYSIS_ONLY — a snapshot must be declared eligible, never assumed. */
  @Column({ type: "enum", enum: TrainingEligibility, default: TrainingEligibility.ANALYSIS_ONLY })
  trainingEligibility!: TrainingEligibility;
}
