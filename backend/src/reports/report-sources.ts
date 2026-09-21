import { normalizeTitle, normalizeUrl, parsePublishedDate } from "../content/content-utils";

import type { QueryLog, ResearchItem } from "../content/research.service";
import { SOURCE_TYPE_LABEL, classifySource } from "../content/source-quality";
import type { ExternalSource, ReportKind, ReportScope } from "./report-types";

const compactText = (s: string) => s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");

/** Serper research plans. Each plan is a small set of FOCUSED queries (max 8): one per kind of evidence, using
 * site: filters so results come from the trusted lists instead of generic SEO pages. */
export interface PlanItem { query: string; kind: "search" | "news"; topic: string; tbs?: string }

const GOV = "(site:moh.gov.sa OR site:sfda.gov.sa OR site:vision2030.gov.sa OR site:stats.gov.sa OR site:misa.gov.sa OR site:monshaat.gov.sa OR site:pif.gov.sa OR site:spa.gov.sa)";
const INTL = "(site:who.int OR site:worldbank.org OR site:oecd.org OR site:imf.org)";
const CONSULT = "(site:kpmg.com OR site:pwc.com OR site:deloitte.com OR site:ey.com OR site:mckinsey.com OR site:bcg.com)";
const NEWS = "(site:reuters.com OR site:bloomberg.com OR site:zawya.com OR site:arabnews.com OR site:saudigazette.com.sa)";
const REG = "(site:sfda.gov.sa OR site:fda.gov OR site:clinicaltrials.gov OR site:ema.europa.eu)";

export const MAX_REPORT_QUERIES = 8;

export function researchPlan(kind: ReportKind, scope: ReportScope, subjectName?: string): PlanItem[] {
  const S = scope.sector?.trim() || "healthcare";
  if (kind === "STARTUP_ANALYSIS") {
    const n = `"${subjectName}"`;
    return [
      { query: `${n} healthcare startup`, kind: "search", topic: "company" },
      { query: `${n} funding investment`, kind: "news", topic: "funding", tbs: "qdr:y" },
      { query: `${n} ${NEWS}`, kind: "search", topic: "news" },
      { query: `${n} ${REG}`, kind: "search", topic: "regulatory" },
      { query: `${n} partnership OR launch OR expansion`, kind: "news", topic: "news", tbs: "qdr:y" },
    ];
  }
  const base: Record<Exclude<ReportKind, "STARTUP_ANALYSIS">, PlanItem[]> = {
    SECTOR_OVERVIEW: [
      { query: `${S} Saudi Arabia market overview`, kind: "search", topic: "overview" },
      { query: `${S} Saudi Arabia ${GOV}`, kind: "search", topic: "government" },
      { query: `${S} ${INTL} Saudi Arabia`, kind: "search", topic: "international" },
      { query: `${S} Saudi Arabia market report ${CONSULT}`, kind: "search", topic: "market-study" },
      { query: `${S} Saudi Arabia startup funding raises`, kind: "news", topic: "funding", tbs: "qdr:y" },
      { query: `${S} Saudi Arabia`, kind: "news", topic: "news", tbs: "qdr:m" },
      { query: `${S} Saudi Arabia investment PIF OR Sanabil OR MISA OR Monsha'at`, kind: "search", topic: "investment" },
      { query: `${S} regulation Saudi Arabia (site:sfda.gov.sa OR site:moh.gov.sa)`, kind: "search", topic: "regulation" },
    ],
    STARTUP_LANDSCAPE: [
      { query: `Saudi Arabia ${S} startup ecosystem`, kind: "search", topic: "overview" },
      { query: `${S} startups Saudi Arabia ${GOV}`, kind: "search", topic: "government" },
      { query: `Saudi Arabia ${S} startups market report ${CONSULT}`, kind: "search", topic: "market-study" },
      { query: `Saudi ${S} startup launches OR partnership`, kind: "news", topic: "news", tbs: "qdr:m" },
      { query: `Saudi ${S} startups funding raises`, kind: "news", topic: "funding", tbs: "qdr:y" },
      { query: `Saudi Arabia ${S} startups ${NEWS}`, kind: "search", topic: "news" },
    ],
    FUNDING_LANDSCAPE: [
      { query: `Saudi Arabia ${S} startup funding rounds venture capital`, kind: "search", topic: "overview" },
      { query: `Saudi ${S} startup raises Series OR Seed`, kind: "news", topic: "funding", tbs: "qdr:y" },
      { query: `Saudi Arabia ${S} venture funding report ${CONSULT}`, kind: "search", topic: "market-study" },
      { query: `Saudi Arabia ${S} investment programs ${GOV}`, kind: "search", topic: "government" },
      { query: `Saudi Arabia ${S} investment announcement PIF OR Sanabil OR Monsha'at`, kind: "search", topic: "investment" },
      { query: `Saudi ${S} funding ${NEWS}`, kind: "search", topic: "news" },
      { query: `Saudi ${S} investment`, kind: "news", topic: "news", tbs: "qdr:m" },
    ],
    INVESTOR_LANDSCAPE: [
      { query: `Saudi Arabia healthcare venture capital investors ${S}`, kind: "search", topic: "overview" },
      { query: `Sanabil OR PIF OR Monsha'at healthcare investment ${GOV}`, kind: "search", topic: "government" },
      { query: `Saudi Arabia ${S} venture investors report ${CONSULT}`, kind: "search", topic: "market-study" },
      { query: `Saudi ${S} investor announces OR launches fund`, kind: "news", topic: "investment", tbs: "qdr:y" },
      { query: `Saudi Arabia ${S} investors ${NEWS}`, kind: "search", topic: "news" },
      { query: `Saudi ${S} venture capital`, kind: "news", topic: "news", tbs: "qdr:m" },
    ],
  };
  return base[kind as Exclude<ReportKind, "STARTUP_ANALYSIS">];
}

