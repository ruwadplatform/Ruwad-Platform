import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { ScoreDataSource } from "../common/enums";

/** One founder's career anchors — the INPUTS from which
 * founderExperienceYears (and healthcareExperienceYears) are derived as of
 * any snapshot date. Founders are not asked to type "12 years": that number
 * ages every year, so it can't be reused for an earlier snapshot. Internal
 * only — never returned by public endpoints and never exported (the ML
 * export carries the derived numbers, not names or roles). */
@Entity("startup_founder_career")
export class StartupFounderCareer extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  startupId!: string;

  /** Display label for admin review only. */
  @Column()
  founderName!: string;

  @Column({ type: "uuid", nullable: true })
  teamMemberId?: string;

  /** First year of professional work. */
  @Column({ type: "int" })
  careerStartYear!: number;

  /** First year of work in healthcare/life sciences, if different. */
  @Column({ type: "int", nullable: true })
  domainStartYear?: number;

  /** Optional role history, e.g. [{title, organization, startYear, endYear}]. */
  @Column({ type: "jsonb", nullable: true })
  roleHistory?: { title: string; organization?: string; startYear: number; endYear?: number }[];

  @Column({ type: "enum", enum: ScoreDataSource })
  source!: ScoreDataSource;

  @Column({ type: "uuid", nullable: true })
  sourceDocumentId?: string;

  @Column({ default: false })
  verified!: boolean;

  @Column({ type: "uuid", nullable: true })
  createdBy?: string;

  @Index()
  @Column({ type: "uuid", nullable: true })
  submissionId?: string;

  @Column({ type: "timestamptz", nullable: true })
  revokedAt?: Date;
}
