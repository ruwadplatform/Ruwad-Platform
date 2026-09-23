import type { QueryLog } from "../content/research.service";
import type { SourceType } from "../content/source-quality";

export const REPORT_KINDS = ["SECTOR_OVERVIEW", "STARTUP_LANDSCAPE", "FUNDING_LANDSCAPE", "INVESTOR_LANDSCAPE", "STARTUP_ANALYSIS"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_KIND_LABEL: Record<ReportKind, string> = {
  SECTOR_OVERVIEW: "Sector Overview",
  STARTUP_LANDSCAPE: "Startup Landscape",
  FUNDING_LANDSCAPE: "Funding Landscape",
  INVESTOR_LANDSCAPE: "Investor Landscape",
  STARTUP_ANALYSIS: "Individual Startup Analysis",
};

export interface ReportScope { sector?: string; startupSlug?: string }

/** A number shown on the report. `source` is always RUWĀD's own database — never a web page. */
export interface Metric { label: string; value: string; note?: string }
export interface Distribution { key: string; title: string; unit: string; rows: { l: string; v: number }[] }
export interface CompanyRow { slug: string; name: string; stage: string; city: string; category: string; fundingTotal: number }
export interface InvestorRow { slug: string; name: string; type: string; city: string; hcDeals: number }

/** A company that says it is raising money. This is what it is SEEKING (its own stated target), never money raised. */
export interface FundingSoughtRow { slug: string; name: string; stage: string; target: string }
export interface ProfileSection { heading: string; items: { label: string; value: string }[] }

/** Everything in here was computed from the RUWĀD database at generation time. */
export interface InternalStats {
  coverage: { startups: number; investors: number; asOf: string };
  metrics: Metric[];
  distributions: Distribution[];
  companies: CompanyRow[];
  investors: InvestorRow[];
  /** Companies currently fundraising, with the target each one states — kept apart from funding already raised. */
  fundingSought?: FundingSoughtRow[];
  /** Counts of the other RUWĀD directories (hubs, research institutions, multinationals). */
  ecosystem?: Metric[];
  /** Individual startup analysis only. */
  subject?: { slug: string; name: string; facts: Metric[]; peers: Metric[]; profile?: ProfileSection[]; missing?: string[] } | null;
}

/** A market-size statement made by a credible source. RUWĀD never computes or estimates one itself. */
export interface MarketSizeClaim {
  amount: string; currency: string; year: number; geography: string; basis: "reported" | "projected";
  sourceId: string; sourceTitle: string; url: string; domain: string; sourceTypeLabel: string; quote: string;
}
export type MarketSize = { status: "found"; claims: MarketSizeClaim[] } | { status: "notIdentified"; message: string };

/** One web source kept as evidence. Nothing here is a RUWĀD figure. */
export interface ExternalSource {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  publishedAt: string | null;
  publishedText: string | null;
  query: string;
  topic: string;
  sourceType: SourceType;
  sourceTypeLabel: string;
  tier: number;
  retrievedAt: string;
}

export interface GeneratedContent {
  /** Plain statements assembled from the numbers and sources above — no narrative added. */
  overviewLines: string[];
  methodology: string[];
  coverageNotice: string;
  research: { status: "ok" | "partial" | "unavailable" | "disabled"; searchesUsed: number; cacheHits: number; sourcesKept: number; note?: string };
  scopeLabel: string;
  /** Only ever a figure a credible source states, with year, geography and currency. Otherwise "not identified". */
  marketSize?: MarketSize;
}

export type { QueryLog };
