import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";

/** A hub's "Supported Companies" — links to a real startup row when one
 * matches by name (startupId), otherwise keeps the plain name/sector/stage
 * snapshot the old mock data had (no fabricated startup record is created
 * just to satisfy the relation). */
@Entity("hub_portfolio_items")
export class HubPortfolioItem extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  hubId!: string;

  @Column({ type: "uuid", nullable: true })
  startupId?: string;

  @Column() companyName!: string;
  @Column() sector!: string;
  @Column() stage!: string;
  @Column({ nullable: true }) location?: string;
  @Column() programName!: string;
  @Column({ type: "int" }) year!: number;
}
