import { hostOf } from "./content-utils";

/** Which web sources RUWĀD is willing to keep as evidence, and how much weight each kind carries.
 * Anything not on these lists (SEO blogs, aggregators, social media, unknown sites) is NOT stored as a source. */
export type SourceType = "government" | "official" | "international" | "consulting" | "news" | "industry";

/** Lower = stronger. Used to rank sources, never to invent facts. */
export const SOURCE_TIER: Record<SourceType, number> = { government: 1, official: 2, international: 3, consulting: 4, news: 5, industry: 6 };
export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  government: "Government", official: "Official company / investor site", international: "International organization",
  consulting: "Consulting / research firm", news: "News", industry: "Industry publication",
};

const GOVERNMENT = ["moh.gov.sa", "sfda.gov.sa", "vision2030.gov.sa", "stats.gov.sa", "misa.gov.sa", "monshaat.gov.sa", "pif.gov.sa", "sanabil.com", "spa.gov.sa"];
const INTERNATIONAL = ["who.int", "worldbank.org", "oecd.org", "imf.org"];
const CONSULTING = ["kpmg.com", "pwc.com", "deloitte.com", "ey.com", "mckinsey.com", "bcg.com"];
const NEWS = ["reuters.com", "bloomberg.com", "zawya.com", "arabnews.com", "saudigazette.com.sa"];
const INDUSTRY = [
  "wamda.com", "magnitt.com", "techcrunch.com", "agbi.com", "arabianbusiness.com", "ft.com", "forbesmiddleeast.com", "cnbc.com", "menabytes.com",
  "fiercehealthcare.com", "fiercebiotech.com", "mobihealthnews.com", "healthcareitnews.com", "statnews.com", "biospace.com", "endpts.com",
];
/** Regulators and registries whose pages can support a regulatory / clinical statement. */
export const REGULATORY_HOSTS = ["sfda.gov.sa", "fda.gov", "accessdata.fda.gov", "ema.europa.eu", "clinicaltrials.gov"];

const matches = (host: string, list: string[]) => list.some((d) => host === d || host.endsWith("." + d));

export interface SourceClass { type: SourceType; tier: number; domain: string }

/** `officialHosts` = websites of companies/investors already in the RUWĀD database (their own sites count as official). */
export function classifySource(url: string, officialHosts?: ReadonlySet<string>): SourceClass | null {
  const domain = hostOf(url);
  if (!domain) return null;
  let type: SourceType | null = null;
  if (matches(domain, GOVERNMENT) || domain.endsWith(".gov.sa")) type = "government";
  else if (officialHosts && [...officialHosts].some((h) => domain === h || domain.endsWith("." + h))) type = "official";
  else if (matches(domain, INTERNATIONAL)) type = "international";
  else if (matches(domain, CONSULTING)) type = "consulting";
  else if (matches(domain, NEWS)) type = "news";
  else if (matches(domain, INDUSTRY)) type = "industry";
  return type ? { type, tier: SOURCE_TIER[type], domain } : null;
}

export const isRegulatoryHost = (url: string) => matches(hostOf(url), REGULATORY_HOSTS);
