import { MarketMapPage } from "@/features/marketmap/MarketMapPage";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Saudi Healthcare Innovation Market Map",
  description: "Every tracked startup, investor, hub, research institution and multinational company grouped by healthcare category, on the RUWĀD market map.",
  path: "/market-map",
});

export default function Page() {
  return <MarketMapPage />;
}
