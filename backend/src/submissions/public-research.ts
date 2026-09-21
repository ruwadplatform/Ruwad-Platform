import { parsePublishedDate } from "../content/content-utils";
import type { ResearchItem } from "../content/research.service";
import { isRegulatoryHost, type SourceClass, type SourceType } from "../content/source-quality";

/** Deterministic reading of PUBLIC web evidence about one company. No language model: only explicit patterns in titles and
 * snippets from sources RUWĀD already trusts, and only when enough independent sources agree. Anything doubtful stays empty. */

const compact = (s: string) => s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");
const mentions = (text: string, name: string) => { const n = compact(name); return n.length >= 3 && compact(text).includes(n); };

/* ------------------------------------------------------------- funding ---- */
export interface FundingClaim {
  amount: number; currency: "USD" | "SAR"; round?: string; leads: string[]; date: string | null;
  url: string; domain: string; sourceType: SourceType;
}
export interface FundingRound { round?: string; amount: number; currency: "USD" | "SAR"; date: string | null; leads: string[]; sources: { url: string; domain: string; type: SourceType }[] }

const VERB = /\b(raises?|raised|secures?|secured|closes?|closed|bags|lands|completes?|completed|receives?|obtains?|announces?)\b/i;
const CONTEXT = /\b(funding|round|investment|financing|seed|series\s[a-d]|capital)\b/i;
const MONEY_BEFORE = /(US\$|USD|\$|SAR|SR)\s?(\d[\d.,]*)\s?(million|billion|thousand|mn|bn|m|b|k)?\b/i;
const MONEY_AFTER = /(\d[\d.,]*)\s?(million|billion|mn|bn|m|b)?\s?(USD|SAR|US dollars|dollars|riyals?)\b/i;
const ROUND = /\b(pre-?seed|seed|pre-?series\s?a|series\s?[a-d]\+?|bridge|growth)\b/i;
const NOT_A_NAME = /^(existing|new|other|several|various|a group|group of|investors?|angel|strategic|venture)\b/i;

const UNIT: Record<string, number> = { thousand: 1e3, k: 1e3, million: 1e6, mn: 1e6, m: 1e6, billion: 1e9, bn: 1e9, b: 1e9 };

function money(text: string): { amount: number; currency: "USD" | "SAR" } | null {
  let amount: number | null = null; let cur = "";
  const a = MONEY_BEFORE.exec(text);
  if (a) { amount = Number(a[2].replace(/,/g, "")) * (UNIT[(a[3] ?? "").toLowerCase()] ?? 1); cur = a[1]; }
  else { const b = MONEY_AFTER.exec(text); if (b) { amount = Number(b[1].replace(/,/g, "")) * (UNIT[(b[2] ?? "").toLowerCase()] ?? 1); cur = b[3]; } }
  if (amount === null || !Number.isFinite(amount)) return null;
  const currency = /^(SAR|SR|riyals?)$/i.test(cur) ? "SAR" : "USD";
  return amount >= 1e4 && amount <= 5e9 ? { amount, currency } : null;
}

function canonicalRound(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const r = raw.toLowerCase().replace(/[\s-]/g, "");
  if (r.startsWith("preseed")) return "Pre-Seed";
  if (r === "seed") return "Seed";
  if (r.startsWith("preseries")) return "Series A";
  const m = /^series([a-d])\+?$/.exec(r);
  if (m) return m[1] === "a" ? "Series A" : m[1] === "b" ? "Series B" : "Series C+";
  return r === "growth" ? "Growth" : undefined;
}

function leadNames(text: string): string[] {
  const m = /(?:led by|lead investor(?:s)?(?: is| are|:)?)\s+([^.;]+?)(?=(?:,?\s+(?:with|and participation|joined|to|for|as|bringing|which|from)\b)|[.;]|$)/i.exec(text);
  if (!m) return [];
  return m[1].split(/\s*(?:,|&|\band\b)\s*/i).map((n) => n.replace(/^(the|by)\s+/i, "").trim())
    .filter((n) => n.length >= 3 && n.length <= 60 && /^[A-Z0-9]/.test(n) && n.split(/\s+/).length <= 6 && !NOT_A_NAME.test(n));
}

/** One item -> at most one funding claim, and only if the headline is about THIS company raising money. */
export function parseFundingClaim(item: ResearchItem, companyName: string, cls: SourceClass, now = new Date()): FundingClaim | null {
  if (!mentions(item.title, companyName)) return null;
  const text = `${item.title}. ${item.snippet}`;
  if (!VERB.test(item.title) || !CONTEXT.test(text)) return null;
  const amt = money(item.title) ?? money(item.snippet);
  if (!amt) return null;
  return {
    ...amt, round: canonicalRound(ROUND.exec(item.title)?.[1] ?? ROUND.exec(item.snippet)?.[1]), leads: leadNames(text),
    date: parsePublishedDate(item.date ?? undefined, now), url: item.url, domain: cls.domain, sourceType: cls.type,
  };
}

