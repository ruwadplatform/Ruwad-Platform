import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { FoundedYearBasis, ScoreStatus, ScoringBasis } from "../common/enums";

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

  /** Whether `founded` is a stated year or only an upper-bound placeholder
   * (the column is NOT NULL, so an unknown year had to be filled with
   * something). Internal data-quality metadata; the public API still returns
   * `founded` unchanged. */
  @Column({ type: "enum", enum: FoundedYearBasis, default: FoundedYearBasis.KNOWN })
  foundedBasis!: FoundedYearBasis;

  /** Which scoring rule applies (see ScoringBasis). Internal; never part of the public profile. */
  @Column({ type: "varchar", default: ScoringBasis.EXISTING_DATA })
  scoringBasis!: ScoringBasis;

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

  /** Denormalized read cache of this startup's current RUWĀD Score, kept in
   * sync by ScoringService every time it writes a new startup_score_history
   * row (the source of truth). Never written directly by anything else —
   * see backend/src/scoring/. */
  @Column({ type: "numeric", precision: 4, scale: 2, nullable: true })
  ruwadScore?: number;

  @Column({ type: "varchar", default: ScoreStatus.NOT_CALCULATED })
  scoreStatus!: ScoreStatus;

  @Column({ type: "numeric", precision: 3, scale: 2, nullable: true })
  scoreConfidence?: number;

  @Column({ type: "varchar", nullable: true })
  scoreVersion?: string;

  @Column({ type: "timestamptz", nullable: true })
  scoreCalculatedAt?: Date;

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
