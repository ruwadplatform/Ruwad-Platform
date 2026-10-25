import { matchesAvailability } from "./advisory-availability.ts";
import type { AdvisorFilters, AdvisorSummary, SortMode } from "./advisory-types.ts";

/** Lower-case, strip diacritics and collapse whitespace so "Al‑Qahtani", "al qahtani" and "AL-QAHTANI" compare alike. */
export function normalize(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, " ").trim();
}

/** Relevance of an advisor to a search query, or 0 if any word of the query matches nowhere (all words must match). Name and specialization
 * count most, then expertise terms and institution, then the one-line expertise text. */
export function searchScore(advisor: AdvisorSummary, query: string): number {
  const words = normalize(query).split(" ").filter(Boolean);
  if (!words.length) return 1;
  const fields: [string, number][] = [
    [normalize(advisor.name), 5],
    [normalize(advisor.specialization), 4],
    [normalize(advisor.expertiseTags.join(" ")), 3],
    [normalize(`${advisor.institution} ${advisor.institutionFull}`), 3],
    [normalize(advisor.expertise), 1],
  ];
  let total = 0;
  for (const w of words) {
    const best = Math.max(0, ...fields.map(([text, weight]) => (text.includes(w) ? weight : 0)));
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

/** Apply search and all four filters together. Returns the advisors in their original order. */
export function filterAdvisors(advisors: AdvisorSummary[], f: AdvisorFilters, now: Date = new Date()): AdvisorSummary[] {
  return advisors.filter(
    (a) =>
      searchScore(a, f.query) > 0 &&
      (!f.specialization || a.specialization === f.specialization) &&
      (!f.institution || a.institution === f.institution) &&
      (!f.consultationType || a.consultationTypes.includes(f.consultationType)) &&
      matchesAvailability(a, f.availability, now),
  );
}

/** "relevance": best search match first when there is a query, otherwise the directory's own order. "experience": most years first (advisors
 * without a number last). Ties keep the directory's own order, so results never jump around. */
export function sortAdvisors(advisors: AdvisorSummary[], mode: SortMode, query: string): AdvisorSummary[] {
  const order = new Map(advisors.map((a, i) => [a.id, i]));
  const byOrder = (a: AdvisorSummary, b: AdvisorSummary) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  const sorted = [...advisors];
  if (mode === "experience") {
    sorted.sort((a, b) => (b.yearsExperience ?? -1) - (a.yearsExperience ?? -1) || byOrder(a, b));
  } else if (normalize(query)) {
    sorted.sort((a, b) => searchScore(b, query) - searchScore(a, query) || byOrder(a, b));
  }
  return sorted;
}

/** The distinct values the dropdowns offer, in the order they first appear. */
export function filterOptions(advisors: AdvisorSummary[]): { specializations: string[]; institutions: string[] } {
  const uniq = (xs: string[]) => [...new Set(xs)];
  return { specializations: uniq(advisors.map((a) => a.specialization)), institutions: uniq(advisors.map((a) => a.institution)) };
}
