import { BadRequestException } from "@nestjs/common";
import { promises as fs } from "fs";
import * as path from "path";
import * as yauzl from "yauzl";
import { PDFParse } from "pdf-parse";

/** Pitch-deck (PDF / PPTX) validation and text extraction.
 *
 * Works from a file on disk (multer diskStorage) rather than a Buffer so a 100 MB upload is
 * never held in memory by the upload layer. Text comes back as ordered "units" — one per PDF
 * page or PPTX slide — so very long decks can be split at page/slide boundaries and no part of
 * the deck (typically the market / funding / team slides near the end) is silently dropped. */

export const PITCH_DECK_MAX_BYTES = 100 * 1024 * 1024;
export const PITCH_DECK_MIME = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;
export type PitchDeckType = keyof typeof PITCH_DECK_MIME;

export const MSG_UNSUPPORTED_TYPE = "Only PDF and PPTX files are supported.";
export const MSG_TOO_LARGE = "Pitch deck must be 100 MB or smaller.";

const MAX_UNITS = 2000; // pages or slides
const MAX_UNIT_CHARS = 20_000;
const MAX_ZIP_ENTRIES = 20_000;
const MAX_XML_BYTES = 25 * 1024 * 1024; // one slide/notes part; guards against zip bombs

export interface TextUnit { label: string; text: string }
export interface ExtractedDeck { units: TextUnit[]; totalUnits: number; skippedUnits: number }

/** A display-safe version of the client's file name (never used as a path). */
export function safeFileName(name: string | undefined): string {
  return path.basename(name ?? "").replace(/[^\p{L}\p{N} ._()-]/gu, "_").slice(0, 120) || "pitch-deck";
}

/** Extension AND declared MIME AND actual bytes must agree. The client-provided MIME alone is never trusted. */
export async function validatePitchDeckFile(file: { originalname: string; mimetype: string; size: number; path: string }): Promise<PitchDeckType> {
  const ext = path.extname(file.originalname ?? "").toLowerCase();
  const type: PitchDeckType | null = ext === ".pdf" ? "pdf" : ext === ".pptx" ? "pptx" : null;
  if (!type || file.mimetype !== PITCH_DECK_MIME[type]) throw new BadRequestException(MSG_UNSUPPORTED_TYPE);
  if (file.size > PITCH_DECK_MAX_BYTES) throw new BadRequestException(MSG_TOO_LARGE);
  if (file.size < 16) throw new BadRequestException("That file is empty or damaged.");

  const fh = await fs.open(file.path, "r");
  try {
    const head = Buffer.alloc(1024);
    const { bytesRead } = await fh.read(head, 0, 1024, 0);
    const bytes = head.subarray(0, bytesRead);
    const ok = type === "pdf" ? bytes.includes("%PDF-") : bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
    if (!ok) throw new BadRequestException(MSG_UNSUPPORTED_TYPE);
  } finally {
    await fh.close();
  }
  return type;
}

export async function extractPitchDeckUnits(filePath: string, type: PitchDeckType): Promise<ExtractedDeck> {
  return type === "pdf" ? extractPdf(filePath) : extractPptx(filePath);
}

/* ---------------------------------------------------------------- PDF ---- */
const PDF_BATCH = 20;

async function extractPdf(filePath: string): Promise<ExtractedDeck> {
  const data = await fs.readFile(filePath);
  const parser = new PDFParse({ data });
  try {
    let total: number;
    try { total = (await parser.getInfo()).total; } catch { throw new BadRequestException("That PDF couldn't be opened. It may be damaged or password-protected."); }
    if (total > MAX_UNITS) throw new BadRequestException(`That PDF has ${total} pages, which is more than we can analyze (${MAX_UNITS} max).`);

    const byPage = new Map<number, string>();
    let skipped = 0;
    for (let first = 1; first <= total; first += PDF_BATCH) {
      const pages = Array.from({ length: Math.min(PDF_BATCH, total - first + 1) }, (_, i) => first + i);
      try {
        const r = await parser.getText({ partial: pages });
        for (const p of r.pages) byPage.set(p.num, p.text);
      } catch {
        // One bad page must not fail the deck: retry the batch page by page.
        for (const n of pages) {
          try { const r = await parser.getText({ partial: [n] }); for (const p of r.pages) byPage.set(p.num, p.text); } catch { skipped++; }
        }
      }
    }
    const units: TextUnit[] = [];
    for (let n = 1; n <= total; n++) {
      const text = (byPage.get(n) ?? "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      if (text) units.push({ label: `Page ${n}`, text: text.slice(0, MAX_UNIT_CHARS) }); // pages with no text layer are skipped (no OCR)
    }
    return { units, totalUnits: total, skippedUnits: skipped };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

/* --------------------------------------------------------------- PPTX ---- */
function openZip(filePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false, validateEntrySizes: true, decodeStrings: true }, (err, zip) => (err || !zip ? reject(err ?? new Error("zip")) : resolve(zip)));
  });
}

function readEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<string> {
  return new Promise((resolve, reject) => {
    if (entry.uncompressedSize > MAX_XML_BYTES) return reject(new Error("part too large"));
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(err ?? new Error("stream"));
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_XML_BYTES) { stream.destroy(); reject(new Error("part too large")); } else chunks.push(c);
      });
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      stream.on("error", reject);
    });
  });
}

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => safeCodePoint(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function safeCodePoint(n: number): string { try { return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ""; } catch { return ""; } }

/** Text of one <a:p> paragraph: runs, line breaks and tabs, in order. */
function paragraphText(p: string): string {
  let out = "";
  for (const m of p.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\s*\/?>|<a:tab\s*\/?>/g)) {
    out += m[1] !== undefined ? decodeXml(m[1]) : m[0].startsWith("<a:br") ? "\n" : "\t";
  }
  return out.replace(/[^\S\n]+/g, " ").trim(); // any run of spaces (incl. non-breaking) -> one space; keep line breaks
}