const toSarAmt = (c: FundingClaim) => (c.currency === "USD" ? c.amount * 3.75 : c.amount);
const sameAmount = (a: FundingClaim, b: FundingClaim) => Math.abs(toSarAmt(a) - toSarAmt(b)) <= Math.max(1, toSarAmt(a)) * 0.01;

/** A round is reported only when (a) at least two independent sites say the same amount, or (b) the company's own / an
 * investor's site announces it — and nothing else in the results contradicts it. */
export function assessFunding(claims: FundingClaim[]): FundingRound[] {
  const groups: FundingClaim[][] = [];
  for (const c of claims) { const g = groups.find((x) => sameAmount(x[0], c)); if (g) g.push(c); else groups.push([c]); }
  const label = (g: FundingClaim[]) => { const r = g.map((c) => c.round).filter(Boolean) as string[]; return r.sort((a, b) => r.filter((x) => x === b).length - r.filter((x) => x === a).length)[0]; };
  const supported = (g: FundingClaim[]) => new Set(g.map((c) => c.domain)).size >= 2 || g.some((c) => c.sourceType === "official" || c.sourceType === "government");
  const out: FundingRound[] = [];
  for (const g of groups) {
    if (!supported(g)) continue;
    const L = label(g);
    // Any other amount reported for the same (or an unspecified) round means the sources disagree: leave it empty.
    const conflict = groups.some((h) => h !== g && (label(h) === L || !label(h) || !L));
    if (conflict) continue;
    const dates = g.map((c) => c.date).filter(Boolean).sort() as string[];
    const names = new Map<string, number>();
    for (const c of g) for (const n of new Set(c.leads.map((x) => x.toLowerCase()))) names.set(n, (names.get(n) ?? 0) + 1);
    const officialLeads = new Set(g.filter((c) => c.sourceType === "official").flatMap((c) => c.leads.map((x) => x.toLowerCase())));
    const leads = [...new Map(g.flatMap((c) => c.leads).map((n) => [n.toLowerCase(), n])).entries()].filter(([k]) => (names.get(k) ?? 0) >= 2 || officialLeads.has(k)).map(([, n]) => n);
    out.push({ round: L, amount: g[0].amount, currency: g[0].currency, date: dates[0] ?? null, leads, sources: [...new Map(g.map((c) => [c.domain, { url: c.url, domain: c.domain, type: c.sourceType }])).values()] });
  }
  return out;
}

/* ------------------------------------------- regulatory and clinical ---- */
const NEGATIVE = /warning letter|recall|violation|injunction|seizure|safety alert|import alert|enforcement|untitled letter|adulterat|debarr|withdrawn|suspended|revoked|terminated|refus|cease/i;
const FDA_POSITIVE = /510\(k\)|premarket approval|\bPMA\b|de novo|fda[- ]cleared|fda[- ]approved|substantially equivalent|\bcleared\b|clearance/i;
const SFDA_POSITIVE = /registered|approved|authori[sz]ed|licen[sc]ed|marketing authori[sz]ation/i;
const CT_STATUS = /(Not yet recruiting|Enrolling by invitation|Active, not recruiting|Recruiting|Completed)/i;

export interface RegulatoryFinding { fields: Record<string, string>; sources: { field: string; url: string; domain: string }[] }

/** Regulatory / clinical facts are taken ONLY from the regulators' and registries' own pages, only when the page is about the
 * company, and never when the text reads like a warning, recall or withdrawal. "In progress" is never inferred. */
export function assessAuthoritative(items: ResearchItem[], companyName: string): RegulatoryFinding {
  const out: RegulatoryFinding = { fields: {}, sources: [] };
  for (const item of items) {
    if (!isRegulatoryHost(item.url)) continue;
    const text = `${item.title}. ${item.snippet}`;
    if (!mentions(text, companyName) || NEGATIVE.test(text)) continue;
    let host = ""; try { host = new URL(item.url).hostname.toLowerCase(); } catch { continue; }
    const set = (field: string, value: string) => { if (!out.fields[field]) { out.fields[field] = value; out.sources.push({ field, url: item.url, domain: host.replace(/^www\./, "") }); } };
    if (/(^|\.)fda\.gov$/.test(host) && FDA_POSITIVE.test(text)) set("fda", "Approved");
    else if (/(^|\.)sfda\.gov\.sa$/.test(host) && SFDA_POSITIVE.test(text)) set("sfda", "Approved");
    else if (/(^|\.)clinicaltrials\.gov$/.test(host)) {
      const nct = /(NCT\d{8})/i.exec(item.url + " " + text)?.[1]?.toUpperCase();
      const status = CT_STATUS.exec(text)?.[1];
      if (nct && status) set("clinicalStatus", `Registered on ClinicalTrials.gov (${nct}): ${status}`);
    }
  }
  return out;
}
