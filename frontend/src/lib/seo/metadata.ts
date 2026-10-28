import type { Metadata } from "next";
import { describe } from "./rules";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, OG_IMAGE, SITE_NAME, absoluteUrl, indexingAllowed } from "./site";

/** One place that builds a page's search and sharing metadata, so every page gets the same complete set (title, description, canonical, Open Graph, X/Twitter card)
 * and none can forget one. Next merges a child's `openGraph` and `twitter` over its parent's as whole objects, which is why each page states all of it here. */

const image = { url: absoluteUrl(OG_IMAGE.path), width: OG_IMAGE.width, height: OG_IMAGE.height, alt: OG_IMAGE.alt };

export interface PageMeta {
  /** Page title without the brand; "| RUWĀD" is added by the root template. Pass `absoluteTitle` to use the title exactly as written. */
  title: string;
  absoluteTitle?: boolean;
  description: string;
  /** The page's own path, e.g. "/startups". Used for the canonical address: always the clean path, never a filtered or tracked variant. */
  path: string;
  type?: "website" | "article" | "profile";
  /** Keep this page out of search results (it can still be reached and shared). */
  noindex?: boolean;
}

export function pageMetadata(p: PageMeta): Metadata {
  const url = absoluteUrl(p.path);
  const shownTitle = p.absoluteTitle ? p.title : `${p.title} | ${SITE_NAME}`;
  const description = describe(p.description) || DEFAULT_DESCRIPTION;
  return {
    title: p.absoluteTitle ? { absolute: p.title } : p.title,
    description,
    alternates: { canonical: url },
    openGraph: { type: p.type ?? "website", siteName: SITE_NAME, locale: "en_US", title: shownTitle, description, url, images: [image] },
    twitter: { card: "summary_large_image", title: shownTitle, description, images: [image.url] },
    ...(p.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

/** For pages that belong to a signed-in person, an administrator, or are only tools: they get a plain title and are kept out of search results. */
export function privateMetadata(title: string): Metadata {
  return { title, robots: { index: false, follow: false, nocache: true } };
}

/** Site-wide defaults, set once in the root layout. */
export const ROOT_METADATA: Metadata = {
  metadataBase: new URL(absoluteUrl("/")),
  applicationName: SITE_NAME,
  title: { default: DEFAULT_TITLE, template: `%s | ${SITE_NAME}` },
  description: DEFAULT_DESCRIPTION,
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, url: absoluteUrl("/"), images: [image] },
  twitter: { card: "summary_large_image", title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, images: [image.url] },
  // Anywhere but the real production site, every page says noindex, whatever its own metadata says.
  ...(indexingAllowed() ? {} : { robots: { index: false, follow: false } }),
  // Search Console's HTML-tag check, only if one is configured (the DNS check needs nothing here).
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } } : {}),
};
