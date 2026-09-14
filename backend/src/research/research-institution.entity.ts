import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";

/** IMPORTANT product rule (carried over from the frontend build): Research
 * & Academia has NO Data Room. Nothing in this module — or anywhere in
 * this table's relations — references DataRoom/NDA entities. */
@Entity("research_institutions")
export class ResearchInstitution extends BaseEntity {
  @Index({ unique: true })
  @Column()
  slug!: string;

  @Column() name!: string;
  @Column({ type: "uuid", nullable: true }) logoImageId?: string;
  @Column() type!: string;
  @Column() city!: string;
  @Column() country!: string;
  @Column({ type: "int" }) founded!: number;
  @Column() website!: string;
  @Column({ type: "int" }) numResearchers!: number;
  @Column({ type: "int" }) numCenters!: number;
  @Column({ type: "int" }) numLabs!: number;
  @Column({ type: "text" }) about!: string;
  @Column({ type: "varchar", default: "Selective" }) collaborationStatus!: "Open" | "Selective" | "Closed";
  @Column({ type: "int" }) technologyReadinessLevel!: number;
  @Column({ type: "int" }) patentsCount!: number;

  @Column({ type: "varchar", default: "Medium" })
  provenanceConfidence!: "High" | "Medium" | "Low";
  @Column({ type: "date" })
  provenanceLastUpdated!: string;
  @Column("text", { array: true, default: [] })
  provenanceSources!: string[];

  @Column("text", { array: true, default: [] })
  coreResearchAreas!: string[];

  @Column({ type: "jsonb", default: [] })
  researchCenters!: { name: string; focus: string[]; principalArea: string }[];

  @Column({ type: "jsonb", default: [] })
  facilities!: { name: string; capabilities: string[]; externalAccess: string }[];

  @Column({ type: "jsonb", nullable: true })
  clinical?: { trialCapabilities: string; hospitalAffiliations: string; patientRecruitment: string; irb: string; clinicalUnits: string; translational: string; biobanks: string; datasets: string };

  @Column({ type: "jsonb", nullable: true })
  innovation?: { techTransferOffice: string; spinouts: string; startupPrograms: string; patents: string; licensing: string; incubators: string; entrepreneurship: string; commercialization: string };

  @Column({ type: "jsonb", nullable: true })
  contacts?: { mainContact: string; researchOffice: string; techTransferOffice: string; industryPartnershipOffice: string; website: string; email: string; phone: string; linkedin: string; location: string };
}
