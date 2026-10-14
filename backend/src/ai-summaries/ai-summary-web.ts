import type { ResearchItem } from "../content/research.service";

/** One public web search hit that the summary may draw on. `id` is what the model cites, e.g. "[W2]". */
export interface WebSource { id: string; title: string; url: string; site: string; text: string }

const MAX_SOURCES = 5;
const MAX_PER_SITE = 2;
const MAX_TEXT = 320;

const squash = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function siteOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/** The web search for an organization: its exact name plus where it is, so a common name doesn't pull in another company. */
export function buildWebQuery(facts: Record<string, unknown>): string | null {
  const name = typeof facts.name === "string" ? facts.name.trim() : "";
  if (!name) return null;
  const where = [facts.headquarters, facts.city, facts.country].find((v) => typeof v === "string" && v) as string | undefined;
  return `"${name}" ${where ?? ""} healthcare`.replace(/\s+/g, " ").trim();
}

/** Keeps only results that are clearly about THIS organization (its full name appears in the title or snippet), at most two per website. */
export function selectWebSources(items: ResearchItem[], orgName: string): WebSource[] {
  const needle = squash(orgName);
  if (needle.length < 3) return [];
  const perSite = new Map<string, number>();
  const out: WebSource[] = [];
  for (const it of items) {
    if (out.length >= MAX_SOURCES) break;
    if (!it.url || !/^https?:\/\//i.test(it.url) || !it.snippet) continue;
    if (!squash(`${it.title} ${it.snippet}`).includes(needle)) continue;
    const site = siteOf(it.url);
    if (!site || (perSite.get(site) ?? 0) >= MAX_PER_SITE) continue;
    perSite.set(site, (perSite.get(site) ?? 0) + 1);
    out.push({ id: `W${out.length + 1}`, title: it.title.slice(0, 160), url: it.url, site, text: it.snippet.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT) });
  }
  return out;
}

/** What goes to the model for each web result (no URLs — it only needs the text and a label to cite). */
export const webForPrompt = (sources: WebSource[]) => sources.map((s) => ({ id: s.id, site: s.site, title: s.title, text: s.text }));

/** The web sources a piece of text actually cites, in citation order. */
export function citedSources(text: string, sources: WebSource[]): WebSource[] {
  const ids = [...text.matchAll(/\[(W\d+)\]/g)].map((m) => m[1]);
  const seen = new Set<string>();
  const out: WebSource[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const s = sources.find((x) => x.id === id);
    if (s) out.push(s);
  }
  return out;
}
