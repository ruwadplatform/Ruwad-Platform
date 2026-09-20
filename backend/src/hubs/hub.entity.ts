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

  /** Filterable yes/no behind fundingAvailable's free text; null on hubs
   * created before the type-specific form (or via the admin API). */
  @Column({ type: "boolean", nullable: true })
  hasFunding?: boolean | null;

  /** Answers that only exist for some hub types (venture-studio model,
   * research capabilities, membership, ...), whitelisted per type by
   * submissions/hub-types.ts. Anything that needs filtering lives in a
   * typed column above instead. */
  @Column({ type: "jsonb", nullable: true })
  typeDetails?: Record<string, unknown> | null;

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
