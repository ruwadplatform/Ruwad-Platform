import { PROFILE_SECTIONS, ROBOTS_DISALLOW, SITEMAP_STATIC, type ProfileSection } from "./routes.ts";
import { SITE_URL, absoluteUrl, indexingAllowed } from "./site.ts";

/** Everything search-engine-facing that can be decided without a framework: robots.txt, the sitemap's entries, and text clean-up. Unit-tested. */

/** Collapses whitespace and cuts at a word boundary, ending with an ellipsis. Descriptions over ~160 characters are cut by search engines anyway. */
export function truncate(text: string | null | undefined, max = 158): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.\-–—]+$/, "")}…`;
}

/** The text for a meta description: the first usable candidate, shortened. */
export function describe(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    const t = truncate(c);
    if (t.length >= 25) return t;
  }
  return "";
}

/** JSON for a <script type="application/ld+json"> tag. "<" is escaped so no text inside the data can close the tag or start markup. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

export interface RobotsOutput {
  rules: { userAgent: string; allow?: string | string[]; disallow?: string | string[] }[];
  sitemap?: string;
  host?: string;
}

/** robots.txt. On the real production site: everything public is open and the private areas are closed. Anywhere else (a preview or a local build) the whole site is closed. */
export function buildRobots(env: Record<string, string | undefined> = process.env, requestHost?: string): RobotsOutput {
  const canonicalHost = new URL(SITE_URL).host;
  // (SEO_FORCE_INDEXING is the local-check switch from site.ts: it lets a local build show the production rules.)
  const isCanonicalHost = !requestHost || requestHost.toLowerCase() === canonicalHost || env.SEO_FORCE_INDEXING === "true";
  if (!indexingAllowed(env)) return { rules: [{ userAgent: "*", disallow: "/" }] };
  // The production deployment answering on another address (the older *.vercel.app one): crawlable, so search engines can see its noindex header and its canonical tags pointing at the real address, but with no sitemap.
  if (!isCanonicalHost) return { rules: [{ userAgent: "*", allow: "/" }] };
  return { rules: [{ userAgent: "*", allow: "/", disallow: ROBOTS_DISALLOW }], sitemap: `${SITE_URL}/sitemap.xml`, host: SITE_URL };
}

export interface SitemapEntry { url: string; lastModified?: Date; changeFrequency?: "daily" | "weekly" | "monthly"; priority?: number }
export interface ProfileRecord { slug: string; updated?: string | null }

const validDate = (s: string | null | undefined): Date | undefined => {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** The sitemap: the static public pages, then one entry per public profile. Slugs are encoded and de-duplicated; a record with no slug is skipped. */
export function buildSitemap(records: Partial<Record<ProfileSection, ProfileRecord[]>>, extra: SitemapEntry[] = [], now = new Date()): SitemapEntry[] {
  const out: SitemapEntry[] = SITEMAP_STATIC.map((p) => ({ url: absoluteUrl(p.path), lastModified: now, changeFrequency: p.changeFrequency, priority: p.priority }));
  const seen = new Set(out.map((e) => e.url));
  const add = (e: SitemapEntry) => { if (!seen.has(e.url)) { seen.add(e.url); out.push(e); } };
  for (const section of PROFILE_SECTIONS) {
    for (const r of records[section] ?? []) {
      if (!r.slug || /[\s/?#]/.test(r.slug)) continue;
      add({ url: absoluteUrl(`/${section}/${encodeURIComponent(r.slug)}`), lastModified: validDate(r.updated) ?? now, changeFrequency: "weekly", priority: section === "startups" ? 0.7 : 0.6 });
    }
  }
  for (const e of extra) add(e);
  return out;
}
