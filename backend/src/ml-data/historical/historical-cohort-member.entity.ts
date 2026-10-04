import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../../common/base.entity";

@Entity("startup_historical_cohort_members")
export class HistoricalCohortMember extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  cohortId!: string;

  @Index()
  @Column({ type: "uuid" })
  startupId!: string;
}
