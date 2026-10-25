import { notFound } from "next/navigation";
import { AdvisoryServicesPage } from "@/features/advisory/AdvisoryServicesPage";
import { ADVISORY_ENABLED } from "@/lib/feature-flags";

export default function Page() {
  if (!ADVISORY_ENABLED) notFound();
  return <AdvisoryServicesPage />;
}
