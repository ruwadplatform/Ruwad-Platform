import { EcosystemPage } from "@/features/ecosystem/EcosystemPage";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "The Saudi Healthcare Innovation Ecosystem",
  description: "Explore the RUWĀD healthcare ecosystem: the companies, investors, enablers and institutions shaping healthcare innovation in Saudi Arabia and MENA.",
  path: "/ecosystem",
});

export default function Page() {
  return <EcosystemPage />;
}
