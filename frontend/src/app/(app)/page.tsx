import { HomePage, type HomeStartup } from "@/features/home/HomePage";
import { fetchStartups } from "@/lib/api/startups";
import { pageMetadata } from "@/lib/seo/metadata";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, PROFILES_INDEXABLE } from "@/lib/seo/site";

export const metadata = pageMetadata({ title: DEFAULT_TITLE, absoluteTitle: true, description: DEFAULT_DESCRIPTION, path: "/" });

/** Refreshed hourly. */
export const revalidate = 3600;

async function latestStartups(): Promise<HomeStartup[]> {
  if (!PROFILES_INDEXABLE) return [];
  try {
    const all = await fetchStartups();
    return [...all]
      .sort((a, b) => (b.provenance?.lastUpdated ?? "").localeCompare(a.provenance?.lastUpdated ?? ""))
      .slice(0, 9)
      .map((s) => ({ slug: s.id, name: s.name, tagline: s.tagline, city: s.city, category: s.category }));
  } catch {
    return []; // the API can't be reached right now: the rest of the page still stands
  }
}

export default async function Page() {
  return <HomePage startups={await latestStartups()} />;
}
