import type { FactorResult, ScoringFeatureKey, ScoringFeatures } from "../scoring.types";
import { normalizeExperience, normalizePercentage, weightedAverage } from "../scoring.utils";

/** Team Strength — Founder Experience 25% / Domain Expertise 25% / Team
 * Completeness 20% / Technical Capability 15% / Commercial Capability 15%.
 * `leadershipCompleteness`/`technicalTeamStrength`/`commercialTeamStrength`
 * are treated as already-normalized 0-100 assessment inputs (e.g. from a
 * structured admin/analyst review), distinct from the raw counts also
 * accepted here. */
export function scoreTeam(f: ScoringFeatures): FactorResult {
  const used: ScoringFeatureKey[] = [];
  const missing: ScoringFeatureKey[] = [];
  const track = (key: ScoringFeatureKey, has: boolean) => (has ? used.push(key) : missing.push(key));

  // A reported `false` is real information (no prior startup), so it's used, not missing — just weighted modestly rather than 0.
  const priorExperience = weightedAverage([
    { value: f.previousStartupExperience == null ? null : f.previousStartupExperience ? 10 : 3, weight: 0.5 },
    { value: normalizePercentage(f.previousExits, 2), weight: 0.5 },
  ]);
  track("previousStartupExperience", f.previousStartupExperience != null);
  track("previousExits", f.previousExits != null);
  const founderExperience = weightedAverage([
    { value: normalizeExperience(f.founderExperienceYears, 15), weight: 0.5 },
    { value: priorExperience.value, weight: 0.5 },
  ]);
  track("founderExperienceYears", f.founderExperienceYears != null);
  track("founderCount", f.founderCount != null);

  const domainExpertise = normalizeExperience(f.healthcareExperienceYears, 12);
  track("healthcareExperienceYears", f.healthcareExperienceYears != null);

  const teamCompleteness = weightedAverage([
    { value: normalizePercentage(f.leadershipCompleteness, 100), weight: 0.5 },
    { value: normalizePercentage(f.teamSize, 15), weight: 0.5 },
  ]);
  track("leadershipCompleteness", f.leadershipCompleteness != null);
  track("teamSize", f.teamSize != null);

  const technicalCapability = weightedAverage([
    { value: normalizePercentage(f.technicalTeamStrength, 100), weight: 0.6 },
    { value: normalizeExperience(f.technicalExperienceYears, 12), weight: 0.4 },
  ]);
  track("technicalTeamStrength", f.technicalTeamStrength != null);
  track("technicalExperienceYears", f.technicalExperienceYears != null);

  const commercialCapability = weightedAverage([
    { value: normalizePercentage(f.commercialTeamStrength, 100), weight: 0.6 },
    { value: normalizeExperience(f.commercialExperienceYears, 12), weight: 0.4 },
  ]);
  track("commercialTeamStrength", f.commercialTeamStrength != null);
  track("commercialExperienceYears", f.commercialExperienceYears != null);

  track("publications", f.publications != null);
  track("patents", f.patents != null);

  const { value, coverage } = weightedAverage([
    { value: founderExperience.value, weight: 0.25 },
    { value: domainExpertise, weight: 0.25 },
    { value: teamCompleteness.value, weight: 0.2 },
    { value: technicalCapability.value, weight: 0.15 },
    { value: commercialCapability.value, weight: 0.15 },
  ]);

  const reason =
    value == null
      ? "No structured team-experience data has been reported for this company yet."
      : domainExpertise != null
        ? "Based on reported founder and team experience, including healthcare domain background."
        : "Based on the team signals currently reported.";

  return { score: value, confidence: coverage, reason, inputsUsed: used, missingInputs: missing };
}
