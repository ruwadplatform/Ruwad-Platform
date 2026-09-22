import { HC_CATEGORIES } from "@/data/reference";

/** The ONE query parameter the Startups directory reads and writes: /startups?category=Digital%20Health */
export const CATEGORY_PARAM = "category";
/** Older links (`?cat=`) still work; they are read as `category` and rewritten to it. */
const LEGACY_PARAM = "cat";

const key = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

/** Only aliases that real links or data use; everything else matches a category by ignoring case, spaces, "+", "-" and "_". */
const ALIASES: Record<string, string> = { biotech: "Biotechnology", medicaltechnology: "MedTech", medicaldevices: "Medical Devices" };

/** Canonical category label for any spelling of it ("digital-health", "Digital+Health", " medtech " …). Unknown values are kept trimmed. */
export function normalizeCategory(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  const k = key(v);
  return HC_CATEGORIES.find((c) => key(c) === k) ?? ALIASES[k] ?? v;
}

/** Same category regardless of spelling — used when comparing a startup's stored category with a filter value. */
export const sameCategory = (a: string, b: string) => key(normalizeCategory(a)) === key(normalizeCategory(b));

/** Categories requested by a URL's query string (canonical `category`, or legacy `cat`), normalized and de-duplicated. */
export function categoriesFromParams(params: { getAll(name: string): string[] }): string[] {
  const raw = [...params.getAll(CATEGORY_PARAM), ...params.getAll(LEGACY_PARAM)];
  return [...new Set(raw.map(normalizeCategory).filter(Boolean))];
}

/** The Startups URL for a set of categories (none = the plain directory). */
export function startupsUrl(categories: string[] = []): string {
  if (!categories.length) return "/startups";
  return "/startups?" + categories.map((c) => `${CATEGORY_PARAM}=${encodeURIComponent(normalizeCategory(c))}`).join("&");
}
