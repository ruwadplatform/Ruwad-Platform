import { ScoreDataSource, ScoreStatus } from "../common/enums";
import { Startup } from "../startups/startup.entity";

/** Flat bag of normalized scoring inputs for one startup. Every field is
 * optional — a missing field means "unknown", never "zero" (see
 * scoring.utils.ts's normalizers, which return null rather than guess).
 * Field names match the ones the six engines were specified against. */
export interface ScoringFeatures {
  // Growth Momentum
  annualRevenue?: number;
  previousAnnualRevenue?: number;
  quarterlyRevenueGrowth?: number;
  customerCount?: number;
  previousCustomerCount?: number;
  customerGrowthRate?: number;
  partnershipsCount?: number;
  partnershipGrowth?: number;
  employeeGrowth?: number;
  geographicExpansion?: number;
  activeUsers?: number;
  userGrowthRate?: number;

  // Financial Strength
  monthlyBurn?: number;
  cashAvailable?: number;
  runwayMonths?: number;
  recurringRevenue?: number;
  totalFundingRaised?: number;
  fundingRounds?: number;
  investorCount?: number;
  debt?: number;
  grossMargin?: number;
  burnMultiple?: number;

  // Market Potential
  tam?: number;
  sam?: number;
  som?: number;
  marketGrowthRate?: number;
  cagr?: number;
  competitionLevel?: number;
  geographicReach?: number;
  saudiMarketOpportunity?: number;
  menaMarketOpportunity?: number;
  categoryTailwinds?: number;

  // Regulatory Readiness — an explicit milestone label from the sector-appropriate
  // ladder (see engines/regulatory.engine.ts), set by an admin or extracted from a
  // pitch deck. Falls back to inferring an approximate stage from the startup's
  // existing sfda/fda/ce columns when absent.
  regulatoryMilestone?: string;

  // Team Strength
  founderCount?: number;
  founderExperienceYears?: number;
  healthcareExperienceYears?: number;
  technicalExperienceYears?: number;
  commercialExperienceYears?: number;
  previousStartupExperience?: boolean;
  previousExits?: number;
  publications?: number;
  patents?: number;
  teamSize?: number;
  leadershipCompleteness?: number;
  technicalTeamStrength?: number;
  commercialTeamStrength?: number;

  // Technology Differentiation
  patentsGranted?: number;
  patentsPending?: number;
  proprietaryDatasets?: number;
  proprietaryAlgorithms?: number;
  clinicalData?: boolean;
  peerReviewedPublications?: number;
  tradeSecrets?: number;
  technologyReadinessLevel?: number;
  clinicalValidation?: boolean;
  technicalComplexity?: number;
  replicationDifficulty?: number;
  proprietaryTechnology?: boolean;
}

export type ScoringFeatureKey = keyof ScoringFeatures;

export interface FeatureProvenanceEntry {
  source: ScoreDataSource;
  verified: boolean;
  sourceDocumentId?: string;
  extractedAt?: string;
}

/** Parallel object to ScoringFeatures — one entry per feature key that's
 * actually been set, never inferred for a key that's absent. */
export type FeatureProvenance = Partial<Record<ScoringFeatureKey, FeatureProvenanceEntry>>;

export type FactorKey = "growth" | "financial" | "market" | "team" | "regulatory" | "technology";

export const FACTOR_KEYS: FactorKey[] = ["growth", "financial", "market", "team", "regulatory", "technology"];

/** One factor engine's output. `score` is null exactly when the factor
 * couldn't be computed at all (zero usable inputs) — never 0, since 0 would
 * read as "assessed and found poor" rather than "not assessed". */
export interface FactorResult {
  score: number | null;
  confidence: number;
  reason: string;
  inputsUsed: ScoringFeatureKey[];
  missingInputs: ScoringFeatureKey[];
}

export interface ScoreResult {
  status: ScoreStatus;
  ruwadScore: number | null;
  confidenceScore: number | null;
  version: string;
  calculatedAt: string;
  factors: Record<FactorKey, FactorResult>;
  missingFactors: FactorKey[];
}

/** Signature every factor engine implements — a pure function, no DB access,
 * fully unit-testable in isolation. `startup` is passed alongside `features`
 * because a few existing Startup columns (category, sfda/fda/ce, funding)
 * already carry real signal the engines can use without new data. */
export type FactorEngine = (features: ScoringFeatures, startup: Startup) => FactorResult;

/** Optional future ML prediction, kept structurally separate from the
 * deterministic score. See ml/ml-scoring-provider.interface.ts. */
export interface MlPrediction {
  score: number;
  confidence: number;
}
