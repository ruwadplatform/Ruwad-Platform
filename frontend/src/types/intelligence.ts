import type { Provenance } from "@/lib/scoring";

/* ================================================================ INTELLIGENCE
 * Types for the Phase 3 "Ruwād Intelligence" section (Reports, Dashboards/
 * Analytics, News & Events). Ported/expanded from REPORTS/NEWS/EVENTS in
 * js/mock-data.js, which only carried a handful of display fields — this
 * phase's spec calls for the fuller institutional-report shape (authors,
 * key findings, market stats, related entities, sources) so it's a
 * superset of the old shape rather than a 1:1 port. */

export interface ChartDatum {
  l: string;
  v: number;
}

export type ReportBadge = "Featured" | "New" | "Premium" | "Ruwād Research";

export interface ReportStat {
  label: string;
  value: string;
}

export interface ReportSection {
  heading: string;
  body: string;
  chart?: ChartDatum[];
}

export interface ReportMetric { label: string; value: string; note?: string }
export interface ReportDistribution { key: string; title: string; unit: string; rows: { l: string; v: number }[] }
export interface ReportExternalSource {
  id: string; title: string; url: string; domain: string; snippet: string;
  publishedAt: string | null; publishedText: string | null; query: string; topic: string;
  sourceType: string; sourceTypeLabel: string; tier: number; retrievedAt: string;
}
export interface ReportInternalStats {
  coverage: { startups: number; investors: number; asOf: string };
  metrics: ReportMetric[];
  distributions: ReportDistribution[];
  companies: { slug: string; name: string; stage: string; city: string; category: string; fundingTotal: number }[];
  investors: { slug: string; name: string; type: string; city: string; hcDeals: number }[];
  /** Companies that say they are raising, with the target each states — funding SOUGHT, never raised. */
  fundingSought?: { slug: string; name: string; stage: string; target: string }[];
  ecosystem?: ReportMetric[];
  subject?: { slug: string; name: string; facts: ReportMetric[]; peers: ReportMetric[]; profile?: { heading: string; items: { label: string; value: string }[] }[]; missing?: string[] } | null;
}
export interface ReportMarketSizeClaim {
  amount: string; currency: string; year: number; geography: string; basis: "reported" | "projected";
  sourceId: string; sourceTitle: string; url: string; domain: string; sourceTypeLabel: string; quote: string;
}
export type ReportMarketSize = { status: "found"; claims: ReportMarketSizeClaim[] } | { status: "notIdentified"; message: string };
/** Present only on reports generated from RUWĀD data + shared web research. */
export interface GeneratedReport {
  reportKind: string;
  generationMode: string;
  aiOverview: string | null;
  researchedAt: string | null;
  overviewLines: string[];
  methodology: string[];
  coverageNotice: string;
  research: { status: "ok" | "partial" | "unavailable" | "disabled"; searchesUsed: number; cacheHits: number; sourcesKept: number; note?: string };
  scopeLabel: string;
  marketSize?: ReportMarketSize;
  internalStats: ReportInternalStats;
  externalSources: ReportExternalSource[];
}

export interface Report {
  id: string;
  /** Database id — needed by the admin actions. */
  dbId?: string;
  isPublished?: boolean;
  reportKind?: string;
  generated?: GeneratedReport;
  title: string;
  category: string;
  reportType: string;
  publicationDate: string;
  description: string;
  geography: string;
  sector: string;
  authors: string[];
  readingTime: string;
  pages: number;
  badges: ReportBadge[];
  executiveSummary: string;
  keyFindings: string[];
  marketStats: ReportStat[];
  sections: ReportSection[];
  relatedCompanies: string[];
  relatedInvestors: string[];
  relatedReports: string[];
  /** Backend-resolved summary rows for the ids above — the detail page
   * reads these directly instead of re-deriving them with a client-side
   * find() against separately-loaded Startups/Investors/Reports collections. */
  relatedCompaniesDetailed?: { id: string; slug: string; name: string; logo: string; logoUrl?: string | null; category: string; city: string; tagline: string; stage: string; score: number; fundingTotal: number }[];
  relatedInvestorsDetailed?: { id: string; slug: string; name: string; logo: string; logoUrl?: string | null; type: string; city: string; ticket: string; hcDeals: number; desc: string }[];
  relatedReportsDetailed?: Report[];
  sources: string[];
  provenance: Provenance;
}

export interface RelatedEntity {
  type: "startups" | "investors" | "hubs" | "research" | "multinationals";
  id: string;
  name: string;
}

export interface NewsArticle {
  id: string;
  title: string;
  source: string;
  publishedDate: string;
  category: string;
  sector: string;
  geography: string;
  summary: string;
  /** The ORIGINAL article — the app links out to it. */
  sourceUrl: string;
  imageUrl?: string | null;
  relatedEntities: RelatedEntity[];
}

export type EventStatus = "ONGOING" | "UPCOMING" | "PAST";

export interface EventItem {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: EventStatus;
  location: string;
  country: string;
  city: string | null;
  venue: string | null;
  type: string;
  /** Healthcare category. */
  sector: string;
  organizer: string;
  description: string;
  /** The event's own page. */
  url: string;
  registrationUrl: string | null;
  imageUrl: string | null;
}

export interface DashboardMeta {
  id: string;
  title: string;
  description: string;
  geography: string;
  sector: string;
  lastUpdated: string;
  kpiPreview: { label: string; value: string };
}
