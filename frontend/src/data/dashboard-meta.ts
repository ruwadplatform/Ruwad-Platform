/** Static shell (id/title/description/geography/sector) for the 8 fixed
 * analytics dashboards — the only genuinely dynamic part is each
 * dashboard's kpiPreview, which AnalyticsHubPage computes from the live
 * /analytics/* endpoints. AnalyticsDetailPage's header uses this directly. */
export interface DashboardShell {
  id: string;
  title: string;
  description: string;
  geography: string;
  sector: string;
}

export const DASHBOARD_META: DashboardShell[] = [
  { id: "saudi-healthcare-ecosystem", title: "Saudi Healthcare Ecosystem", description: "The flagship cross-sector view of startups, investors, hubs, research and multinational activity.", geography: "Saudi Arabia", sector: "Cross-Sector Healthcare" },
  { id: "startup-funding", title: "Startup Funding", description: "Funding by stage, sector and round across the tracked startup dataset.", geography: "Saudi Arabia", sector: "Cross-Sector Healthcare" },
  { id: "investor-activity", title: "Investor Activity", description: "Most active investors by healthcare deal count, stage focus and geography.", geography: "Saudi Arabia", sector: "Healthcare Investment" },
  { id: "sector-intelligence", title: "Sector Intelligence", description: "Healthcare entity and startup distribution across digital health, biotech, MedTech and more.", geography: "Saudi Arabia", sector: "Cross-Sector Healthcare" },
  { id: "geographic-intelligence", title: "Geographic Intelligence", description: "Entity distribution across Riyadh, Jeddah, the Eastern Province and beyond.", geography: "Saudi Arabia", sector: "Cross-Sector Healthcare" },
  { id: "innovation-research", title: "Innovation & Research", description: "Research institutions, active projects, publications and patent activity.", geography: "Saudi Arabia & MENA", sector: "Research & Academia" },
  { id: "multinational-presence", title: "Multinational Presence", description: "Saudi and MENA presence, R&D footprint and partnership activity among healthcare multinationals.", geography: "Saudi Arabia & MENA", sector: "Multinational Healthcare" },
  { id: "market-activity", title: "Market Activity", description: "Recent funding rounds and deal-level activity across the tracked startup dataset.", geography: "Saudi Arabia", sector: "Cross-Sector Healthcare" },
];
