import { average, clampConfidence, clampScore, normalizeExperience, normalizeGrowthRate, normalizeMarketSize, normalizePercentage, normalizeRegulatoryStage, normalizeRunway, weightedAverage } from "./scoring.utils";

describe("scoring.utils", () => {
  describe("clampScore / clampConfidence", () => {
    it("never returns NaN or Infinity, and always stays within bounds", () => {
      for (const bad of [NaN, Infinity, -Infinity, -50, 5000]) {
        expect(Number.isFinite(clampScore(bad))).toBe(true);
        expect(clampScore(bad)).toBeGreaterThanOrEqual(0);
        expect(clampScore(bad)).toBeLessThanOrEqual(10);
        expect(Number.isFinite(clampConfidence(bad))).toBe(true);
        expect(clampConfidence(bad)).toBeGreaterThanOrEqual(0);
        expect(clampConfidence(bad)).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("normalizePercentage / normalizeGrowthRate", () => {
    it("returns null for missing or invalid input, never a guessed value", () => {
      expect(normalizePercentage(null, 100)).toBeNull();
      expect(normalizePercentage(undefined, 100)).toBeNull();
      expect(normalizePercentage(NaN, 100)).toBeNull();
      expect(normalizePercentage(5, 0)).toBeNull();
      expect(normalizePercentage(5, -10)).toBeNull();
    });
    it("clamps negative values to 0 rather than going negative", () => {
      expect(normalizeGrowthRate(-50, 100)).toBe(0);
    });
    it("saturates at the configured cap", () => {
      expect(normalizePercentage(1000, 100)).toBe(10);
      expect(normalizePercentage(50, 100)).toBe(5);
    });
  });

  describe("normalizeRunway / normalizeExperience", () => {
    it("null in, null out", () => {
      expect(normalizeRunway(null)).toBeNull();
      expect(normalizeExperience(undefined)).toBeNull();
    });
    it("never goes negative for a negative runway/experience", () => {
      expect(normalizeRunway(-5)).toBe(0);
      expect(normalizeExperience(-5)).toBe(0);
    });
  });

  describe("normalizeRegulatoryStage", () => {
    it("maps a 0-based stage index across a ladder length to 0-10", () => {
      expect(normalizeRegulatoryStage(0, 9)).toBe(0);
      expect(normalizeRegulatoryStage(8, 9)).toBe(10);
      expect(normalizeRegulatoryStage(4, 9)).toBeCloseTo(5, 0);
    });
    it("returns null for a negative index or a degenerate ladder", () => {
      expect(normalizeRegulatoryStage(-1, 9)).toBeNull();
      expect(normalizeRegulatoryStage(2, 1)).toBeNull();
      expect(normalizeRegulatoryStage(null, 9)).toBeNull();
    });
  });

  describe("normalizeMarketSize", () => {
    it("parses clean numeric input", () => {
      expect(normalizeMarketSize(10e9, 10e9)).toBeCloseTo(10, 5);
    });
    it("parses common unit strings without guessing", () => {
      expect(normalizeMarketSize("SAR 500M", 10e9)).not.toBeNull();
      expect(normalizeMarketSize("$2B", 10e9)).not.toBeNull();
      expect(normalizeMarketSize("USD 1.2 million", 10e9)).not.toBeNull();
    });
    it("returns null for ambiguous or unrecognized text rather than guessing", () => {
      expect(normalizeMarketSize("large and growing")).toBeNull();
      expect(normalizeMarketSize("TBD")).toBeNull();
      expect(normalizeMarketSize("")).toBeNull();
      expect(normalizeMarketSize(null)).toBeNull();
      expect(normalizeMarketSize(-5)).toBeNull();
    });
    it("a bigger market scores higher than a smaller one (log scale, not linear)", () => {
      const small = normalizeMarketSize("SAR 10M", 10e9)!;
      const big = normalizeMarketSize("SAR 5B", 10e9)!;
      expect(big).toBeGreaterThan(small);
    });
    it("an unrecognized unit word is not guessed at", () => {
      expect(normalizeMarketSize("USD 999 trillion")).toBeNull();
    });
    it("an extreme outlier clamps at 10, never overflows", () => {
      expect(normalizeMarketSize(1e18, 10e9)).toBe(10);
    });
  });

  describe("average / weightedAverage", () => {
    it("average of an empty list is null, never NaN", () => {
      expect(average([])).toBeNull();
    });
    it("weightedAverage with no present values is null with zero coverage", () => {
      const r = weightedAverage([{ value: null, weight: 1 }, { value: null, weight: 1 }]);
      expect(r.value).toBeNull();
      expect(r.coverage).toBe(0);
    });
    it("re-normalizes weights across only the present values, never treating a missing one as 0", () => {
      const r = weightedAverage([{ value: 10, weight: 0.5 }, { value: null, weight: 0.5 }]);
      expect(r.value).toBe(10); // not 5, which is what treating the missing half as 0 would give
      expect(r.coverage).toBeCloseTo(0.5, 5);
    });
    it("full coverage when every part is present", () => {
      const r = weightedAverage([{ value: 8, weight: 0.6 }, { value: 4, weight: 0.4 }]);
      expect(r.value).toBeCloseTo(6.4, 5);
      expect(r.coverage).toBe(1);
    });
  });
});
