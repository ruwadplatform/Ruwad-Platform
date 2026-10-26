import { InvestorsDirectoryPage } from "@/features/investors/InvestorsDirectoryPage";
import { DirectoryIndex } from "@/features/home/DirectoryIndex";
import { loadDirectoryIndex } from "@/lib/seo/data";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Healthcare Investors Active in Saudi Arabia",
  description: "Venture capital, corporate venture, sovereign and angel investors active in Saudi and MENA healthcare, with focus areas, stages and portfolio on RUWĀD.",
  path: "/investors",
});

/** The list under the directory is refreshed hourly. */
export const revalidate = 3600;

export default async function Page() {
  const items = await loadDirectoryIndex("investors");
  return (
    <>
      <InvestorsDirectoryPage />
      <DirectoryIndex section="investors" heading="All healthcare investors on RUWĀD" intro="Every investor with a public profile on RUWĀD, from venture capital and corporate venture to sovereign and angel investors active in Saudi and MENA healthcare." items={items} />
    </>
  );
}
