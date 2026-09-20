import {
  BLOCKED_HOSTS, CITY_KEYWORDS, COUNTRY_KEYWORDS, EVENT_AGGREGATOR_HOSTS, EVENT_TERMS, HEALTH_TERMS, NEGATIVE_HEALTH_CONTEXT,
  REGION_KEYWORDS, TLD_COUNTRY, type EventTypeName, type NewsCategory,
} from "./content-config";

/* ------------------------------------------------------------------- urls */
const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|igshid$|ref$|ref_src$|cmpid$|_ga$|ocid$|spm$)/i;

export function parseHttpUrl(raw: string | undefined | null): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch { return null; }
}

export function hostOf(raw: string): string {
  const u = parseHttpUrl(raw);
  return u ? u.hostname.toLowerCase().replace(/^www\./, "") : "";
}

/** Canonical form used to recognise the same page across tracking params,
 * www/amp variants, fragments and trailing slashes. */
export function normalizeUrl(raw: string | undefined | null): string | null {
  const u = parseHttpUrl(raw);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  let path = u.pathname.replace(/\/amp\/?$/i, "").replace(/\/+$/, "");
  if (path === "") path = "";
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.test(k)).sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? "?" + params.map(([k, v]) => `${k}=${v}`).join("&") : "";
  return `${host}${path}${query}`.slice(0, 500);
}

const hostMatches = (host: string, list: string[]) => list.some((h) => host === h || host.endsWith("." + h));
export const isBlockedHost = (raw: string) => hostMatches(hostOf(raw), BLOCKED_HOSTS);
export const isAggregatorHost = (raw: string) => hostMatches(hostOf(raw), EVENT_AGGREGATOR_HOSTS);

/* ----------------------------------------------------------------- titles */
export function normalizeTitle(title: string): string {
  let t = title.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  // Google-style "Headline - Publisher" suffix
  t = t.replace(/\s[-|–—]\s[^-|–—]{2,40}$/, "");
  return t.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

/** Event titles come from page markup: decode entities, and drop a trailing
 * "| 14-16 December 2026, Riyadh" style date/place tail that isn't part of the name. */
export function cleanEventTitle(raw: string): string {
  const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "-", mdash: "-", rsquo: "'", lsquo: "'" };
  const t = raw
    .replace(/&#(\d+);/g, (_m, n) => { const c = Number(n); return c === 8211 || c === 8212 ? "-" : c === 8217 || c === 8216 ? "'" : String.fromCodePoint(c); })
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ").trim();
  // Only a "|" or a spaced dash starts the tail, so the hyphen inside "14-16" is never treated as a separator.
  const cut = t.replace(/\s*\|\s*[^|]*\b(19|20)\d{2}\b[^|]*$|\s+[–—-]\s+[^–—-]*\b(19|20)\d{2}\b[^–—-]*$/, "").trim();
  return cut.length >= 8 ? cut : t;
}

export function isSameEvent(a: { startDate: string; endDate: string; nameKey: string; city: string | null; country: string; host: string; aggregator: boolean }, b: typeof a): boolean {
  const sim = tokenSimilarity(a.nameKey, b.nameKey);
  if (a.startDate === b.startDate && (a.nameKey === b.nameKey || sim >= 0.8)) return true;
  const sameRange = a.startDate === b.startDate && a.endDate === b.endDate && a.country === b.country;
  const ca = (a.city ?? "").toLowerCase(), cb = (b.city ?? "").toLowerCase();
  const sameCity = !ca || !cb || ca.includes(cb) || cb.includes(ca); // "Malham, Riyadh" is Riyadh
  // The same fair listed under several names/pages: identical dates and place, and either one site or overlapping names.
  // A listing site's entry at the same place and dates is the organizer's event, not a second one.
  if (sameRange && sameCity && (a.host === b.host || sim >= 0.5 || a.aggregator || b.aggregator)) return true;
  // Same event with a one-day disagreement between sources.
  const dayGap = Math.abs(Date.parse(a.startDate) - Date.parse(b.startDate)) / 86400000;
  return dayGap <= 1 && a.country === b.country && sim >= 0.8;
}

/** Name key for events: like normalizeTitle, but also drops the year and
 * generic edition words so "XYZ Summit 2026" and "XYZ Summit" collapse. */
export function normalizeEventName(name: string): string {
  return normalizeTitle(name).replace(/\b(19|20)\d{2}\b/g, " ").replace(/\b\d+(st|nd|rd|th)\b/g, " ").replace(/\b(the|annual|international|edition|th|st|nd|rd)\b/g, " ").replace(/\s+/g, " ").trim();
}

export function tokenSimilarity(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean)), B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