const REGION = /saudi|ksa|kingdom|riyadh|jeddah|dammam|gcc|gulf|mena|middle east|vision 2030|neom/i;
const HEALTH = /health|medical|medtech|biotech|pharma|clinical|hospital|patient|diagnos|genom|telemedicine|life science/i;

interface Ctx { officialHosts: ReadonlySet<string>; scope: ReportScope; subjectName?: string; now?: Date }

/** Turns raw search hits into stored sources: trusted domains only, on-topic only, de-duplicated, ranked. */
export function buildSources(hits: { item: ResearchItem; plan: PlanItem }[], ctx: Ctx, retrievedAt: string, cap = 24): ExternalSource[] {
  const sectorWords = (ctx.scope.sector ?? "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const perDomain = new Map<string, number>();
  const kept: Omit<ExternalSource, "id">[] = [];

  for (const { item, plan } of hits) {
    const cls = classifySource(item.url, ctx.officialHosts);
    if (!cls) continue; // not a trusted source: dropped
    const text = `${item.title} ${item.snippet}`;
    if (ctx.subjectName) { if (!compactText(text).includes(compactText(ctx.subjectName))) continue; } // company reports: must actually be about the company
    else {
      const onTopic = (sectorWords.length ? sectorWords.some((w) => text.toLowerCase().includes(w)) : false) || HEALTH.test(text);
      const inRegion = REGION.test(text) || cls.type === "government";
      if (!onTopic || !inRegion) continue;
    }
    const urlKey = normalizeUrl(item.url);
    if (!urlKey || seenUrl.has(urlKey)) continue;
    const titleKey = `${cls.domain}|${normalizeTitle(item.title)}`;
    if (seenTitle.has(titleKey)) continue;
    if ((perDomain.get(cls.domain) ?? 0) >= 3) continue;
    seenUrl.add(urlKey); seenTitle.add(titleKey); perDomain.set(cls.domain, (perDomain.get(cls.domain) ?? 0) + 1);
    kept.push({
      title: item.title.trim(), url: item.url, domain: cls.domain, snippet: item.snippet.trim(),
      publishedAt: parsePublishedDate(item.date ?? undefined, ctx.now ?? new Date()), publishedText: item.date,
      query: plan.query, topic: plan.topic, sourceType: cls.type, sourceTypeLabel: SOURCE_TYPE_LABEL[cls.type], tier: cls.tier, retrievedAt,
    });
  }
  kept.sort((a, b) => a.tier - b.tier || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  return kept.slice(0, cap).map((s, i) => ({ id: `S${i + 1}`, ...s }));
}

export function researchStatus(log: QueryLog[], enabled: boolean): "ok" | "partial" | "unavailable" | "disabled" {
  if (!enabled) return "disabled";
  const ran = log.filter((q) => !q.skipped);
  if (ran.length === 0) return "unavailable";
  const failed = ran.filter((q) => q.failed).length;
  return failed === 0 ? "ok" : failed === ran.length ? "unavailable" : "partial";
}
