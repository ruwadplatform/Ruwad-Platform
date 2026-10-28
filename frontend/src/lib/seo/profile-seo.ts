import type { ProfileSection } from "./routes.ts";
import { describe } from "./rules.ts";
import { SITE_URL, absoluteUrl } from "./site.ts";

/** The title, description and structured data for a directory profile page, built only from fields the profile page itself shows to a visitor who isn't signed in
 * (name, type, location, founding year, the descriptive text). Never contact details, scores, funding, team, or anything behind the sign-in. Pure, so it is unit-tested. */

export interface ProfileFacts {
  section: ProfileSection;
  slug: string;
  name: string;
  /** Startups and multinationals: the category; investors, hubs and research institutions: the organisation type. */
  kind?: string | null;
  city?: string | null;
  country?: string | null;
  founded?: number | null;
  /** In order of preference; the first usable one becomes the description. */
  text: (string | null | undefined)[];
  updated?: string | null;
}


const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const where = (f: ProfileFacts) => [clean(f.city), clean(f.country)].filter(Boolean).join(", ");

/** What kind of organisation it is, in words: "Diagnostics startup", "Accelerator", "Venture Capital investor". */
function label(f: ProfileFacts): string {
  const kind = clean(f.kind);
  switch (f.section) {
    case "startups": return kind ? `${kind} startup` : "healthcare startup";
    case "investors": return kind ? `${kind} investor` : "healthcare investor";
    case "multinationals": return kind ? `${kind} company` : "healthcare company";
    case "hubs": return kind || "innovation hub";
    case "research": return kind || "research institution";
  }
}

export function profileTitle(f: ProfileFacts): string {
  const place = clean(f.city) || clean(f.country);
  return `${clean(f.name)} — ${label(f)}${place ? ` in ${place}` : ""}`;
}

export function profileDescription(f: ProfileFacts): string {
  const tail = `Profile of ${clean(f.name)} (${label(f)}${where(f) ? `, ${where(f)}` : ""}) on RUWĀD.`;
  const body = describe(...f.text);
  // Leave room for the tail: the body is shortened first.
  return body ? describe(`${body.length > 110 ? body.slice(0, 108).replace(/\s+\S*$/, "") + "…" : body} ${tail}`, body, tail) : tail;
}

/** A ProfilePage whose subject is the organisation. The page is RUWĀD's profile of it, so the page's own address is `url`; the organisation's own website is not asserted. */
export function profileJsonLd(f: ProfileFacts): Record<string, unknown> {
  const pageUrl = absoluteUrl(`/${f.section}/${encodeURIComponent(f.slug)}`);
  const org: Record<string, unknown> = { "@type": "Organization", name: clean(f.name) };
  const description = describe(...f.text);
  if (description) org.description = description;
  const address: Record<string, string> = {};
  if (clean(f.city)) address.addressLocality = clean(f.city);
  if (clean(f.country)) address.addressCountry = clean(f.country);
  if (Object.keys(address).length) org.address = { "@type": "PostalAddress", ...address };
  if (f.founded && f.founded > 1800 && f.founded <= new Date().getFullYear()) org.foundingDate = String(f.founded);
  const page: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: pageUrl,
    name: profileTitle(f),
    isPartOf: { "@type": "WebSite", name: "RUWĀD", url: SITE_URL },
    mainEntity: org,
  };
  if (f.updated && !Number.isNaN(new Date(f.updated).getTime())) page.dateModified = new Date(f.updated).toISOString();
  return page;
}
