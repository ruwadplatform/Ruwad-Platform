/** Hand-rolled name/domain normalization + fuzzy matching — no npm
 * dependency, matching this monorepo's zero-unnecessary-dependency
 * convention (see ml-dataset-export.service.ts's rowsToCsv() comment).
 * Used ONLY to rank candidates for admin review; a fuzzy match is never
 * applied automatically (see StartupIdentityMatchingService). */

/** Lowercase, strip accents, collapse legal suffixes/punctuation/whitespace
 * — "Linus Bio Inc." and "LinusBio" both normalize toward "linus bio",
 * "Linus Biotechnology" does not (a real different name, correctly still
 * distinguishable at the fuzzy-match tier below). */
export function normalizeCompanyName(name: string): string {
  return name
    .normalize("NFKD").replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\b(inc|incorporated|ltd|limited|llc|co|corp|corporation|company|holding|holdings|group|plc)\b\.?/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDomain(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0];
  return s;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** 1.0 = identical, 0.0 = completely different — normalized edit distance
 * over the longer string's length. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - levenshtein(na, nb) / maxLen;
}
