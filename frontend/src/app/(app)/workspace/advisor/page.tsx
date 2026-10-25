import { notFound } from "next/navigation";
import { AdvisorDashboardPage } from "@/features/advisory/AdvisorDashboardPage";
import { ADVISORY_ENABLED } from "@/lib/feature-flags";

export default function Page() {
  if (!ADVISORY_ENABLED) notFound();
  return <AdvisorDashboardPage />;
}
