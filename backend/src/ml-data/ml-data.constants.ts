import type { ScoringFeatureKey } from "../scoring/scoring.types";

/** Single source of truth for every tunable ML-data constant — mirrors
 * scoring/scoring.constants.ts's own "never inline these elsewhere" rule,
 * for the same reason: a value baked into old snapshot/export rows must
 * keep meaning what it meant when it was written. */

/** Bumped whenever the SHAPE of a snapshot's `features` jsonb changes in a
 * way that would make an old snapshot not directly comparable to a new
 * one (e.g. a ScoringFeatures key is renamed or removed). Independent of
 * SCORE_VERSION (the scoring methodology) and of ML_FEATURES_V1 (the
 * export-time allowlist, which can narrow/widen without needing new
 * snapshots). */
export const ML_FEATURE_SCHEMA_VERSION = "ML-FEATURES-1.0";

/** Every ScoringFeatures key considered safe to export into a training
 * matrix — all company-level structured numbers/booleans/one enum-like
 * string, zero PII by construction (there is no email/name/phone/note key
 * anywhere in ScoringFeatures to begin with). Never add a key here without
 * checking it isn't personally identifying. */
export const ML_FEATURES_V1: ScoringFeatureKey[] = [
  // Growth Momentum
  "annualRevenue", "previousAnnualRevenue", "quarterlyRevenueGrowth", "customerCount", "previousCustomerCount",
  "customerGrowthRate", "partnershipsCount", "partnershipGrowth", "employeeGrowth", "geographicExpansion",
  "activeUsers", "userGrowthRate",
  // Financial Strength
  "monthlyBurn", "cashAvailable", "runwayMonths", "recurringRevenue", "totalFundingRaised", "fundingRounds",
  "investorCount", "debt", "grossMargin", "burnMultiple",
  // Market Potential
  "tam", "sam", "som", "marketGrowthRate", "cagr", "competitionLevel", "geographicReach",
  "saudiMarketOpportunity", "menaMarketOpportunity", "categoryTailwinds",
  // Regulatory Readiness
  "regulatoryMilestone",
  // Team Strength
  "founderCount", "founderExperienceYears", "healthcareExperienceYears", "technicalExperienceYears",
  "commercialExperienceYears", "previousStartupExperience", "previousExits", "publications", "patents",
  "teamSize", "leadershipCompleteness", "technicalTeamStrength", "commercialTeamStrength",
  // Technology Differentiation
  "patentsGranted", "patentsPending", "proprietaryDatasets", "proprietaryAlgorithms", "clinicalData",
  "peerReviewedPublications", "tradeSecrets", "technologyReadinessLevel", "clinicalValidation",
  "technicalComplexity", "replicationDifficulty", "proprietaryTechnology",
];

/** Structural context columns every export may include alongside the
 * allowlisted features — never PII, never score-derived. `dataConfidence`
 * is deliberately NOT here: it's used to FILTER which rows to export
 * (`minConfidence`), never as a feature column itself, so the model can't
 * free-ride on how confident RUWĀD's own deterministic system was. */
export const ML_CONTEXT_COLUMNS = ["category", "startupStage"] as const;

/** Supported label observation windows, in months. */
export const OBSERVATION_WINDOWS_MONTHS = [6, 12, 24] as const;
export type ObservationWindowMonths = (typeof OBSERVATION_WINDOWS_MONTHS)[number];

/** Operational gates for MlReadinessService — NOT a claim that a model
 * trained past these thresholds will be good, only that there's enough
 * data to responsibly attempt training. Configurable, not a statistical law. */
export const ML_READINESS_THRESHOLDS = {
  MIN_TRAINING_ROWS: 200,
  MIN_POSITIVE_ROWS: 40,
  MIN_NEGATIVE_ROWS: 40,
  MIN_CORE_FEATURE_COVERAGE: 0.6,
};

/** The "core" features readiness checks weight most heavily — a dataset can
 * have decent overall coverage while still being unusable if these specific
 * signals are sparse. */
export const ML_CORE_FEATURES: ScoringFeatureKey[] = [
  "annualRevenue", "customerCount", "fundingRounds", "founderExperienceYears", "teamSize", "regulatoryMilestone",
];
