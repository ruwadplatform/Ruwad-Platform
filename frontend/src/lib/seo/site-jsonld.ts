import { DEFAULT_DESCRIPTION, LOGO_PATH, SITE_NAME, SITE_NAME_ARABIC, SITE_URL, absoluteUrl } from "./site.ts";

/** The address people and search engines land on: the root address permanently redirects to the Dashboard, which is the public home experience, so that is the address the site describes itself with. */
export const HOME_PATH = "/dashboard";

/** What the site says about itself, once, on the home page: who it is and what the website is. Only plain, true statements; no social profiles (none are verified) and no affiliation. */
export function siteJsonLd(): Record<string, unknown>[] {
  const home = absoluteUrl(HOME_PATH);
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      alternateName: ["RUWAD", "Ruwad", "RUWĀD Platform", SITE_NAME_ARABIC],
      url: home,
      logo: absoluteUrl(LOGO_PATH),
      description: DEFAULT_DESCRIPTION,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      alternateName: "RUWĀD Healthcare Platform",
      url: home,
      inLanguage: "en",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ];
}
