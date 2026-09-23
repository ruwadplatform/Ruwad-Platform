import type { Startup, Investor, Hub, ResearchInstitution, Multinational } from "@/types/entities";
import type { Report } from "@/types/intelligence";

export interface SearchResult {
  label: string;
  sub: string;
  type: string;
  route: string;
  logo?: string;
  logoUrl?: string | null;
}

/** Ported from searchIndex() (js/newsevents.js's global-search companion) —
 * one flat, cross-entity index built from the existing (now backend-loaded)
 * collections, grouped by type for display. No separate search data model —
 * the six collections passed in are the same ones the directory pages
 * already fetch via useStartups()/useInvestors()/etc, so building the index
 * costs no extra network round trip. */
export function searchIndex(
  STARTUPS: Startup[], INVESTORS: Investor[], HUBS: Hub[], RESEARCH_INSTITUTIONS: ResearchInstitution[], MULTINATIONALS: Multinational[], REPORTS: Report[],
): SearchResult[] {
  return [
    ...STARTUPS.map((s) => ({ label: s.name, sub: s.tagline, type: "Startups", route: `/startups/${s.id}`, logo: s.logo, logoUrl: s.logoUrl })),
    ...INVESTORS.map((v) => ({ label: v.name, sub: v.thesis, type: "Investors", route: `/investors/${v.id}`, logo: v.logo, logoUrl: v.logoUrl })),
    ...HUBS.map((h) => ({ label: h.name, sub: h.desc, type: "Hubs & Enablers", route: `/hubs/${h.id}`, logo: h.logo, logoUrl: h.logoUrl })),
    ...RESEARCH_INSTITUTIONS.map((r) => ({ label: r.name, sub: r.about, type: "Research & Academia", route: `/research/${r.id}`, logo: r.logo, logoUrl: r.logoUrl })),
    ...MULTINATIONALS.map((m) => ({ label: m.name, sub: m.tagline, type: "Multinationals", route: `/multinationals/${m.id}`, logo: m.logo, logoUrl: m.logoUrl })),
    ...REPORTS.map((r) => ({ label: r.title, sub: r.description, type: "Reports", route: `/reports/${r.id}` })),
  ];
}

export const GUEST_SEARCH_CAPS: Record<string, number> = {
  Startups: 3, Investors: 3, "Hubs & Enablers": 3, "Research & Academia": 3, Multinationals: 3, Reports: 3,
};
