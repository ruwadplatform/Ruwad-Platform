import type { MetadataRoute } from "next";
import { loadProfileRecords } from "@/lib/seo/data";
import { buildSitemap } from "@/lib/seo/rules";
import { indexingAllowed } from "@/lib/seo/site";

/** Refreshed hourly, so new directory profiles reach search engines without a redeploy. */
export const revalidate = 3600;

/** The public pages and public profiles only. Nothing private is listed (a unit test checks the lists against the private routes), and outside the real production site the sitemap is empty. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!indexingAllowed()) return [];
  return buildSitemap(await loadProfileRecords());
}
