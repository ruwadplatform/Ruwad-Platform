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

/** Everything in here was computed from the RUWĀD database at generation time. */
export interface InternalStats {
  coverage: { startups: number; investors: number; asOf: string };
  metrics: Metric[];
  distributions: Distribution[];
  companies: CompanyRow[];
  investors: InvestorRow[];
  /** Individual startup analysis only. */
  subject?: { slug: string; name: string; facts: Metric[]; peers: Metric[] } | null;
}

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
}

export type { QueryLog };
