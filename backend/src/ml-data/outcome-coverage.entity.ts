import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { OutcomeCoverageMethod, OutcomeCoverageType, SourceReliability } from "../common/enums";

/** "For this startup, sources about THIS outcome family were checked through
 * this date." It is NOT a statement that nothing happened — it only licenses
 * the label engine to read the absence of an event inside the covered period
 * as a real negative. One family never covers another: FUNDING coverage
 * cannot mature a regulatory or survival negative. Append-only; a withdrawn
 * attestation is revoked, not deleted. */
@Entity("startup_outcome_coverage")
export class StartupOutcomeCoverage extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  startupId!: string;

  @Column({ type: "enum", enum: OutcomeCoverageType })
  coverageType!: OutcomeCoverageType;

  /** Sources were checked through this date (inclusive). Never in the future. */
  @Column({ type: "date" })
  coverageThrough!: string;

  /** Which sources were checked and how (human-readable). */
  @Column({ type: "text" })
  sourceSummary!: string;

  @Column({ type: "enum", enum: OutcomeCoverageMethod })
  method!: OutcomeCoverageMethod;

  @Column({ type: "enum", enum: SourceReliability })
  confidence!: SourceReliability;

  @Column({ type: "uuid", nullable: true })
  verifiedBy?: string;

  @Column({ type: "timestamptz", nullable: true })
  verifiedAt?: Date;

  @Column({ type: "text", nullable: true })
  notes?: string;

  @Column({ type: "uuid", nullable: true })
  createdBy?: string;

  @Index()
  @Column({ type: "uuid", nullable: true })
  submissionId?: string;

  @Column({ type: "timestamptz", nullable: true })
  revokedAt?: Date;

  @Column({ type: "text", nullable: true })
  revokedReason?: string;
}
