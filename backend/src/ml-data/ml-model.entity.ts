import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { MlModelStatus } from "../common/enums";

/** The model registry NestJS's admin UI reads — the single source of truth
 * for a model's STATUS (promoted/rejected/retired only through
 * MlModelRegistryService's transition guard, never written freely). The
 * actual trained model binary lives on the Python service's own
 * filesystem (`ml/artifacts/<modelVersion>/`); this row is metadata only,
 * reported back by the training CLI after a run completes. */
@Entity("ml_models")
export class MlModel extends BaseEntity {
  @Index({ unique: true })
  @Column()
  modelVersion!: string;

  @Index()
  @Column()
  targetName!: string;

  @Column()
  targetVersion!: string;

  @Column()
  featureSchemaVersion!: string;

  @Column()
  algorithm!: string;

  @Column({ type: "jsonb", default: {} })
  hyperparameters!: Record<string, unknown>;

  @Column({ type: "int" })
  trainingRows!: number;

  @Column({ type: "int" })
  validationRows!: number;

  @Column({ type: "int" })
  testRows!: number;

  @Column({ type: "timestamptz", nullable: true })
  trainingPeriodStart?: Date;

  @Column({ type: "timestamptz", nullable: true })
  trainingPeriodEnd?: Date;

  @Column({ type: "jsonb", default: {} })
  metrics!: Record<string, unknown>;

  @Column({ type: "enum", enum: MlModelStatus, default: MlModelStatus.CANDIDATE })
  status!: MlModelStatus;

  /** Relative path on the Python service's own artifact storage — never a
   * value NestJS reads bytes from directly. */
  @Column()
  artifactLocation!: string;

  /** True for a synthetic-fixture training run. Independent of `status`
   * (also `TEST_ONLY`) so a query can filter on either without assuming
   * they always agree, though in practice they're set together. */
  @Column({ default: false })
  isTestOnly!: boolean;

  @Column({ type: "timestamptz" })
  trainedAt!: Date;
}