function bulletLevel(p: string): number {
  const m = /<a:pPr[^>]*\slvl="(\d)"/.exec(p);
  return m ? Number(m[1]) : 0;
}

/** Reading-order text of a slide/notes part: titles, body text, bullets and tables (cells joined with " | "). */
export function slideXmlToText(xml: string, opts: { skipPlaceholders?: string[] } = {}): string {
  const lines: string[] = [];
  const shapes = xml.match(/<p:sp[ >][\s\S]*?<\/p:sp>|<p:graphicFrame[ >][\s\S]*?<\/p:graphicFrame>/g) ?? [];
  for (const shape of shapes) {
    const ph = /<p:ph\b[^>]*?\btype="([^"]+)"/.exec(shape)?.[1];
    if (ph && opts.skipPlaceholders?.includes(ph)) continue;
    const isTitle = ph === "title" || ph === "ctrTitle";
    const blocks = shape.match(/<a:tbl>[\s\S]*?<\/a:tbl>|<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/g) ?? [];
    let first = true;
    for (const b of blocks) {
      try {
        if (b.startsWith("<a:tbl")) {
          for (const row of b.match(/<a:tr[ >][\s\S]*?<\/a:tr>/g) ?? []) {
            const cells = (row.match(/<a:tc[ >][\s\S]*?<\/a:tc>/g) ?? []).map((c) => (c.match(/<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/g) ?? []).map(paragraphText).filter(Boolean).join(" "));
            if (cells.some(Boolean)) lines.push(cells.join(" | "));
          }
        } else {
          const t = paragraphText(b);
          if (!t) continue;
          const lvl = bulletLevel(b);
          lines.push(isTitle && first ? `# ${t}` : lvl > 0 ? `${"  ".repeat(lvl)}- ${t}` : t);
          first = false;
        }
      } catch { /* skip one broken object, keep the slide */ }
    }
  }
  // Consecutive duplicates come from mc:AlternateContent fallbacks.
  return lines.filter((l, i) => l !== lines[i - 1]).join("\n");
}

async function extractPptx(filePath: string): Promise<ExtractedDeck> {
  let zip: yauzl.ZipFile;
  try { zip = await openZip(filePath); } catch { throw new BadRequestException("That PPTX couldn't be opened. It may be damaged or password-protected."); }
  try {
    const entries = new Map<string, yauzl.Entry>();
    await new Promise<void>((resolve, reject) => {
      zip.on("entry", (e: yauzl.Entry) => {
        if (entries.size >= MAX_ZIP_ENTRIES) return reject(new Error("too many entries"));
        entries.set(e.fileName, e);
        zip.readEntry();
      });
      zip.on("end", () => resolve());
      zip.on("error", reject);
      zip.readEntry();
    });
    if (!entries.has("[Content_Types].xml") || !entries.has("ppt/presentation.xml")) throw new BadRequestException("That file isn't a valid PowerPoint (.pptx) presentation.");

    const read = async (name: string): Promise<string | null> => {
      const e = entries.get(name);
      if (!e) return null;
      try { return await readEntry(zip, e); } catch { return null; }
    };

    // Slide order comes from presentation.xml (file names don't follow reordering).
    let order: string[] = [];
    const pres = await read("ppt/presentation.xml");
    const rels = await read("ppt/_rels/presentation.xml.rels");
    if (pres && rels) {
      const target = new Map<string, string>();
      for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
        const id = /\bId="([^"]+)"/.exec(m[0])?.[1], t = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
        if (id && t) target.set(id, t.startsWith("/") ? t.slice(1) : "ppt/" + t.replace(/^\.\//, ""));
      }
      order = [...pres.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)].map((m) => target.get(m[1])).filter((t): t is string => !!t && entries.has(t));
    }
    if (order.length === 0) {
      order = [...entries.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
    }
    if (order.length > MAX_UNITS) throw new BadRequestException(`That deck has ${order.length} slides, which is more than we can analyze (${MAX_UNITS} max).`);

    const units: TextUnit[] = [];
    let skipped = 0;
    for (let i = 0; i < order.length; i++) {
      const xml = await read(order[i]);
      if (xml === null) { skipped++; continue; }
      let text = "";
      try { text = slideXmlToText(xml); } catch { skipped++; }
      // Speaker notes (from the slide's own relationships), labelled so the AI can tell them apart.
      try {
        const relXml = await read(order[i].replace(/slides\/([^/]+)$/, "slides/_rels/$1.rels"));
        const notesRel = relXml && [...relXml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => /notesSlide"/.test(r));
        const notesTarget = notesRel && /\bTarget="([^"]+)"/.exec(notesRel)?.[1];
        if (notesTarget) {
          const nx = await read("ppt/" + notesTarget.replace(/^\.\.\//, ""));
          const nt = nx ? slideXmlToText(nx, { skipPlaceholders: ["sldNum", "sldImg", "hdr", "ftr", "dt"] }) : "";
          if (nt) text += `${text ? "\n" : ""}[Speaker notes] ${nt}`;
        }
      } catch { /* notes are optional */ }
      if (text.trim()) units.push({ label: `Slide ${i + 1}`, text: text.slice(0, MAX_UNIT_CHARS) });
    }
    return { units, totalUnits: order.length, skippedUnits: skipped };
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    throw new BadRequestException("That PPTX couldn't be read. It may be damaged or unusual — please fill in the form manually.");
  } finally {
    zip.close();
  }
}
