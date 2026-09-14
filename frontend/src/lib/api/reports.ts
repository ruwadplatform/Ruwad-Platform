import { api, isNotFound } from "./client";
import { logoUrl } from "./uploads";
import type { Report } from "@/types/intelligence";

export interface RawRelatedStartup { id: string; slug: string; name: string; logo: string; logoImageId?: string | null; category: string; city: string; tagline: string; stage: string; score: number; fundingTotal: number }
export interface RawRelatedInvestor { id: string; slug: string; name: string; logo: string; logoImageId?: string | null; type: string; city: string; ticket: string; hcDeals: number; desc: string }

interface RawReport {
  id: string; slug: string; title: string; category: string; reportType: string; publicationDate: string; description: string;
  geography: string; sector: string; authors: string[]; readingTime: string; pages: number; badges: Report["badges"];
  executiveSummary: string; keyFindings: string[]; marketStats: Report["marketStats"]; sections: Report["sections"]; sources: string[];
  provenanceConfidence?: Report["provenance"]["confidence"]; provenanceLastUpdated?: string; provenanceSources?: string[];
  relatedCompanies?: RawRelatedStartup[];
  relatedInvestors?: RawRelatedInvestor[];
  relatedReports?: RawReport[];
}

function mapReport(r: RawReport): Report {
  return {
    id: r.slug,
    title: r.title,
    category: r.category,
    reportType: r.reportType,
    publicationDate: r.publicationDate,
    description: r.description,
    geography: r.geography,
    sector: r.sector,
    authors: r.authors ?? [],
    readingTime: r.readingTime,
    pages: r.pages,
    badges: r.badges ?? [],
    executiveSummary: r.executiveSummary,
    keyFindings: r.keyFindings ?? [],
    marketStats: r.marketStats ?? [],
    sections: r.sections ?? [],
    relatedCompanies: (r.relatedCompanies ?? []).map((s) => s.slug),
    relatedInvestors: (r.relatedInvestors ?? []).map((v) => v.slug),
    relatedReports: (r.relatedReports ?? []).map((x) => x.slug),
    relatedCompaniesDetailed: (r.relatedCompanies ?? []).map((s) => ({ ...s, logoUrl: logoUrl(s.logoImageId) })),
    relatedInvestorsDetailed: (r.relatedInvestors ?? []).map((v) => ({ ...v, logoUrl: logoUrl(v.logoImageId) })),
    relatedReportsDetailed: (r.relatedReports ?? []).map(mapReport),
    sources: r.sources ?? [],
    provenance: { lastUpdated: r.provenanceLastUpdated ?? r.publicationDate, sources: r.provenanceSources ?? [], confidence: r.provenanceConfidence ?? "Medium" },
  };
}

export async function fetchReports(): Promise<Report[]> {
  const res = await api.get<{ items: RawReport[] }>("/reports?limit=100");
  return res.items.map(mapReport);
}

export async function fetchReportBySlug(slug: string) {
  try {
    const raw = await api.get<RawReport>(`/reports/${slug}`);
    return mapReport(raw);
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}
