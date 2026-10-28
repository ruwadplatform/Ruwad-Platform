import { OpportunitiesPage } from "@/features/opportunities/OpportunitiesPage";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Healthcare Innovation Programs and Funding Opportunities",
  description: "Every accelerator, incubator, sandbox and funding programme listed across RUWĀD's hubs and enablers directory, in one list for Saudi and MENA healthcare founders.",
  path: "/opportunities",
});

export default function Page() {
  return <OpportunitiesPage />;
}
