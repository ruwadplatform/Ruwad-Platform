import { Injectable } from "@nestjs/common";
import { ScoreStatus } from "../common/enums";
import { FACTOR_KEYS, FactorKey, ScoringFeatureKey } from "./scoring.types";
import { MIN_FACTOR_COVERAGE, MIN_OVERALL_CONFIDENCE, SCORE_VERSION_EXISTING_DATA } from "./scoring.constants";
import { ScoringService } from "./scoring.service";
import { MlExperimentalInferenceService, PredictiveIntelligence } from "../ml-data/ml-experimental-inference.service";

export const FACTOR_LABELS: Record<FactorKey, string> = {
  growth: "Growth Momentum",
  financial: "Financial Strength",
  market: "Market Potential",
  team: "Team Strength",
  regulatory: "Regulatory Readiness",
  technology: "Technology Differentiation",
};

export const PENDING_MESSAGE = "Add more company information to complete your RUWĀD assessment.";
export const EXISTING_DATA_NOTE = "This score is based only on the information already on file for this company. A factor with no data counts as 0, so the score rises as more information is added.";

/** The scoring inputs a founder can actually provide in the submission form, and where. Inputs that only an analyst or admin can supply
 * (leadershipCompleteness, technicalTeamStrength, burnMultiple, ...) are never asked of a founder, so they are not listed as "missing". */
export const FOUNDER_FIELDS: Partial<Record<ScoringFeatureKey, { label: string; where: string }>> = {
  annualRevenue: { label: "Annual Revenue (SAR)", where: "Funding → Traction & Growth" },
  previousAnnualRevenue: { label: "Previous Year's Annual Revenue (SAR)", where: "Funding → Traction & Growth" },
  recurringRevenue: { label: "Recurring Revenue (SAR)", where: "Funding → Traction & Growth" },
  customerCount: { label: "Current Customers", where: "Funding → Traction & Growth" },
  previousCustomerCount: { label: "Previous Year's Customers", where: "Funding → Traction & Growth" },
  activeUsers: { label: "Active Users", where: "Funding → Traction & Growth" },
  partnershipsCount: { label: "Active Partnerships", where: "Funding → Traction & Growth" },
  monthlyBurn: { label: "Monthly Burn (SAR)", where: "Funding → Traction & Growth" },
  cashAvailable: { label: "Cash Available (SAR)", where: "Funding → Traction & Growth" },
  fundingRounds: { label: "Funding Rounds", where: "Funding" },
  totalFundingRaised: { label: "Funding Round amounts", where: "Funding → Funding Rounds" },
  investorCount: { label: "Lead Investor on each round", where: "Funding → Funding Rounds" },
  marketGrowthRate: { label: "Market Growth Rate (% annual)", where: "Business & Market" },
  geographicExpansion: { label: "Markets Currently Operating In", where: "Business & Market" },
  teamSize: { label: "Employees", where: "Business & Market" },
  founderCount: { label: "Founders & Team Members (mark who is a founder)", where: "Founders & Team" },
  founderExperienceYears: { label: "Founder: Years of Relevant Experience", where: "Founders & Team" },
  healthcareExperienceYears: { label: "Founder: Years of Healthcare Experience", where: "Founders & Team" },
  previousStartupExperience: { label: "Founder: Previously Founded a Startup", where: "Founders & Team" },
  proprietaryTechnology: { label: "Proprietary Technology", where: "Product & Technology" },
  proprietaryAlgorithms: { label: "Proprietary Algorithms / Models", where: "Product & Technology" },
  proprietaryDatasets: { label: "Proprietary Datasets", where: "Product & Technology" },
  technologyReadinessLevel: { label: "Technology Readiness Level", where: "Product & Technology" },
  peerReviewedPublications: { label: "Peer-Reviewed Publications", where: "Product & Technology" },
  clinicalValidation: { label: "Clinical Validation Completed", where: "Product & Technology" },
  patentsGranted: { label: "Patents Granted", where: "Clinical & Regulatory" },
  patentsPending: { label: "Patents Pending", where: "Clinical & Regulatory" },
  regulatoryMilestone: { label: "Regulatory Strategy Status", where: "Clinical & Regulatory" },
};

export type AssessmentScoreState = "READY" | "PENDING" | "PROCESSING";

export interface MissingField { key: string; label: string; where: string }

