import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";

@Entity("investors")
export class Investor extends BaseEntity {
  @Index({ unique: true })
  @Column()
  slug!: string;

  @Column() name!: string;
  @Column({ type: "uuid", nullable: true }) logoImageId?: string;
  @Column() short!: string;
  @Column() type!: string;
  @Column() city!: string;
  @Column({ type: "int" }) founded!: number;
  @Column({ type: "text" }) desc!: string;
  @Column({ type: "text" }) thesis!: string;
  @Column("text", { array: true, default: [] }) stageFocus!: string[];
  @Column() ticket!: string;
  @Column() aum!: string;
  @Column() available!: string;
  @Column({ type: "int" }) investments!: number;
  @Column({ type: "int" }) exits!: number;
  @Column({ type: "int" }) hcDeals!: number;

  @Column({ type: "varchar", default: "Medium" })
  provenanceConfidence!: "High" | "Medium" | "Low";
  @Column({ type: "date" })
  provenanceLastUpdated!: string;
  @Column("text", { array: true, default: [] })
  provenanceSources!: string[];

  @Column("text", { array: true, default: [] })
  openOpps!: string[];

  @Column({ type: "jsonb", default: [] })
  recentDeals!: { startup: string; round: string; date: string }[];

  @Column({ type: "jsonb", default: [] })
  news!: { date: string; headline: string; source: string }[];
}
