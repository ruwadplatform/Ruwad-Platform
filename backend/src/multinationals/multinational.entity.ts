import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";

@Entity("multinationals")
export class Multinational extends BaseEntity {
  @Index({ unique: true })
  @Column()
  slug!: string;

  @Column() name!: string;
  @Column({ type: "uuid", nullable: true }) logoImageId?: string;
  @Column() category!: string;
  @Column() subsector!: string;
  @Column() tagline!: string;
  @Column() country!: string;
  @Column() city!: string;
  @Column() hq!: string;
  @Column({ type: "int" }) founded!: number;
  @Column({ default: "Active" }) status!: string;
  @Column() businessModel!: string;
  @Column({ type: "int" }) employees!: number;
  @Column() companySize!: string;
  @Column({ type: "text" }) desc!: string;
  @Column({ type: "text" }) problem!: string;
  @Column({ type: "text" }) solution!: string;
  @Column({ type: "text" }) advantage!: string;

  @Column() sfda!: string;
  @Column() fda!: string;
  @Column() ce!: string;
  @Column() clinicalStatus!: string;
  @Column() patentStatus!: string;
  @Column() marketTam!: string;
  @Column() marketSam!: string;
  @Column() marketSom!: string;
  @Column("text", { array: true, default: [] }) marketCompetitors!: string[];

  @Column({ default: true }) saudiOffice!: boolean;
  @Column({ default: false }) regionalHeadquarters!: boolean;
  @Column({ default: false }) manufacturing!: boolean;
  @Column({ default: true }) distribution!: boolean;
  @Column({ default: false }) clinicalOperations!: boolean;
  @Column({ default: false }) trainingCenters!: boolean;
  @Column({ default: false }) researchOperations!: boolean;
  @Column("text", { array: true, default: [] }) countriesActiveIn!: string[];
  @Column() regionalEmployees!: string;

  @Column() rdFocus!: string;
  @Column({ type: "int" }) rdCenters!: number;
  @Column({ default: true }) openInnovation!: boolean;
  @Column({ default: true }) startupCollaboration!: boolean;
  @Column({ default: true }) partnershipInterest!: boolean;
  @Column({ default: true }) techScouting!: boolean;

  @Column() legalName!: string;
  @Column() website!: string;
  @Column() email!: string;
  @Column() phone!: string;
  @Column() linkedin!: string;

  @Column({ type: "varchar", default: "High" })
  provenanceConfidence!: "High" | "Medium" | "Low";
  @Column({ type: "date" })
  provenanceLastUpdated!: string;
  @Column("text", { array: true, default: [] })
  provenanceSources!: string[];

  @Column({ type: "jsonb", default: [] })
  startupProgramsList!: { name: string; type: string; geography: string; focus: string[]; status: string }[];

  @Column({ type: "jsonb", default: [] })
  investmentsList!: { company: string; sector: string; round: string; year: number }[];

  @Column({ type: "jsonb", default: [] })
  newsItems!: { date: string; headline: string; source: string }[];
}
