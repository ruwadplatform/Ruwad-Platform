import type { FactorResult, ScoringFeatureKey, ScoringFeatures } from "../scoring.types";
import { normalizePercentage, weightedAverage } from "../scoring.utils";

const boolScore = (b: boolean | null | undefined): number | null => (b == null ? null : b ? 10 : 2);

/** Technology Differentiation — IP Strength 25% / Technology Uniqueness 25%
 * / Data Moat 20% / Scientific-Clinical Evidence 20% / Replication
 * Difficulty 10%. A reported `false` (e.g. no clinical validation yet) is
 * real information and scored modestly, not treated as missing. */
export function scoreTechnology(f: ScoringFeatures): FactorResult {
  const used: ScoringFeatureKey[] = [];
  const missing: ScoringFeatureKey[] = [];
  const track = (key: ScoringFeatureKey, has: boolean) => (has ? used.push(key) : missing.push(key));

  const ipStrength = weightedAverage([
    { value: normalizePercentage(f.patentsGranted, 5), weight: 0.6 },
    { value: normalizePercentage(f.patentsPending, 5), weight: 0.2 },
    { value: normalizePercentage(f.tradeSecrets, 5), weight: 0.2 },
  ]);
  track("patentsGranted", f.patentsGranted != null);
  track("patentsPending", f.patentsPending != null);
  track("tradeSecrets", f.tradeSecrets != null);

  const uniqueness = weightedAverage([
    { value: normalizePercentage(f.proprietaryAlgorithms, 3), weight: 0.4 },
    { value: boolScore(f.proprietaryTechnology), weight: 0.3 },
    { value: normalizePercentage(f.technicalComplexity, 100), weight: 0.3 },
  ]);
  track("proprietaryAlgorithms", f.proprietaryAlgorithms != null);
  track("proprietaryTechnology", f.proprietaryTechnology != null);
  track("technicalComplexity", f.technicalComplexity != null);

  const dataMoat = normalizePercentage(f.proprietaryDatasets, 3);
  track("proprietaryDatasets", f.proprietaryDatasets != null);

  const evidence = weightedAverage([
    { value: normalizePercentage(f.peerReviewedPublications, 10), weight: 0.35 },
    { value: boolScore(f.clinicalValidation), weight: 0.25 },
    { value: boolScore(f.clinicalData), weight: 0.2 },
    { value: normalizePercentage(f.technologyReadinessLevel, 9), weight: 0.2 },
  ]);
  track("peerReviewedPublications", f.peerReviewedPublications != null);
  track("clinicalValidation", f.clinicalValidation != null);
  track("clinicalData", f.clinicalData != null);
  track("technologyReadinessLevel", f.technologyReadinessLevel != null);

  const replicationDifficulty = normalizePercentage(f.replicationDifficulty, 100);
  track("replicationDifficulty", f.replicationDifficulty != null);

  const { value, coverage } = weightedAverage([
    { value: ipStrength.value, weight: 0.25 },
    { value: uniqueness.value, weight: 0.25 },
    { value: dataMoat, weight: 0.2 },
    { value: evidence.value, weight: 0.2 },
    { value: replicationDifficulty, weight: 0.1 },
  ]);

  const reason =
    value == null
      ? "No structured technology or IP data has been reported for this company yet."
      : ipStrength.value != null
        ? "Based on reported IP position and technology differentiation."
        : "Based on the technology signals currently reported.";

  return { score: value, confidence: coverage, reason, inputsUsed: used, missingInputs: missing };
}
