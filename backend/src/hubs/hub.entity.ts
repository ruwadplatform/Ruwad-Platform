import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";

@Entity("hubs")
export class Hub extends BaseEntity {
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
  @Column() operatingRegion!: string;
  @Column() ownershipType!: string;
  @Column({ type: "varchar", default: "Open" }) status!: "Open" | "Closed";
  @Column() deadline!: string;
  @Column({ type: "text" }) desc!: string;
  @Column({ type: "text" }) about!: string;
  @Column("text", { array: true, default: [] }) stagesSupported!: string[];
  @Column("text", { array: true, default: [] }) geographicCoverage!: string[];
  @Column("text", { array: true, default: [] }) support!: string[];
  @Column() fundingAvailable!: string;
  @Column() fundingType!: string;

  @Column({ type: "varchar", default: "Medium" })
  provenanceConfidence!: "High" | "Medium" | "Low";
  @Column({ type: "date" })
  provenanceLastUpdated!: string;
  @Column("text", { array: true, default: [] })
  provenanceSources!: string[];

  @Column("text", { array: true, default: [] })
  focusAreas!: string[];

  @Column({ type: "jsonb", nullable: true })
  eligibility?: { stage: string; location: string; sector: string; team: string; incorporated: string; revenue: string; techReadiness: string; regulatoryStage: string; ip: string; applicationReq: string };

  @Column({ type: "jsonb", nullable: true })
  application?: { status: string; opens: string; deadline: string; programStarts: string; url: string; process: string[] };
}
