import { parseHttpUrl } from "./content-utils";

export interface StructuredEvent {
  name?: string; description?: string; startDate?: string; endDate?: string;
  venue?: string; city?: string; country?: string; organizer?: string;
  image?: string; url?: string; registrationUrl?: string;
}
export interface EventPageInfo {
  structured: StructuredEvent | null;
  title: string; h1: string; ogTitle: string; ogDescription: string; ogImage: string;
  registrationLink: string | null;
}

const decode = (s: string) => s
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&nbsp;/g, " ").replace(/&ndash;|&#8211;/g, "–").replace(/&mdash;|&#8212;/g, "—");
const strip = (s: string) => decode(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);
const datePart = (v: unknown): string | undefined => { const m = typeof v === "string" ? v.match(/^(\d{4}-\d{2}-\d{2})/) : null; return m?.[1]; };

function metaContent(html: string, key: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0] ?? "";
  return decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "");
}

function collectEvents(node: unknown, out: Record<string, any>[]): void {
  if (Array.isArray(node)) { node.forEach((n) => collectEvents(n, out)); return; }
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, any>;
  const types = ([] as string[]).concat(o["@type"] ?? []);
  if (types.some((t) => /Event$/i.test(t) || /^Festival$/i.test(t))) out.push(o);
  if (o["@graph"]) collectEvents(o["@graph"], out);
}

function structuredFromJsonLd(html: string): StructuredEvent | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const events: Record<string, any>[] = [];
  for (const b of blocks) { try { collectEvents(JSON.parse(b.trim()), events); } catch { /* malformed block — ignore */ } }
  const ev = events.find((e) => datePart(e.startDate));
  if (!ev) return null;
  const loc = first(ev.location) as Record<string, any> | string | undefined;
  const addr = typeof loc === "object" ? (first(loc?.address) as Record<string, any> | string | undefined) : undefined;
  const country = typeof addr === "object" ? addr?.addressCountry : undefined;
  const org = first(ev.organizer) as Record<string, any> | string | undefined;
  const offers = first(ev.offers) as Record<string, any> | undefined;
  const img = first(ev.image);
  return {
    name: text(ev.name), description: text(ev.description),
    startDate: datePart(ev.startDate), endDate: datePart(ev.endDate) ?? datePart(ev.startDate),
    venue: typeof loc === "object" ? text(loc?.name) : text(loc),
    city: typeof addr === "object" ? text(addr?.addressLocality) : undefined,
    country: text(typeof country === "object" ? country?.name : country),
    organizer: typeof org === "object" ? text(org?.name) : text(org),
    image: text(typeof img === "object" ? (img as any)?.url : img),
    url: text(ev.url), registrationUrl: text(offers?.url),
  };
}

/** Everything useful and reliable from an event's own web page: structured
 * schema.org Event data when the site provides it, plus the visible headline
 * text (used for the one-unambiguous-date rule) and a registration link. */
export function parseEventPage(html: string, pageUrl: string): EventPageInfo {
  const title = strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const h1 = strip(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  let registrationLink: string | null = null;
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (!/\b(register|registration|book (now|tickets?)|buy tickets?|get tickets?|apply now)\b/i.test(strip(m[2]))) continue;
    const abs = parseHttpUrl(new URL(decode(m[1]), pageUrl).toString());
    if (abs) { registrationLink = abs.toString(); break; }
  }
  return {
    structured: structuredFromJsonLd(html), title, h1,
    ogTitle: metaContent(html, "og:title"), ogDescription: metaContent(html, "og:description") || metaContent(html, "description"),
    ogImage: metaContent(html, "og:image"), registrationLink,
  };
}
