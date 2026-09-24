import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import type { ExternalSource, GeneratedContent, InternalStats, QueryLog, ReportScope } from "./report-types";

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

  /** Public visibility. Hand-written reports default to published; generated reports start as drafts until an admin publishes. */
  @Column({ default: true }) isPublished!: boolean;
  /** Set only for reports produced by the generator (see report-generator.service.ts). */
  @Column({ type: "varchar", nullable: true }) reportKind?: string | null;
  @Column({ type: "jsonb", nullable: true }) scope?: ReportScope | null;
  /** Statistics computed from the RUWĀD database — never from web pages. */
  @Column({ type: "jsonb", nullable: true }) internalStats?: InternalStats | null;
  /** Web sources kept as evidence, saved with the report so viewing it never searches again. */
  @Column({ type: "jsonb", default: [] }) externalSources!: ExternalSource[];
  @Column({ type: "jsonb", default: [] }) researchQueries!: QueryLog[];
  @Column({ type: "timestamptz", nullable: true }) researchedAt?: Date | null;
  /** "no-ai" (facts assembled from data + sources) or "ai" (an AI-written overview was added and verified). */
  @Column({ type: "varchar", nullable: true }) generationMode?: string | null;
  @Column({ type: "jsonb", nullable: true }) generated?: GeneratedContent | null;
  @Column({ type: "text", nullable: true }) aiOverview?: string | null;
  @Column("text", { array: true, default: [] })
  provenanceSources!: string[];

  /** "RUWAD" for everything RUWĀD wrote or generated; "USER_SUBMITTED" for a community report approved for publication. */
  @Column({ type: "varchar", default: "RUWAD" }) origin!: string;
  /** The approved submission this report came from (its author's email and review history live there, never here). */
  @Column({ type: "uuid", nullable: true }) submissionId?: string | null;
  @Column({ type: "varchar", nullable: true }) organizationName?: string | null;
  /** The date the author gave for the report itself (the report's own publication date); `publicationDate` is when RUWĀD published it. */
  @Column({ type: "date", nullable: true }) reportDate?: string | null;
  @Column({ type: "varchar", nullable: true }) reportUrl?: string | null;
  /** Points at a private `report_files` row; it is served publicly only while this report is published. */
  @Column({ type: "uuid", nullable: true }) reportFileId?: string | null;
  @Column({ type: "jsonb", default: [] }) referenceLinks!: { title: string; url: string }[];
}
