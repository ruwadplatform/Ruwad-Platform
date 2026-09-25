import { extractDocumentText } from "../../common/document-text-extractor";
import { fetchDocument, type DocumentFetch } from "../../content/safe-fetch";
import type { LibraryFact, VerifiedFact } from "./library-types";

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: "-", mdash: "-", hellip: "..." };
const charClass = (codes: number[]) => new RegExp(`[${codes.map((c) => String.fromCharCode(c)).join("")}]`, "g");
const SINGLE_QUOTES = charClass([0x2018, 0x2019, 0x201b, 0x2032]);
const DOUBLE_QUOTES = charClass([0x201c, 0x201d, 0x201e, 0x2033]);
const DASHES = charClass([0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212]);
const SPACES = charClass([0xa0, 0x200b, 0x200e, 0x200f, 0xfeff]);

/** Text comparison form: entities decoded, typographic quotes/dashes flattened, whitespace collapsed, case ignored. */
export function normalizeForMatch(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .normalize("NFKC")
    .replace(SINGLE_QUOTES, "'").replace(DOUBLE_QUOTES, '"').replace(DASHES, "-")
    .replace(SPACES, " ")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

export function htmlToText(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, " ").replace(/<[^>]+>/g, " ");
}

async function documentText(doc: Extract<DocumentFetch, { ok: true }>): Promise<string> {
  if (doc.body.subarray(0, 5).toString() === "%PDF-" || /application\/pdf/i.test(doc.contentType)) {
    return extractDocumentText({ buffer: doc.body, mimetype: "application/pdf" } as Express.Multer.File);
  }
  return htmlToText(doc.body.toString("utf8"));
}

export function quoteIsOnPage(quote: string, pageText: string): boolean {
  const q = normalizeForMatch(quote);
  return q.length > 0 && normalizeForMatch(pageText).includes(q);
}

/** Every number written in `text`, as a canonical value ("4,000" and "4000" are the same; "09" is 9). */
export function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => String(parseFloat(n.replace(/,/g, ""))));
}

/** Numbers a fact's statement uses that its quote (or its stated year / period / publication date) does not contain. */
export function unsupportedNumbers(fact: Pick<LibraryFact, "statement" | "quote" | "year" | "period" | "publishedOn">): string[] {
  const allowed = new Set(numbersIn([fact.quote, String(fact.year), fact.period ?? "", fact.publishedOn ?? ""].join(" ")));
  return [...new Set(numbersIn(fact.statement).filter((n) => !allowed.has(n)))];
}

export interface DroppedFact { id: string; reason: string }

/** Re-reads each fact's source page and keeps only facts whose verbatim quote is still there.
 * - quote found on the live page → "live"
 * - page unreachable / blocked (the server can't read it) → kept as "manual", i.e. verified by an analyst on `verifiedOn`
 * - page read but quote missing, page gone (404/410), or the statement uses a number its quote lacks → dropped. */
export async function verifyFacts(
  facts: LibraryFact[], fetcher: (url: string) => Promise<DocumentFetch> = fetchDocument, now = new Date(),
): Promise<{ facts: VerifiedFact[]; dropped: DroppedFact[] }> {
  const dropped: DroppedFact[] = [];
  const checkedAt = now.toISOString();
  const byUrl = new Map<string, LibraryFact[]>();
  for (const f of facts) byUrl.set(f.url, [...(byUrl.get(f.url) ?? []), f]);

  const kept = new Map<string, VerifiedFact>();
  const urls = [...byUrl.keys()];
  const workers = Array.from({ length: 4 }, async () => {
    for (let url = urls.shift(); url; url = urls.shift()) {
      const group = byUrl.get(url)!;
      let doc: DocumentFetch = { ok: false, reason: "unreachable" };
      try { doc = await fetcher(url); } catch { /* treated as unreachable */ }
      let text: string | null = null;
      if (doc.ok) { try { text = await documentText(doc); } catch { text = null; } }
      for (const f of group) {
        const bad = unsupportedNumbers(f);
        if (bad.length) { dropped.push({ id: f.id, reason: `statement uses number(s) not in its quote: ${bad.join(", ")}` }); continue; }
        if (text !== null) {
          if (quoteIsOnPage(f.quote, text)) kept.set(f.id, { ...f, verification: "live", checkedAt });
          else dropped.push({ id: f.id, reason: "quote no longer found on the source page" });
        } else if (!doc.ok && doc.reason === "http" && (doc.status === 404 || doc.status === 410)) {
          dropped.push({ id: f.id, reason: `source page is gone (HTTP ${doc.status})` });
        } else {
          kept.set(f.id, { ...f, verification: "manual", checkedAt });
        }
      }
    }
  });
  await Promise.all(workers);
  return { facts: facts.map((f) => kept.get(f.id)).filter((x): x is VerifiedFact => !!x), dropped };
}
