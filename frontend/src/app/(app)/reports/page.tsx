import { ReportsDirectoryPage } from "@/features/reports/ReportsDirectoryPage";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Saudi Healthcare Innovation Reports",
  description: "Market intelligence, funding and sector reports across Saudi, GCC and MENA healthcare, published on the RUWĀD platform.",
  path: "/reports",
});

export default function Page() {
  return <ReportsDirectoryPage />;
}
