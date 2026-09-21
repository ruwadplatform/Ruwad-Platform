import { api, isNotFound } from "./client";
import { logoUrl } from "./uploads";
import type { Report, ReportExternalSource, ReportInternalStats } from "@/types/intelligence";

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
  isPublished?: boolean;
  reportKind?: string | null;
  generationMode?: string | null;
  aiOverview?: string | null;
  researchedAt?: string | null;
  generated?: { overviewLines?: string[]; methodology?: string[]; coverageNotice?: string; research?: NonNullable<Report["generated"]>["research"]; scopeLabel?: string } | null;
  internalStats?: ReportInternalStats | null;
  externalSources?: ReportExternalSource[] | null;
}

function mapReport(r: RawReport): Report {
  const g = r.generated;
  return {
    id: r.slug,
    dbId: r.id,
    isPublished: r.isPublished,
    reportKind: r.reportKind ?? undefined,
    generated: g && r.internalStats
      ? {
          reportKind: r.reportKind ?? "",
          generationMode: r.generationMode ?? "no-ai",
          aiOverview: r.aiOverview ?? null,
          researchedAt: r.researchedAt ?? null,
          overviewLines: g.overviewLines ?? [],
          methodology: g.methodology ?? [],
          coverageNotice: g.coverageNotice ?? "",
          research: g.research ?? { status: "unavailable", searchesUsed: 0, cacheHits: 0, sourcesKept: 0 },
          scopeLabel: g.scopeLabel ?? "",
          internalStats: r.internalStats,
          externalSources: r.externalSources ?? [],
        }
      : undefined,
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

/* ---- Admin only (the backend enforces the role; these just call it) ---- */

export async function fetchAdminReports(): Promise<Report[]> {
  const rows = await api.get<RawReport[]>("/reports/admin/all");
  return rows.map(mapReport);
}

export async function fetchAdminReportBySlug(slug: string) {
  try { return mapReport(await api.get<RawReport>(`/reports/admin/by-slug/${slug}`)); }
  catch (e) { if (isNotFound(e)) return null; throw e; }
}

export interface GenerateReportInput { kind: string; sector?: string; startupSlug?: string }
export const generateReport = async (input: GenerateReportInput) => mapReport(await api.post<RawReport>("/reports/generate", input));
export const refreshReportResearch = async (dbId: string) => mapReport(await api.post<RawReport>(`/reports/${dbId}/refresh-research`));
export const setReportPublished = async (dbId: string, published: boolean) => mapReport(await api.post<RawReport>(`/reports/${dbId}/${published ? "publish" : "unpublish"}`));
