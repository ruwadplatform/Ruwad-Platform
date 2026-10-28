import { ResearchDirectoryPage } from "@/features/research/ResearchDirectoryPage";
import { DirectoryIndex } from "@/features/home/DirectoryIndex";
import { loadDirectoryIndex } from "@/lib/seo/data";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Research Institutions and Academic Healthcare Centers in Saudi Arabia",
  description: "Universities, research institutions and academic healthcare centers across Saudi Arabia and the region, with their research areas, on the RUWĀD platform.",
  path: "/research",
});

/** The list under the directory is refreshed hourly. */
export const revalidate = 3600;

export default async function Page() {
  const items = await loadDirectoryIndex("research");
  return (
    <>
      <ResearchDirectoryPage />
      <DirectoryIndex section="research" heading="All research institutions on RUWĀD" intro="Every university and research institution with a public profile on RUWĀD." items={items} />
    </>
  );
}
