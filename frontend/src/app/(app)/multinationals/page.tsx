import { MultinationalsDirectoryPage } from "@/features/multinationals/MultinationalsDirectoryPage";
import { DirectoryIndex } from "@/features/home/DirectoryIndex";
import { loadDirectoryIndex } from "@/lib/seo/data";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Multinational Healthcare Companies in Saudi Arabia and MENA",
  description: "Global pharmaceutical, medical device, diagnostics and digital health companies active in Saudi Arabia and MENA, profiled on RUWĀD.",
  path: "/multinationals",
});

/** The list under the directory is refreshed hourly. */
export const revalidate = 3600;

export default async function Page() {
  const items = await loadDirectoryIndex("multinationals");
  return (
    <>
      <MultinationalsDirectoryPage />
      <DirectoryIndex section="multinationals" heading="All multinational healthcare companies on RUWĀD" intro="Every multinational healthcare company with a public profile on RUWĀD, active in Saudi Arabia and MENA." items={items} />
    </>
  );
}
