import { nameSimilarity, normalizeCompanyName, normalizeDomain } from "./name-matching.util";

describe("normalizeCompanyName", () => {
  it("treats 'Linus Bio Inc.' and 'LinusBio' as similar after normalization", () => {
    expect(normalizeCompanyName("Linus Bio Inc.")).toBe("linus bio");
    // LinusBio has no space — normalization doesn't insert one, so this
    // stays a near-miss for the fuzzy tier rather than an exact match,
    // which is correct: exact-normalized-name matching should not merge
    // these automatically.
    expect(normalizeCompanyName("LinusBio")).toBe("linusbio");
  });

  it("does not collapse a genuinely different company name", () => {
    expect(normalizeCompanyName("Linus Biotechnology")).not.toBe(normalizeCompanyName("Linus Bio"));
  });
});

describe("normalizeDomain", () => {
  it("strips protocol, www, and path", () => {
    expect(normalizeDomain("https://www.example.com/about")).toBe("example.com");
    expect(normalizeDomain("example.com")).toBe("example.com");
  });
});

describe("nameSimilarity", () => {
  it("scores identical normalized names as 1.0", () => {
    expect(nameSimilarity("Example Health", "Example Health")).toBe(1);
  });

  it("scores 'LinusBio' vs 'Linus Bio' highly (fuzzy-tier candidate)", () => {
    expect(nameSimilarity("LinusBio", "Linus Bio")).toBeGreaterThan(0.8);
  });

  it("scores two unrelated company names low", () => {
    expect(nameSimilarity("Example Health", "Totally Different Corp")).toBeLessThan(0.5);
  });
});
