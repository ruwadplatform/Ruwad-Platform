"""Mirrors backend/src/ml-data/ml-data.constants.ts's ML_FEATURES_V1 and
ML_FEATURE_SCHEMA_VERSION exactly, in the same order. NestJS remains the
source of truth (its export endpoint already only ever returns these
columns) — this local copy exists so Python code has a deterministic
column order and knows which features are categorical/boolean vs. plain
numeric, without re-deriving that from a live API call on every import.
If the backend's allowlist ever changes, update this file to match in the
same commit.
"""
from __future__ import annotations

ML_FEATURE_SCHEMA_VERSION = "ML-FEATURES-1.0"

ML_FEATURES_V1: list[str] = [
    # Growth Momentum
    "annualRevenue", "previousAnnualRevenue", "quarterlyRevenueGrowth", "customerCount", "previousCustomerCount",
    "customerGrowthRate", "partnershipsCount", "partnershipGrowth", "employeeGrowth", "geographicExpansion",
    "activeUsers", "userGrowthRate",
    # Financial Strength
    "monthlyBurn", "cashAvailable", "runwayMonths", "recurringRevenue", "totalFundingRaised", "fundingRounds",
    "investorCount", "debt", "grossMargin", "burnMultiple",
    # Market Potential
    "tam", "sam", "som", "marketGrowthRate", "cagr", "competitionLevel", "geographicReach",
    "saudiMarketOpportunity", "menaMarketOpportunity", "categoryTailwinds",
    # Regulatory Readiness
    "regulatoryMilestone",
    # Team Strength
    "founderCount", "founderExperienceYears", "healthcareExperienceYears", "technicalExperienceYears",
    "commercialExperienceYears", "previousStartupExperience", "previousExits", "publications", "patents",
    "teamSize", "leadershipCompleteness", "technicalTeamStrength", "commercialTeamStrength",
    # Technology Differentiation
    "patentsGranted", "patentsPending", "proprietaryDatasets", "proprietaryAlgorithms", "clinicalData",
    "peerReviewedPublications", "tradeSecrets", "technologyReadinessLevel", "clinicalValidation",
    "technicalComplexity", "replicationDifficulty", "proprietaryTechnology",
]

# The one free-text-but-enum-like feature — everything else is numeric or
# boolean. Matches backend/src/ml-data/ml-data-quality.service.ts's own
# CATEGORICAL_KEYS split (which also includes the booleans below as
# "categorical" for coverage-reporting purposes; here we keep the two
# groups separate because CatBoost/XGBoost need to treat them differently).
CATEGORICAL_FEATURES: list[str] = ["regulatoryMilestone"]

BOOLEAN_FEATURES: list[str] = [
    "previousStartupExperience", "clinicalData", "clinicalValidation", "proprietaryTechnology",
]

NUMERIC_FEATURES: list[str] = [f for f in ML_FEATURES_V1 if f not in CATEGORICAL_FEATURES and f not in BOOLEAN_FEATURES]
