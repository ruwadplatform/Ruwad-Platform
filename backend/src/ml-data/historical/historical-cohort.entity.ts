import { Column, Entity } from "typeorm";
import { BaseEntity } from "../../common/base.entity";

/** A named research grouping (e.g. "Saudi Digital Health 2022") — exists so
 * bulk historical-snapshot creation and coverage/imbalance analysis can
 * operate on a meaningful slice rather than "all startups." */
@Entity("startup_historical_cohorts")
export class HistoricalCohort extends BaseEntity {
  @Column()
  name!: string;

  @Column({ nullable: true })
  region?: string;

  @Column({ nullable: true })
  category?: string;

  @Column({ type: "date", nullable: true })
  snapshotDate?: string;

  @Column({ type: "text", nullable: true })
  sourceDescription?: string;
}
