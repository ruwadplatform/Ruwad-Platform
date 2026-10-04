import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { MlTrainingRunStatus } from "../common/enums";

/** One row per training attempt — including a run the readiness gate
 * blocked before any model was fit. Append-only audit trail, same
 * shape/intent as startup_score_history: "why did/didn't a model get
 * produced on this date" is always answerable here. Written entirely by
 * the Python training CLI reporting back over HTTP (see
 * ml-training-run.service.ts) — never by NestJS itself. */
@Entity("ml_training_runs")
export class MlTrainingRun extends BaseEntity {
  @Index()
  @Column()
  targetName!: string;

  @Column()
  targetVersion!: string;

  @Column()
  featureSchemaVersion!: string;

  @Column()
  algorithm!: string;

  @Column({ type: "enum", enum: MlTrainingRunStatus })
  status!: MlTrainingRunStatus;

  @Column({ type: "timestamptz" })
  startedAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  completedAt?: Date;

  @Column({ type: "int", nullable: true })
  datasetRows?: number;

  @Column({ type: "jsonb", default: {} })
  metrics!: Record<string, unknown>;

  @Column({ type: "jsonb", default: {} })
  hyperparameters!: Record<string, unknown>;

  /** Set only once the run actually completes and produces a model. */
  @Column({ nullable: true })
  modelVersion?: string;

  @Column({ nullable: true })
  artifactLocation?: string;

  @Column({ type: "text", nullable: true })
  errorMessage?: string;

  /** Free text — the admin email that triggered the CLI, or "cli" for an
   * unattended run. Never a foreign key: this table is reported by an
   * external process, not written from within an authenticated request
   * where a real user id is always in hand. */
  @Column()
  createdBy!: string;

  @Column({ default: false })
  isTestOnly!: boolean;
}
