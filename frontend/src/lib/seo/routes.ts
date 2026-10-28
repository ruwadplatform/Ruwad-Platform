/** Which top-level routes search engines may see. Every top-level route in `src/app` must be listed in exactly one place here; a unit test fails when a new route is added
 * without a decision, so a private page can never be indexed by accident.
 *
 * INDEXABLE: public pages (and their profile pages) with real content for a visitor who is not signed in.
 * PRIVATE: signed-in, personal, administrative or tool pages. They carry noindex, and the ones that were never public are also disallowed in robots.txt.
 * Pages already indexed by mistake (the sign-in pages) stay crawlable but noindex until search engines drop them, because a page blocked in robots.txt can never be seen to say noindex.
 * The Dashboard (/dashboard) is the public home page: / redirects to it permanently. */

/** Static public pages that belong in the sitemap, most important first. */
export const SITEMAP_STATIC: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
  // The root address permanently redirects to the Dashboard (the public home experience), so the Dashboard is what the sitemap lists, never "/".
  { path: "/dashboard", priority: 1, changeFrequency: "daily" },
  { path: "/startups", priority: 0.9, changeFrequency: "daily" },
  { path: "/investors", priority: 0.8, changeFrequency: "weekly" },
  { path: "/hubs", priority: 0.8, changeFrequency: "weekly" },
  { path: "/research", priority: 0.7, changeFrequency: "weekly" },
  { path: "/multinationals", priority: 0.7, changeFrequency: "weekly" },
  { path: "/ecosystem", priority: 0.7, changeFrequency: "weekly" },
  { path: "/opportunities", priority: 0.6, changeFrequency: "weekly" },
  { path: "/reports", priority: 0.6, changeFrequency: "weekly" },
  { path: "/news", priority: 0.5, changeFrequency: "daily" },
  { path: "/market-map", priority: 0.5, changeFrequency: "monthly" },
];

/** Top-level routes whose pages are indexable, including the profile pages beneath them. */
export const INDEXABLE_ROUTES = ["", "dashboard", "startups", "investors", "hubs", "research", "multinationals", "ecosystem", "opportunities", "reports", "news", "market-map", "discover"];

/** Top-level routes that are never indexed. */
export const PRIVATE_ROUTES = [
  "admin", "workspace", "my-ndas", "my-organizations", "my-reports", "profile", "settings", "introductions", "watchlist", "saved-searches", "submissions", "submit",
  "report-review", "analytics", "screener", "search", "login", "signup", "forgot-password", "reset-password", "api",
];

/** Disallowed in robots.txt: never public, never indexed, nothing to gain from being crawled. (Not /login, /signup or /forgot-password: see the note above.) */
export const ROBOTS_DISALLOW = [
  "/api/", "/admin/", "/workspace/", "/my-ndas", "/my-organizations", "/my-reports", "/profile", "/settings", "/introductions", "/watchlist", "/saved-searches",
  "/submissions", "/submit", "/report-review/", "/analytics", "/reset-password", "/search",
];

/** Profile pages (one per record) and the record type each comes from. */
export const PROFILE_SECTIONS = ["startups", "investors", "hubs", "research", "multinationals"] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];
