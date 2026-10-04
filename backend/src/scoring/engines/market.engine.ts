import type { Startup } from "../../startups/startup.entity";
import type { FactorResult, ScoringFeatureKey, ScoringFeatures } from "../scoring.types";
import { normalizeGrowthRate, normalizeMarketSize, normalizePercentage, weightedAverage } from "../scoring.utils";

/** Market Potential — TAM Attractiveness 25% / SAM Attractiveness 20% /
 * Market Growth 20% / Competitive Environment 15% / Saudi-MENA Opportunity
 * 20%. TAM/SAM fall back to the startup's own free-text marketTam/marketSam
 * fields (already collected in the wizard today) through the strict parser
 * in scoring.utils — never a blind parseFloat on arbitrary text.
 *
 * Unit assumptions, since these are unlabeled numeric inputs: `competitionLevel`
 * is 0-100 where HIGHER means MORE competitive pressure (worse for the
 * company, hence inverted below); `categoryTailwinds` is 0-100 where higher
 * is more favorable. */
export function scoreMarket(f: ScoringFeatures, startup: Startup): FactorResult {
  const used: ScoringFeatureKey[] = [];
  const missing: ScoringFeatureKey[] = [];
  const track = (key: ScoringFeatureKey, has: boolean) => (has ? used.push(key) : missing.push(key));

  const tam = normalizeMarketSize(f.tam) ?? normalizeMarketSize(startup.marketTam, 10e9);
  track("tam", f.tam != null || tam != null);
  const sam = normalizeMarketSize(f.sam) ?? normalizeMarketSize(startup.marketSam, 2e9);
  track("sam", f.sam != null || sam != null);
  // SOM isn't weighted directly per the spec's five named dimensions, but is
  // tracked as a used/missing input so the reason/confidence still reflect it.
  const som = normalizeMarketSize(f.som) ?? normalizeMarketSize(startup.marketSom, 500e6);
  track("som", f.som != null || som != null);

  const marketGrowth = weightedAverage([
    { value: normalizeGrowthRate(f.marketGrowthRate, 30), weight: 0.5 },
    { value: normalizeGrowthRate(f.cagr, 30), weight: 0.5 },
  ]);
  track("marketGrowthRate", f.marketGrowthRate != null);
  track("cagr", f.cagr != null);

  const competitive = f.competitionLevel != null ? (() => { const raw = normalizePercentage(f.competitionLevel, 100); return raw == null ? null : 10 - raw; })() : null;
  track("competitionLevel", f.competitionLevel != null);

  const regionalOpportunity = weightedAverage([
    { value: normalizeMarketSize(f.saudiMarketOpportunity, 5e9), weight: 0.4 },
    { value: normalizeMarketSize(f.menaMarketOpportunity, 5e9), weight: 0.3 },
    { value: normalizePercentage(f.categoryTailwinds, 100), weight: 0.3 },
  ]);
  track("saudiMarketOpportunity", f.saudiMarketOpportunity != null);
  track("menaMarketOpportunity", f.menaMarketOpportunity != null);
  track("categoryTailwinds", f.categoryTailwinds != null);
  track("geographicReach", f.geographicReach != null);

  const { value, coverage } = weightedAverage([
    { value: tam, weight: 0.25 },
    { value: sam, weight: 0.2 },
    { value: marketGrowth.value, weight: 0.2 },
    { value: competitive, weight: 0.15 },
    { value: regionalOpportunity.value, weight: 0.2 },
  ]);

  const reason =
    value == null
      ? "No structured market-size or growth data has been reported for this company yet."
      : tam != null
        ? "Based on the reported or stated addressable market size and growth."
        : "Based on the market signals currently reported.";

  return { score: value, confidence: coverage, reason, inputsUsed: used, missingInputs: missing };
}
