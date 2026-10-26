import { fetchHubs } from "@/lib/api/hubs";
import { fetchInvestors } from "@/lib/api/investors";
import { fetchMultinationals } from "@/lib/api/multinationals";
import { fetchResearchInstitutions } from "@/lib/api/research";
import { fetchStartups } from "@/lib/api/startups";
import type { ProfileRecord } from "./rules";
import { PROFILES_INDEXABLE } from "./site";
import type { ProfileSection } from "./routes";

type WithSlug = { id: string; provenance?: { lastUpdated?: string | null } };
const toRecords = (rows: WithSlug[]): ProfileRecord[] => rows.map((r) => ({ slug: r.id, updated: r.provenance?.lastUpdated ?? null }));

/** The public directory records (the same lists the directory pages already read from the public API), for the sitemap and the crawlable lists. A backend that can't be reached
 * gives an empty list for that section instead of an error: the sitemap then simply has fewer entries until the next refresh, and nothing breaks. */
export async function loadProfileRecords(): Promise<Record<ProfileSection, ProfileRecord[]>> {
  if (!PROFILES_INDEXABLE) return { startups: [], investors: [], hubs: [], research: [], multinationals: [] };
  const safe = async <T extends WithSlug>(load: () => Promise<T[]>) => { try { return toRecords(await load()); } catch { return []; } };
  const [startups, investors, hubs, research, multinationals] = await Promise.all([
    safe(fetchStartups), safe(fetchInvestors), safe(fetchHubs), safe(fetchResearchInstitutions), safe(fetchMultinationals),
  ]);
  return { startups, investors, hubs, research, multinationals };
}

export interface IndexItem { slug: string; name: string; note: string }
type Described = WithSlug & { name: string; city?: string; category?: string; type?: string };

/** Name, one-line note and address of every public profile in a directory, for the plain list under the directory page. The note is the organisation's own category or type and its city:
 * nothing beyond what the directory card already shows to anyone. Empty if the backend can't be reached. */
export async function loadDirectoryIndex(section: ProfileSection): Promise<IndexItem[]> {
  const loaders: Record<ProfileSection, () => Promise<Described[]>> = {
    startups: fetchStartups, investors: fetchInvestors, hubs: fetchHubs, research: fetchResearchInstitutions, multinationals: fetchMultinationals,
  };
  if (!PROFILES_INDEXABLE) return [];
  try {
    const rows = await loaders[section]();
    return rows.map((r) => ({ slug: r.id, name: r.name, note: [r.category ?? r.type, r.city].filter(Boolean).join(" · ") })).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
