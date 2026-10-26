import { HubsDirectoryPage } from "@/features/hubs/HubsDirectoryPage";
import { DirectoryIndex } from "@/features/home/DirectoryIndex";
import { loadDirectoryIndex } from "@/lib/seo/data";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Healthcare Accelerators, Incubators and Enablers in Saudi Arabia",
  description: "Accelerators, incubators, venture studios and programmes supporting Saudi and MENA healthcare startups, listed on RUWĀD with their focus and open opportunities.",
  path: "/hubs",
});

/** The list under the directory is refreshed hourly. */
export const revalidate = 3600;

export default async function Page() {
  const items = await loadDirectoryIndex("hubs");
  return (
    <>
      <HubsDirectoryPage />
      <DirectoryIndex section="hubs" heading="All hubs and enablers on RUWĀD" intro="Every accelerator, incubator, venture studio and programme with a public profile on RUWĀD." items={items} />
    </>
  );
}
