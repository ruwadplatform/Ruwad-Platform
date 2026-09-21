/** Reads what a company's OWN web page says about itself: schema.org Organization data, meta tags, and the mailto / tel /
 * LinkedIn links on the page. Pure and forgiving: anything missing is simply absent. */
export interface OrgPageInfo {
  title: string;
  siteName: string;
  orgName: string;
  legalName: string;
  description: string;
  foundingYear: number | null;
  city: string;
  country: string;
  phones: string[];
  emails: string[];
  linkedin: string | null;
}

const decode = (s: string) => s.replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const clean = (s: string) => decode(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function meta(html: string, key: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, "i");
  const tag = re.exec(html)?.[0] ?? "";
  return decode(/content=["']([^"']*)["']/i.exec(tag)?.[1] ?? "").replace(/\s+/g, " ").trim();
}

const ORG_TYPES = /^(Organization|Corporation|MedicalOrganization|LocalBusiness|Hospital|Clinic|MedicalBusiness|ResearchOrganization|Store|Physician)$/;

function findOrg(node: unknown, out: Record<string, any>[], depth = 0): void {
  if (!node || typeof node !== "object" || depth > 6) return;
  if (Array.isArray(node)) { node.forEach((n) => findOrg(n, out, depth + 1)); return; }
  const o = node as Record<string, any>;
  const t = o["@type"];
  const types: string[] = Array.isArray(t) ? t : typeof t === "string" ? [t] : [];
  if (types.some((x) => ORG_TYPES.test(x))) out.push(o);
  if (o["@graph"]) findOrg(o["@graph"], out, depth + 1);
}

export function parseOrgPage(html: string): OrgPageInfo {
  const title = clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  const orgs: Record<string, any>[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { findOrg(JSON.parse(m[1].trim()), orgs); } catch { /* malformed block: skip */ }
  }
  const org = orgs[0] ?? {};
  const addr = org.address && typeof org.address === "object" ? (Array.isArray(org.address) ? org.address[0] : org.address) : {};
  const country = typeof addr?.addressCountry === "object" ? str(addr.addressCountry?.name) : str(addr?.addressCountry);
  const year = /^(\d{4})/.exec(str(org.foundingDate))?.[1];

  const emails = new Set<string>(); const phones = new Set<string>();
  if (str(org.email)) emails.add(str(org.email).replace(/^mailto:/i, ""));
  if (str(org.telephone)) phones.add(str(org.telephone));
  for (const cp of Array.isArray(org.contactPoint) ? org.contactPoint : org.contactPoint ? [org.contactPoint] : []) {
    if (str(cp?.email)) emails.add(str(cp.email).replace(/^mailto:/i, ""));
    if (str(cp?.telephone)) phones.add(str(cp.telephone));
  }
  for (const m of html.matchAll(/href=["']mailto:([^"'?\s]+)/gi)) emails.add(decode(m[1]));
  for (const m of html.matchAll(/href=["']tel:([^"'\s]+)/gi)) phones.add(decodeURIComponent(m[1]).trim());

  const sameAs: string[] = (Array.isArray(org.sameAs) ? org.sameAs : org.sameAs ? [org.sameAs] : []).filter((x: unknown): x is string => typeof x === "string");
  const linkedin = [...sameAs, ...[...html.matchAll(/href=["'](https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/company\/[^"'\s?#]+)/gi)].map((m) => m[1])]
    .find((u) => /linkedin\.com\/company\/[^/]+/i.test(u)) ?? null;

  return {
    title, siteName: meta(html, "og:site_name"), orgName: str(org.name), legalName: str(org.legalName),
    description: str(org.description) || meta(html, "og:description") || meta(html, "description"),
    foundingYear: year ? Number(year) : null, city: str(addr?.addressLocality), country,
    phones: [...phones].slice(0, 5), emails: [...emails].slice(0, 5), linkedin,
  };
}
