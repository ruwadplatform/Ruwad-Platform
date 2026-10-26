/** What search engines are told about RUWĀD. Plain values, no framework imports, so the rules built on them are unit-tested with `node --test`.
 *
 * The canonical address is https://www.ruwad.studio. That is what the production domain actually does: the bare ruwad.studio answers with a permanent
 * redirect to www (checked against the live site), and the older ruwad-platform.vercel.app address still serves the same pages, so it must point
 * at the canonical address and stay out of the index. Set NEXT_PUBLIC_SITE_URL only if the production hostname ever changes. */

export const SITE_NAME = "RUWĀD";
export const SITE_NAME_ARABIC = "روّاد";

const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
export const SITE_URL = (/^https?:\/\//.test(configured) ? configured : "https://www.ruwad.studio").replace(/\/+$/, "");
export const SITE_HOST = new URL(SITE_URL).host;

export const DEFAULT_TITLE = "RUWĀD — Saudi Healthcare Innovation Ecosystem";
export const TITLE_SUFFIX = "RUWĀD";
export const DEFAULT_DESCRIPTION =
  "RUWĀD maps the Saudi and MENA healthcare innovation ecosystem: healthcare, biotech and medtech startups, investors, research institutions, innovation hubs and multinational healthcare companies, in one place.";

/** The social-sharing picture (1200 x 630), served from /public. */
export const OG_IMAGE = { path: "/og/ruwad-share.png", width: 1200, height: 630, alt: "RUWĀD — Saudi Healthcare Innovation Ecosystem" };
export const LOGO_PATH = "/og/ruwad-logo.png";

/** Advisory Services is built but switched off until it is approved for launch; nothing about it is advertised to search engines while this is false. Build-time, like the app itself. */
export const ADVISORY_ENABLED = process.env.NEXT_PUBLIC_ADVISORY_ENABLED === "true";

/** The organisation RUWĀD is connected with, ONLY if the owners confirm it for public use (for example "KaRama Venture Studio"). Left empty on purpose: no affiliation is claimed
 * anywhere until this is filled in. */
export const AFFILIATED_ORGANIZATION: { name: string; url?: string } | null = null;

/** Profile pages (one per startup, investor, hub, institution, company) are indexable by default. Set SEO_INDEX_PROFILES=false at build time to keep them out of search results, the sitemap and the public lists, for example while the data shown on them is being reviewed. */
export const PROFILES_INDEXABLE = process.env.SEO_INDEX_PROFILES !== "false";

export const absoluteUrl = (path: string): string => `${SITE_URL}${path === "/" ? "" : path.startsWith("/") ? path : `/${path}`}`;

/** Search engines may index only the real production deployment. Previews, local builds and anything else are told to stay out. `SEO_FORCE_INDEXING=true` exists only so the
 * production rules can be checked on a local build. */
export function indexingAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === "production" || env.SEO_FORCE_INDEXING === "true";
}
