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

export interface Report {
  id: string;
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
  sourceUrl: string;
  relatedEntities: RelatedEntity[];
}

export type EventRegistrationStatus = "Open" | "Closed" | "Coming Soon";

export interface EventItem {
  id: string;
  name: string;
  date: string;
  location: string;
  country: string;
  type: string;
  sector: string;
  organizer: string;
  description: string;
  registrationStatus: EventRegistrationStatus;
  url: string;
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
