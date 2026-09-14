import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";

export type VerifiedTier = "verified" | "self-reported" | "unclaimed";

/** Mirrors the frontend `Startup` interface (src/types/entities.ts) field
 * for field, with array/relational pieces (team, rounds, investors,
 * documents, products, sectors) split out into the shared/child tables
 * instead of JSON columns. */
@Entity("startups")
export class Startup extends BaseEntity {
  @Index({ unique: true })
  @Column()
  slug!: string;

  @Column()
  name!: string;

  @Column({ type: "uuid", nullable: true })
  logoImageId?: string;

  @Column()
  category!: string;

  @Column()
  subsector!: string;

  @Column()
  tagline!: string;

  @Column()
  country!: string;

  @Column()
  city!: string;

  @Column()
  hq!: string;

  @Column({ type: "int" })
  founded!: number;

  @Column()
  stage!: string;

  @Column({ default: "Active" })
  status!: string;

  @Column()
  businessModel!: string;

  @Column({ type: "int" })
  employees!: number;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  fundingTotal!: number;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  valuation!: number;

  @Column({ default: false })
  fundraising!: boolean;

  @Column({ nullable: true })
  targetRaise?: string;

  @Column({ type: "text" })
  desc!: string;

  @Column({ type: "text" })
  problem!: string;

  @Column({ type: "text" })
  solution!: string;

  @Column({ type: "text" })
  advantage!: string;

  @Column() sfda!: string;
  @Column() fda!: string;
  @Column() ce!: string;
  @Column() clinicalStatus!: string;
  @Column() patentStatus!: string;

  @Column() marketTam!: string;
  @Column() marketSam!: string;
  @Column() marketSom!: string;
  @Column("text", { array: true, default: [] })
  marketCompetitors!: string[];

  @Column() legalName!: string;
  @Column({ default: "—" }) formerName!: string;
  @Column() website!: string;
  @Column() email!: string;
  @Column() phone!: string;
  @Column() linkedin!: string;
  @Column() registrationNumber!: string;

  @Column({ type: "varchar", default: "unclaimed" })
  verified!: VerifiedTier;

  @Column({ type: "int" }) scoreGrowth!: number;
  @Column({ type: "int" }) scoreFinancial!: number;
  @Column({ type: "int" }) scoreMarket!: number;
  @Column({ type: "int" }) scoreTeam!: number;
  @Column({ type: "int" }) scoreRegulatory!: number;
  @Column({ type: "int" }) scoreTech!: number;
  /** Equal-weighted average of the six subscores × 10 — same formula the
   * frontend's compositeScore() already used; never invented independently. */
  @Column({ type: "int" }) score!: number;

  @Column({ type: "varchar", default: "Medium" })
  provenanceConfidence!: "High" | "Medium" | "Low";

  @Column({ type: "date" })
  provenanceLastUpdated!: string;

  @Column("text", { array: true, default: [] })
  provenanceSources!: string[];

  /** Display-only nested data with no relational/query need of its own —
   * genuinely flexible content per the schema's own JSONB rule, not a
   * shortcut around normalizing simple fields. */
  @Column({ type: "jsonb", nullable: true })
  traction?: { revenue: string; growth: string; customers: number | string; users: string | number; partnerships: number; pilots: number; markets: string; awards: string };

  @Column({ type: "jsonb", default: [] })
  newsItems!: { date: string; headline: string; source: string }[];
}