/* --------------------------------------------------------------- relevance */
const containsTerm = (text: string, term: string) => new RegExp(`(^|[^\\p{L}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "iu").test(text);

export function isHealthcareRelevant(title: string, snippet = ""): boolean {
  const text = `${title} ${snippet}`;
  if (NEGATIVE_HEALTH_CONTEXT.test(text) && !containsTerm(text, "hospital") && !containsTerm(text, "medical")) return false;
  const inTitle = HEALTH_TERMS.some((t) => containsTerm(title, t));
  if (inTitle) return true;
  // Snippet-only matches need two different health terms (one stray word isn't enough).
  return HEALTH_TERMS.filter((t) => containsTerm(snippet, t)).length >= 2;
}

export function looksLikeEvent(text: string): boolean {
  return EVENT_TERMS.some((t) => containsTerm(text, t));
}

/** Best country (or region label) for a piece of text + its URL, or null. */
export function detectCountry(text: string, url = ""): string | null {
  const lower = text.toLowerCase();
  const scores = new Map<string, number>();
  for (const [country, words] of Object.entries(COUNTRY_KEYWORDS)) {
    let s = 0;
    for (const w of words) if (new RegExp(`(^|[^\\p{L}])${w.replace(/ /g, "\\s+")}([^\\p{L}]|$)`, "iu").test(lower)) s += w.length > 4 ? 2 : 1;
    if (s) scores.set(country, s);
  }
  const tld = hostOf(url).split(".").pop() ?? "";
  if (TLD_COUNTRY[tld]) scores.set(TLD_COUNTRY[tld], (scores.get(TLD_COUNTRY[tld]) ?? 0) + 1);
  if (scores.size) return [...scores.entries()].sort((a, b) => b[1] - a[1])[0][0];
  for (const [label, words] of Object.entries(REGION_KEYWORDS)) {
    if (words.some((w) => new RegExp(`(^|[^\\p{L}])${w.replace(/ /g, "\\s+")}([^\\p{L}]|$)`, "iu").test(lower))) return label;
  }
  return null;
}

export function detectCity(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [k, v] of Object.entries(CITY_KEYWORDS)) if (new RegExp(`(^|[^\\p{L}])${k}([^\\p{L}]|$)`, "iu").test(lower)) return v;
  return null;
}

const CATEGORY_RULES: [NewsCategory, RegExp][] = [
  ["Healthcare Investment", /\b(raises?|raised|funding|invests?|invested|investment|investors?|series\s[a-d]|seed round|venture capital|acquir(es?|ed|ition)|ipo)\b/i],
  ["AI Healthcare", /\b(ai|a\.i\.|artificial intelligence|machine learning|generative|llm|deep learning)\b/i],
  ["Genomics", /\b(genom\w*|genetic\w*|dna|gene\b|crispr|sequencing)\b/i],
  ["Precision Medicine", /precision (medicine|health)|personali[sz]ed (medicine|treatment)/i],
  ["Diagnostics", /\b(diagnos\w*|imaging|radiolog\w*|screening|biomarker|lab test\w*)\b/i],
  ["Medical Devices", /medical device|implant|wearable|surgical robot|stent|pacemaker|prosthe/i],
  ["MedTech", /\b(medtech|medical technolog\w*)\b/i],
  ["Digital Health", /digital health|telehealth|telemedicine|e-?health|health ?tech|electronic (health|medical) record|virtual care|health app/i],
  ["Biotechnology", /biotech\w*|bioscience|biologics?|cell therapy|gene therapy|biomanufactur\w*|biopharma/i],
  ["Pharmaceuticals", /pharma\w*|\bdrugs?\b|vaccine|therapeutic|medication|generic medicine/i],
  ["Research", /\b(research\w*|study|studies|scientists?|clinical trial\w*|journal|university|discover\w*)\b/i],
];
export function classifyNews(title: string, snippet = ""): NewsCategory {
  const text = `${title} ${snippet}`;
  for (const [cat, re] of CATEGORY_RULES) if (re.test(text)) return cat;
  return "Healthcare";
}

const TYPE_RULES: [EventTypeName, RegExp][] = [
  ["Hackathon", /hackathon|hackfest/i],
  ["Startup Competition", /(startup|pitch|innovation) (competition|challenge|contest|day)|demo day|pitch (day|competition|battle)|accelerator (demo|showcase)|awards?\b/i],
  ["Webinar", /webinar|online (session|event)|virtual (event|session)/i],
  ["Workshop", /workshop|masterclass|boot ?camp|training (program|course)/i],
  ["Investor Event", /investor|investment (forum|summit|conference)|venture (forum|summit)|funding forum|family office/i],
  ["Exhibition", /expo\b|exhibition|trade ?show|trade fair|medical fair/i],
  ["Research Event", /symposium|research (conference|forum|meeting)|scientific (meeting|conference)|academic conference/i],
  ["Networking Event", /networking|meet-?up|mixer|roundtable/i],
  ["Summit", /summit/i],
  ["Conference", /conference|congress|forum|convention/i],
];
export function classifyEventType(text: string): EventTypeName {
  for (const [t, re] of TYPE_RULES) if (re.test(text)) return t;
  return "Conference";
}

/* ---------------------------------------------------------------- dates */
const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const MONTH_RE = "(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)";
const SEP = "\\s*(?:-|–|—|to|until|through)\\s*";

export const isoDate = (y: number, m: number, d: number): string | null => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};
export const todayIso = (now = new Date()) => now.toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

/** Publication date of a news result. Serper gives relative ("3 days ago")
 * or absolute ("Sep 18, 2026") strings; anything else returns null so the
 * article isn't dated by guesswork. */
export function parsePublishedDate(raw: string | undefined | null, now = new Date()): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  const today = todayIso(now);
  let m = s.match(/^(\d+|an?)\s+(second|minute|hour)s?\s+ago$/);
  if (m) return today;
  m = s.match(/^(\d+|an?)\s+(day|week|month|year)s?\s+ago$/);
  if (m) {
    const n = m[1].startsWith("a") ? 1 : Number(m[1]);
    const days = { day: 1, week: 7, month: 30, year: 365 }[m[2] as "day" | "week" | "month" | "year"];
    return addDays(today, -n * days);
  }
  if (s === "yesterday") return addDays(today, -1);
  if (s === "today") return today;
  m = s.match(new RegExp(`^${MONTH_RE}\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})$`));
  if (m) return isoDate(Number(m[3]), MONTHS[m[1]], Number(m[2]));
  m = s.match(new RegExp(`^(\\d{1,2})\\s+${MONTH_RE}\\.?,?\\s+(\\d{4})$`));
  if (m) return isoDate(Number(m[3]), MONTHS[m[2]], Number(m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

export interface DateRange { start: string; end: string }

/** Every explicit-year date or range found in the text (deduplicated). Only
 * formats that spell out the year are recognised, so "20-22 October" alone
 * is never turned into a date. */
export function findDateRanges(text: string): DateRange[] {
  const found = new Map<string, DateRange>();
  const add = (start: string | null, end: string | null) => { if (start && end) found.set(start + "|" + end, { start, end }); };
  const t = text.replace(/&nbsp;/g, " ").replace(/(\d)(st|nd|rd|th)\b/gi, "$1");
  let m: RegExpExecArray | null;
  // 20-22 September 2026
  let re = new RegExp(`\\b(\\d{1,2})${SEP}(\\d{1,2})\\s+${MONTH_RE}\\.?,?\\s+(\\d{4})\\b`, "gi");
  while ((m = re.exec(t))) add(isoDate(+m[4], MONTHS[m[3].toLowerCase()], +m[1]), isoDate(+m[4], MONTHS[m[3].toLowerCase()], +m[2]));
  // 28 September - 2 October 2026
  re = new RegExp(`\\b(\\d{1,2})\\s+${MONTH_RE}\\.?${SEP}(\\d{1,2})\\s+${MONTH_RE}\\.?,?\\s+(\\d{4})\\b`, "gi");
  while ((m = re.exec(t))) add(isoDate(+m[5], MONTHS[m[2].toLowerCase()], +m[1]), isoDate(+m[5], MONTHS[m[4].toLowerCase()], +m[3]));
  // September 20-22, 2026
  re = new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})${SEP}(\\d{1,2}),?\\s+(\\d{4})\\b`, "gi");
  while ((m = re.exec(t))) add(isoDate(+m[4], MONTHS[m[1].toLowerCase()], +m[2]), isoDate(+m[4], MONTHS[m[1].toLowerCase()], +m[3]));
  // September 28 - October 2, 2026
  re = new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})${SEP}${MONTH_RE}\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, "gi");
  while ((m = re.exec(t))) add(isoDate(+m[5], MONTHS[m[1].toLowerCase()], +m[2]), isoDate(+m[5], MONTHS[m[3].toLowerCase()], +m[4]));
  // 15 October 2026  /  October 15, 2026 (single day) — skipped if part of a range already found
  re = new RegExp(`\\b(\\d{1,2})\\s+${MONTH_RE}\\.?,?\\s+(\\d{4})\\b`, "gi");
  while ((m = re.exec(t))) { const d = isoDate(+m[3], MONTHS[m[2].toLowerCase()], +m[1]); add(d, d); }
  re = new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, "gi");
  while ((m = re.exec(t))) { const d = isoDate(+m[3], MONTHS[m[1].toLowerCase()], +m[2]); add(d, d); }
  // 2026-10-15 [/ 2026-10-17]
  re = /\b(\d{4})-(\d{2})-(\d{2})(?:\s*(?:\/|to|-|–)\s*(\d{4})-(\d{2})-(\d{2}))?\b/g;
  while ((m = re.exec(t))) { const s = isoDate(+m[1], +m[2], +m[3]); add(s, m[4] ? isoDate(+m[4], +m[5], +m[6]) : s); }

  // A single day that is simply an endpoint of a found range isn't a separate date.
  const all = [...found.values()];
  return all.filter((r) => !(r.start === r.end && all.some((o) => o !== r && o.start !== o.end && (o.start === r.start || o.end === r.start))));
}

/** Plausibility rules for an event date range (also applied to structured data). */
export function isPlausibleRange(r: DateRange, now = new Date()): boolean {
  if (r.end < r.start) return false;
  const span = (Date.parse(r.end) - Date.parse(r.start)) / 86_400_000;
  if (span > 31) return false;
  const today = todayIso(now);
  return r.start >= addDays(today, -400) && r.start <= addDays(today, 800);
}

/** The one unambiguous range in the text, else null (several different dates
 * — registration deadlines, prior editions — mean we can't tell). */
export function extractSingleRange(text: string, now = new Date()): DateRange | null {
  const ranges = findDateRanges(text).filter((r) => isPlausibleRange(r, now));
  return ranges.length === 1 ? ranges[0] : null;
}

export type EventStatus = "ONGOING" | "UPCOMING" | "PAST";
export function eventStatus(start: string, end: string | null | undefined, now = new Date()): EventStatus {
  const today = todayIso(now);
  const e = end ?? start;
  if (e < today) return "PAST";
  if (start > today) return "UPCOMING";
  return "ONGOING";
}
