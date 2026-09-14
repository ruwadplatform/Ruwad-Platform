/** Chart color palette shared by BarChart/DonutChart. The aggregation
 * functions that used to live here (fundingBySector, dealsByStage, etc.)
 * are now computed server-side by the backend's /analytics/* endpoints
 * (src/analytics/analytics.service.ts) and consumed via src/hooks/use-analytics.ts —
 * see AnalyticsHubPage/AnalyticsDetailPage. */
export const CHART_COLORS = ["#128A45", "#1DB460", "#0B3D2E", "#C9A227", "#2563A6", "#B7791F", "#687386", "#20254A"];
