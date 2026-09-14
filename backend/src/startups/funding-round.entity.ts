import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";

@Entity("funding_rounds")
export class FundingRound extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  startupId!: string;

  @Column()
  round!: string;

  /** Stored as the frontend's "YYYY-MM" string, not a real date, to match
   * the existing mock data exactly (no day-of-month is known). */
  @Column()
  date!: string;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  amount!: number;

  @Column()
  lead!: string;
}
