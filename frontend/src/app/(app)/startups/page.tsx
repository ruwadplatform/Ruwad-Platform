import { Suspense } from "react";
import { StartupsDirectoryPage } from "@/features/startups/StartupsDirectoryPage";
import { DirectoryIndex } from "@/features/home/DirectoryIndex";
import { loadDirectoryIndex } from "@/lib/seo/data";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Healthcare Startups in Saudi Arabia and MENA",
  description: "Browse Saudi and MENA healthcare, biotech and medtech startups on RUWĀD: company profiles with stage, location, regulatory status and the RUWĀD Score.",
  path: "/startups",
});

/** The list under the directory is refreshed hourly. */
export const revalidate = 3600;

export default async function Page() {
  const items = await loadDirectoryIndex("startups");
  return (
    <>
      <Suspense>
        <StartupsDirectoryPage />
      </Suspense>
      <DirectoryIndex section="startups" heading="All healthcare startups on RUWĀD" intro="Every startup with a public profile on the RUWĀD healthcare platform. Open a profile to see what the company does, where it is based and how it is progressing." items={items} />
    </>
  );
}
