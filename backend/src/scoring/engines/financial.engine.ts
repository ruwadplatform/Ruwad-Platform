import type { Startup } from "../../startups/startup.entity";
import type { FactorResult, ScoringFeatureKey, ScoringFeatures } from "../scoring.types";
import { normalizePercentage, normalizeRunway, weightedAverage } from "../scoring.utils";

/** Financial Strength — Runway 30% / Burn Efficiency 25% / Revenue Quality
 * 20% / Funding Strength 15% / Capital Diversity 10%. Funding Strength
 * falls back to the startup's own `fundingTotal` column (SAR millions,
 * already collected today) when no richer `totalFundingRaised` feature has
 * been reported — the one dimension with real signal for every startup on
 * the platform already. */
export function scoreFinancial(f: ScoringFeatures, startup: Startup): FactorResult {
  const used: ScoringFeatureKey[] = [];
  const missing: ScoringFeatureKey[] = [];
  const track = (key: ScoringFeatureKey, has: boolean) => (has ? used.push(key) : missing.push(key));

  let runway = normalizeRunway(f.runwayMonths);
  track("runwayMonths", f.runwayMonths != null);
  if (runway == null && f.cashAvailable != null && f.monthlyBurn) {
    runway = normalizeRunway(f.cashAvailable / f.monthlyBurn);
    track("cashAvailable", true);
    track("monthlyBurn", true);
  } else {
    track("cashAvailable", false);
    track("monthlyBurn", false);
  }

  // Burn multiple: lower is better (net burn per unit of net-new ARR), so this is an inverted scale.
  let burnEfficiency: number | null = null;
  if (f.burnMultiple != null) {
    const raw = normalizePercentage(f.burnMultiple, 5);
    burnEfficiency = raw == null ? null : 10 - raw;
    used.push("burnMultiple");
  } else missing.push("burnMultiple");

  const revenueQuality = weightedAverage([
    { value: normalizePercentage(f.grossMargin, 80), weight: 0.5 },
    { value: f.recurringRevenue != null && f.annualRevenue ? normalizePercentage((f.recurringRevenue / f.annualRevenue) * 100, 100) : null, weight: 0.5 },
  ]);
  track("grossMargin", f.grossMargin != null);
  track("recurringRevenue", f.recurringRevenue != null);
  track("annualRevenue", f.annualRevenue != null || used.includes("annualRevenue"));

  let fundingStrength = normalizePercentage(f.totalFundingRaised, 50_000_000);
  track("totalFundingRaised", f.totalFundingRaised != null);
  if (fundingStrength == null && Number(startup.fundingTotal) > 0) {
    // startup.fundingTotal is stored in SAR millions — 50 (SAR 50M) is calibrated
    // against real rounds already on RUWĀD, not an arbitrary guess.
    fundingStrength = normalizePercentage(Number(startup.fundingTotal), 50);
  }

  const capitalDiversity = weightedAverage([
    { value: normalizePercentage(f.investorCount, 5), weight: 0.6 },
    { value: normalizePercentage(f.fundingRounds, 4), weight: 0.4 },
  ]);
  track("investorCount", f.investorCount != null);
  track("fundingRounds", f.fundingRounds != null);

  const { value, coverage } = weightedAverage([
    { value: runway, weight: 0.3 },
    { value: burnEfficiency, weight: 0.25 },
    { value: revenueQuality.value, weight: 0.2 },
    { value: fundingStrength, weight: 0.15 },
    { value: capitalDiversity.value, weight: 0.1 },
  ]);

  const reason =
    value == null
      ? "No structured financial data has been reported for this company yet."
      : runway != null && burnEfficiency != null
        ? "Reported runway and burn efficiency, supported by funding data."
        : fundingStrength != null
          ? "Based on recorded funding; runway and burn data are not yet reported."
          : "Based on the financial signals currently reported.";

  return { score: value, confidence: coverage, reason, inputsUsed: used, missingInputs: missing };
}
