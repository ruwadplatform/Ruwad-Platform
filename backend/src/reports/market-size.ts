import type { ExternalSource, MarketSize, MarketSizeClaim } from "./report-types";

export const MARKET_SIZE_NOT_IDENTIFIED = "Reliable market-size data was not identified from the available sources.";

/** Only sources of at least "established news" strength can back a market-size figure (government, official,
 * international, consulting, news). Industry publications and anything else never do. */
const MAX_TIER = 5;
const SAUDI = /\b(saudi|ksa|kingdom of saudi)\b/i;
const MARKET_WORD = /\bmarket\b/i;
/** The sentence must talk about the size/value of a market, not about a funding round or an acquisition. */
const SIZE_CONTEXT = /market[^.]{0,80}\b(size|value|worth|valued|revenue|reach|reached|grow|grew|expected|projected|estimated|stood|generated|was|is|to be)\b|\b(size|value|worth|valued)\b[^.]{0,60}market/i;
const NOT_A_MARKET_SIZE = /\b(raised|raises|funding round|series [a-e]|seed round|acquire[sd]?|acquisition|invested in|investment of)\b/i;
const PROJECTION = /\b(by|to reach|projected|projection|forecast|expected|estimated|will|is set to|poised)\b/i;

const CURRENCY = "(USD|US\\$|\\$|SAR|SR|EUR|€|GBP|£)";
const SCALE = "(trillion|billion|million|tn|bn|mn|b|m)";
const NUMBER = "(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)";
const AMOUNT_A = new RegExp(`${CURRENCY}\\s?${NUMBER}\\s?${SCALE}?\\b`, "gi"); // "USD 5.2 billion", "$5.2bn"
const AMOUNT_B = new RegExp(`${NUMBER}\\s?${SCALE}\\s?(?:in\\s)?(USD|SAR|EUR|GBP|dollars|riyals)\\b`, "gi"); // "5.2 billion USD"
const YEAR = /\b(20[1-4]\d)\b/g;

const CURRENCY_NAME: Record<string, string> = { usd: "USD", "us$": "USD", $: "USD", dollars: "USD", sar: "SAR", sr: "SAR", riyals: "SAR", eur: "EUR", "€": "EUR", gbp: "GBP", "£": "GBP" };
const SCALE_NAME: Record<string, string> = { trillion: "trillion", tn: "trillion", billion: "billion", bn: "billion", b: "billion", million: "million", mn: "million", m: "million" };

interface RawAmount { index: number; currency: string; number: string; scale: string | null }

function amountsIn(sentence: string): RawAmount[] {
  const out: RawAmount[] = [];
  for (const m of sentence.matchAll(AMOUNT_A)) out.push({ index: m.index ?? 0, currency: m[1], number: m[2], scale: m[3] ?? null });
  for (const m of sentence.matchAll(AMOUNT_B)) out.push({ index: m.index ?? 0, currency: m[3], number: m[1], scale: m[2] });
  return out;
}

const cleanQuote = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 300);

/** Looks for a market-size statement in the stored source text. A figure is kept ONLY when the same sentence gives a
 * currency, a scale-bearing amount, a year and a Saudi geography, and the source is credible. Nothing is estimated,
 * converted or combined: what comes out is the source's own statement, attributed to it. */
export function extractMarketSize(sources: ExternalSource[]): MarketSize {
  const claims: (MarketSizeClaim & { tier: number })[] = [];
  const seen = new Set<string>();

  // Strongest sources first, so when two sources state the same figure the stronger one is the one credited.
  for (const src of [...sources].sort((a, b) => a.tier - b.tier)) {
    if (src.tier > MAX_TIER) continue;
    const text = `${src.title}. ${src.snippet}`;
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      if (!MARKET_WORD.test(sentence) || !SIZE_CONTEXT.test(sentence) || NOT_A_MARKET_SIZE.test(sentence)) continue;
      if (!SAUDI.test(sentence)) continue;
      const years = [...sentence.matchAll(YEAR)].map((m) => ({ year: Number(m[1]), index: m.index ?? 0 }));
      if (!years.length) continue;
      for (const a of amountsIn(sentence)) {
        const scale = a.scale ? SCALE_NAME[a.scale.toLowerCase()] : null;
        if (!scale) continue; // a bare number with no scale is not a market size
        const currency = CURRENCY_NAME[a.currency.toLowerCase()];
        if (!currency) continue;
        const nearest = years.reduce((best, y) => (Math.abs(y.index - a.index) < Math.abs(best.index - a.index) ? y : best));
        const before = sentence.slice(Math.max(0, Math.min(a.index, nearest.index) - 40), Math.max(a.index, nearest.index) + 12);
        const claim = {
          amount: `${a.number} ${scale}`, currency, year: nearest.year, geography: "Saudi Arabia",
          basis: (PROJECTION.test(before) || nearest.year > new Date().getFullYear() ? "projected" : "reported") as "reported" | "projected",
          sourceId: src.id, sourceTitle: src.title, url: src.url, domain: src.domain, sourceTypeLabel: src.sourceTypeLabel,
          quote: cleanQuote(sentence), tier: src.tier,
        };
        const key = `${claim.currency}|${claim.amount}|${claim.year}|${claim.basis}`;
        if (seen.has(key)) continue;
        seen.add(key);
        claims.push(claim);
      }
    }
  }

  if (!claims.length) return { status: "notIdentified", message: MARKET_SIZE_NOT_IDENTIFIED };
  claims.sort((a, b) => a.tier - b.tier || b.year - a.year);
  return { status: "found", claims: claims.slice(0, 3).map(({ tier: _tier, ...c }) => c) };
}
