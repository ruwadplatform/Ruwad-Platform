import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";

@Entity("reports")
export class Report extends BaseEntity {
  @Index({ unique: true })
  @Column()
  slug!: string;

  @Column() title!: string;
  @Column() category!: string;
  @Column() reportType!: string;
  @Column({ type: "date" }) publicationDate!: string;
  @Column({ type: "text" }) description!: string;
  @Column() geography!: string;
  @Column() sector!: string;
  @Column("text", { array: true, default: [] }) authors!: string[];
  @Column() readingTime!: string;
  @Column({ type: "int" }) pages!: number;
  @Column("text", { array: true, default: [] }) badges!: string[];
  @Column({ type: "text" }) executiveSummary!: string;
  @Column("text", { array: true, default: [] }) keyFindings!: string[];
  /** Flexible structured content — market stats + narrative sections
   * genuinely vary in shape per report, unlike the entity directories'
   * fixed columns, so JSONB is the pragmatic fit here (explicitly allowed
   * for "flexible structured metadata"). */
  @Column({ type: "jsonb", default: [] }) marketStats!: { label: string; value: string }[];
  @Column({ type: "jsonb", default: [] }) sections!: { heading: string; body: string; chart?: { l: string; v: number }[] }[];
  @Column("text", { array: true, default: [] }) sources!: string[];
  @Column("uuid", { array: true, default: [] }) relatedStartupIds!: string[];
  @Column("uuid", { array: true, default: [] }) relatedInvestorIds!: string[];
  @Column("uuid", { array: true, default: [] }) relatedReportIds!: string[];
  @Column({ type: "timestamptz", nullable: true }) publishedAt?: Date;

  @Column({ type: "varchar", default: "Medium" })
  provenanceConfidence!: "High" | "Medium" | "Low";
  @Column({ type: "date", nullable: true })
  provenanceLastUpdated?: string;
  @Column("text", { array: true, default: [] })
  provenanceSources!: string[];
}
