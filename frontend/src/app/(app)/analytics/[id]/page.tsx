import { notFound } from "next/navigation";
import { AnalyticsDetailPage } from "@/features/analytics/AnalyticsDetailPage";

const VALID_DASHBOARD_IDS = [
  "saudi-healthcare-ecosystem", "startup-funding", "investor-activity", "sector-intelligence",
  "geographic-intelligence", "innovation-research", "multinational-presence", "market-activity",
];

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!VALID_DASHBOARD_IDS.includes(id)) notFound();
  return <AnalyticsDetailPage dashboardId={id} />;
}