export interface StartupAssessment {
  startupId: string;
  /** The official RUWĀD Score. Always produced by the six deterministic scoring engines; ML never feeds it. `value` is null (never 0) when there is not enough data. */
  ruwadScore: { state: AssessmentScoreState; value: number | null; outOf: 10; dataConfidence: number | null; version: string; calculatedAt: string; message?: string; basis: "STANDARD" | "EXISTING_DATA"; basisNote?: string };
  /** Present while the score is PENDING: exactly why, in the engine's own terms. */
  completion?: { factorsAvailable: number; factorsRequired: number; meanConfidence: number | null; confidenceRequired: number; blockers: string[]; unavailableFactors: { key: FactorKey; label: string; missingFields: MissingField[] }[] };
  factors: { key: FactorKey; label: string; status: "AVAILABLE" | "UNAVAILABLE"; score: number | null; confidence: number; explanation: string; missingFields: MissingField[] }[];
  /** Separate from the score on purpose. Only models that actually exist are listed. */
  predictiveIntelligence: PredictiveIntelligence;
  /** True while either the score or an experimental prediction is still being produced: the page should keep polling briefly. */
  processing: boolean;
}

function founderMissing(keys: ScoringFeatureKey[]): MissingField[] {
  const seen = new Set<string>();
  const out: MissingField[] = [];
  for (const k of keys) {
    const f = FOUNDER_FIELDS[k];
    if (!f || seen.has(f.label)) continue;
    seen.add(f.label);
    out.push({ key: k, label: f.label, where: f.where });
  }
  return out;
}

/** The owner-facing assessment: the official score and its six factors, plus the separate experimental "Predictive Intelligence" card.
 *
 *  Read-only and server-built — the frontend never computes a score or a prediction. It reads stored rows only, so opening the page can
 *  neither trigger scoring nor call the ML service; a slow or dead ML service cannot affect it. Provenance internals, raw ML features,
 *  model metadata and admin notes are deliberately absent. */
@Injectable()
export class StartupAssessmentService {
  constructor(private readonly scoring: ScoringService, private readonly experimental: MlExperimentalInferenceService) {}

  async get(startupId: string): Promise<StartupAssessment> {
    const score = await this.scoring.getScoreForStartup(startupId);
    const calculated = score.status === ScoreStatus.CALCULATED && score.ruwadScore != null;
    const neverRun = score.status === ScoreStatus.NOT_CALCULATED;
    const state: AssessmentScoreState = calculated ? "READY" : neverRun ? "PROCESSING" : "PENDING";

    const predictiveIntelligence = await this.experimental.ownerView(startupId, neverRun ? null : score.calculatedAt).catch(() => ({ models: [] } as PredictiveIntelligence));

    const factors = FACTOR_KEYS.map((key) => {
      const f = score.factors[key];
      const available = f.score != null;
      return { key, label: FACTOR_LABELS[key], status: (available ? "AVAILABLE" : "UNAVAILABLE") as "AVAILABLE" | "UNAVAILABLE", score: f.score, confidence: f.confidence, explanation: f.reason, missingFields: founderMissing(f.missingInputs) };
    });

    let completion: StartupAssessment["completion"];
    if (state === "PENDING") {
      const computed = factors.filter((f) => f.status === "AVAILABLE");
      const mean = computed.length ? computed.reduce((a, f) => a + f.confidence, 0) / computed.length : null;
      const blockers: string[] = [];
      if (computed.length < MIN_FACTOR_COVERAGE) blockers.push(`Only ${computed.length} of ${FACTOR_KEYS.length} scoring factors can be calculated from the information provided; at least ${MIN_FACTOR_COVERAGE} are needed.`);
      if (mean != null && mean < MIN_OVERALL_CONFIDENCE) blockers.push(`The calculated factors rest on ${Math.round(mean * 100)}% of their inputs on average; at least ${Math.round(MIN_OVERALL_CONFIDENCE * 100)}% is needed.`);
      if (score.status === ScoreStatus.ERROR) blockers.push("The assessment could not be completed. It will be retried when your company information changes.");
      completion = {
        factorsAvailable: computed.length, factorsRequired: MIN_FACTOR_COVERAGE, meanConfidence: mean, confidenceRequired: MIN_OVERALL_CONFIDENCE, blockers,
        unavailableFactors: factors.filter((f) => f.status === "UNAVAILABLE").map((f) => ({ key: f.key, label: f.label, missingFields: f.missingFields })),
      };
    }

    return {
      startupId,
      ruwadScore: {
        state,
        value: calculated ? score.ruwadScore : null,
        outOf: 10,
        dataConfidence: calculated ? score.confidenceScore : null,
        version: score.version,
        calculatedAt: score.calculatedAt,
        basis: score.version === SCORE_VERSION_EXISTING_DATA ? "EXISTING_DATA" : "STANDARD",
        basisNote: score.version === SCORE_VERSION_EXISTING_DATA ? EXISTING_DATA_NOTE : undefined,
        message: state === "PENDING" ? PENDING_MESSAGE : state === "PROCESSING" ? "Processing your RUWĀD assessment…" : undefined,
      },
      completion,
      factors,
      predictiveIntelligence,
      processing: neverRun || predictiveIntelligence.models.some((m) => m.status === "PROCESSING"),
    };
  }
}
