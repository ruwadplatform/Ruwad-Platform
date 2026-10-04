import type { FactorResult, ScoringFeatureKey, ScoringFeatures } from "../scoring.types";
import { normalizeGrowthRate, normalizePercentage, weightedAverage } from "../scoring.utils";

/** Growth Momentum — Revenue Growth 40% / Customer-User Growth 30% /
 * Partnership Growth 20% / Expansion 10%. Every rate is read directly from
 * a reported figure or derived from two reported figures (current vs
 * previous) — never inferred from free text. */
export function scoreGrowth(f: ScoringFeatures): FactorResult {
  const used: ScoringFeatureKey[] = [];
  const missing: ScoringFeatureKey[] = [];

  const track = (key: ScoringFeatureKey, has: boolean) => (has ? used.push(key) : missing.push(key));

  // Revenue growth: prefer the directly-reported quarterly rate; fall back to deriving one from two annual figures.
  let revenueGrowth = normalizeGrowthRate(f.quarterlyRevenueGrowth, 30);
  track("quarterlyRevenueGrowth", f.quarterlyRevenueGrowth != null);
  if (revenueGrowth == null && f.annualRevenue != null && f.previousAnnualRevenue) {
    revenueGrowth = normalizeGrowthRate(((f.annualRevenue - f.previousAnnualRevenue) / f.previousAnnualRevenue) * 100, 100);
    track("annualRevenue", true);
    track("previousAnnualRevenue", true);
  } else {
    track("annualRevenue", false);
    track("previousAnnualRevenue", false);
  }

  // Customer/user growth: prefer the reported rate; fall back to deriving one from two customer counts; else user growth.
  let customerGrowth = normalizeGrowthRate(f.customerGrowthRate, 100);
  track("customerGrowthRate", f.customerGrowthRate != null);
  if (customerGrowth == null && f.customerCount != null && f.previousCustomerCount) {
    customerGrowth = normalizeGrowthRate(((f.customerCount - f.previousCustomerCount) / f.previousCustomerCount) * 100, 100);
    track("customerCount", true);
    track("previousCustomerCount", true);
  } else {
    track("customerCount", false);
    track("previousCustomerCount", false);
  }
  if (customerGrowth == null) {
    customerGrowth = normalizeGrowthRate(f.userGrowthRate, 100);
    track("userGrowthRate", f.userGrowthRate != null);
  }

  const partnershipGrowth = normalizeGrowthRate(f.partnershipGrowth, 100);
  track("partnershipGrowth", f.partnershipGrowth != null);

  const expansion = weightedAverage([
    { value: normalizePercentage(f.geographicExpansion, 5), weight: 0.7 },
    { value: normalizeGrowthRate(f.employeeGrowth, 100), weight: 0.3 },
  ]);
  track("geographicExpansion", f.geographicExpansion != null);
  track("employeeGrowth", f.employeeGrowth != null);

  const { value, coverage } = weightedAverage([
    { value: revenueGrowth, weight: 0.4 },
    { value: customerGrowth, weight: 0.3 },
    { value: partnershipGrowth, weight: 0.2 },
    { value: expansion.value, weight: 0.1 },
  ]);

  const reason =
    value == null
      ? "No structured growth data has been reported for this company yet."
      : revenueGrowth != null && customerGrowth != null
        ? "Reported revenue and customer growth over the latest periods."
        : revenueGrowth != null
          ? "Reported revenue growth over the latest periods; other growth signals are not yet reported."
          : "Reported growth signals are limited to customer, partnership or expansion data; revenue growth is not yet reported.";

  return { score: value, confidence: coverage, reason, inputsUsed: used, missingInputs: missing };
}
