import type { TextUnit } from "../common/pitch-deck-text";

/** Pure helpers behind the pitch-deck autofill: chunking at page/slide boundaries, coercing the model's
 * output to the declared schema, checking it against the deck's own text ("grounding"), merging
 * per-chunk results, and turning money amounts into the SAR numbers the form stores. Nothing here
 * talks to the AI, the database or the network. */

/* ------------------------------------------------------------ schema ---- */
export interface Prop {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  items?: Prop;
  properties?: Record<string, Prop>;
}
export interface ExtractionTool {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, Prop> };
  /** Top-level keys this tool may return. */
  keys: string[];
}

/** Keeps only what the schema declares, with the declared types. Never trusts the model's JSON as-is. */
export function coerce(value: unknown, prop: Prop): unknown {
  switch (prop.type) {
    case "string": {
      if (typeof value !== "string") return undefined;
      const v = value.replace(/\s+/g, " ").trim();
      return v && !/^(n\/a|null|none|unknown|not (provided|specified|available|mentioned))\.?$/i.test(v) ? v : undefined;
    }
    case "number": return typeof value === "number" && Number.isFinite(value) ? value : undefined;
    case "boolean": return typeof value === "boolean" ? value : undefined;
    case "array": {
      if (!Array.isArray(value) || !prop.items) return undefined;
      const out = value.map((v) => coerce(v, prop.items!)).filter((v) => v !== undefined);
      return out.length ? out : undefined;
    }
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value) || !prop.properties) return undefined;
      const out: Record<string, unknown> = {};
      for (const [k, p] of Object.entries(prop.properties)) {
        const v = coerce((value as Record<string, unknown>)[k], p);
        if (v !== undefined) out[k] = v;
      }
      return Object.keys(out).length ? out : undefined;
    }
  }
}

export function coerceTop(input: unknown, tool: ExtractionTool): Record<string, unknown> {
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const key of tool.keys) {
    const p = tool.input_schema.properties[key];
    const v = p ? coerce(src[key], p) : undefined;
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/* ---------------------------------------------------------- chunking ---- */
export interface Chunk { text: string; labels: string[] }

/** Splits at page/slide boundaries. If the deck is huge, every unit is shortened evenly (first N chars of
 * EVERY page) before chunking, so the end of the deck is never dropped. */
export function buildChunks(units: TextUnit[], maxChunkChars = 60_000, maxChunks = 10): { chunks: Chunk[]; shortened: boolean } {
  for (const cap of [Infinity, 6000, 2500, 1200, 600, 300, 150]) {
    const capped = units.map((u) => ({ label: u.label, text: cap === Infinity ? u.text : u.text.slice(0, cap) }));
    const chunks: Chunk[] = [];
    let cur: string[] = [], labels: string[] = [], size = 0;
    for (const u of capped) {
      const part = `[${u.label}]\n${u.text}`;
      if (size + part.length > maxChunkChars && cur.length) { chunks.push({ text: cur.join("\n\n"), labels }); cur = []; labels = []; size = 0; }
      cur.push(part); labels.push(u.label); size += part.length + 2;
    }
    if (cur.length) chunks.push({ text: cur.join("\n\n"), labels });
    if (chunks.length <= maxChunks) return { chunks, shortened: cap !== Infinity };
  }
  return { chunks: [], shortened: true };
}

/* ---------------------------------------------------------- grounding ---- */
const flat = (s: string) => s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");
/** Spaces collapsed, lower-cased. */
export const normText = (s: string) => flat(s).replace(/\s+/g, " ");
/** Letters and digits only — for matching text that differs only in punctuation/spacing. */
export const compactText = (s: string) => flat(s).replace(/[^\p{L}\p{N}]/gu, "");
const digitsOnly = (s: string) => s.replace(/\D/g, "");

export class SourceText {
  readonly norm: string;
  readonly compact: string;
  readonly digits: string;
  constructor(text: string) { this.norm = normText(text); this.compact = compactText(text); this.digits = digitsOnly(text); }
  has(needle: string): boolean {
    const n = normText(needle);
    if (n && this.norm.includes(n)) return true;
    const c = compactText(needle);
    return c.length >= 3 && this.compact.includes(c);
  }
  hasName(name: string): boolean {
    if (this.has(name)) return true;
    const tokens = normText(name).split(/[\s.,-]+/).filter((t) => t.length > 1);
    return tokens.length > 0 && tokens.every((t) => this.norm.includes(t));
  }
  hasEmail(v: string): boolean { return this.norm.includes(normText(v)); }
  hasUrl(v: string): boolean {
    const host = normText(v).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
    return host.length >= 4 && this.norm.replace(/https?:\/\/(www\.)?/g, "").includes(host);
  }
  hasPhone(v: string): boolean { const d = digitsOnly(v); return d.length >= 7 && this.digits.includes(d); }
}

export interface EvidenceItem { field: string; quote: string }

/** All numeric amounts written in a quote, expanded (2M, 4.2B, 2 million, 1,500,000, 500k…). */
export function amountsInText(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(\d{1,3}(?:[,\u202f ]\d{3})+|\d+)(?:\.(\d+))?\s*(billion|million|thousand|bn|mm|m|b|k)?\b/gi)) {
    const whole = m[1].replace(/[,\u202f ]/g, "");
    let n = Number(m[2] ? `${whole}.${m[2]}` : whole);
    const unit = (m[3] ?? "").toLowerCase();
    if (unit === "billion" || unit === "bn" || unit === "b") n *= 1e9;
    else if (unit === "million" || unit === "mm" || unit === "m") n *= 1e6;
    else if (unit === "thousand" || unit === "k") n *= 1e3;
    out.push(n);
  }
  return out;
}
const sameAmount = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-9);

/** Words a deck may use for each regulatory state, so "cleared by SFDA" can support "Approved". */
const STATUS_WORDS: Record<string, RegExp> = {
  approved: /approv|cleared|clearance|registered|granted|authori[sz]|obtained|received|certified|permitted/i,
  "in progress": /in progress|pending|submitted|applied|application|under review|ongoing|underway|in review|process/i,
  "not submitted": /not (yet )?(submitted|applied|filed|started)|planned|plan to|future|no plans|to be submitted/i,
  "n/a": /n\/a|not applicable|does not apply/i,
};

/** Does this quote really support this particular value (not just exist)? */
export function quoteSupports(field: string, value: unknown, quote: string): boolean {
  if (field === "fundingTotal" || field === "valuation") {
    const amount = (value as { amount?: number } | undefined)?.amount;
    return typeof amount === "number" && amountsInText(quote).some((n) => sameAmount(n, amount));
  }
  if (field === "rounds") {
    const amounts = (Array.isArray(value) ? value : []).map((r) => (r as { amount?: number }).amount).filter((a): a is number => typeof a === "number");
    return amounts.length === 0 || amounts.every((a) => amountsInText(quote).some((n) => sameAmount(n, a)));
  }
  if (field === "founded" || field === "employees") return typeof value === "number" && new RegExp(`(^|\\D)${value}(\\D|$)`).test(quote);
  if (typeof value === "string") {
    const w = STATUS_WORDS[value.trim().toLowerCase()];
    if (w && ["sfda", "fda", "ce"].includes(field)) return w.test(quote);
    return compactText(quote).includes(compactText(value)) || compactText(value).includes(compactText(quote)) && compactText(quote).length >= 8;
  }
  return true;
}

/** Values whose accuracy matters most (money, regulatory, clinical, market size, headcount, year). They are kept only
 * if the model also quotes the deck text that supports them AND that quote really occurs in the deck. */
export const EVIDENCE_REQUIRED = new Set([
  "fundingTotal", "valuation", "targetRaise", "rounds", "sfda", "fda", "ce", "clinicalStatus", "patentStatus", "marketTam", "marketSam", "marketSom", "employees", "founded",
]);

const CONTACT_EMAIL = new Set(["email", "contactEmail", "researchOfficeEmail", "techTransferEmail", "industryPartnershipEmail"]);
const CONTACT_URL = new Set(["website", "linkedin", "contactLinkedin", "applicationUrl"]);
const CONTACT_PHONE = new Set(["phone", "contactPhone"]);
const PEOPLE_ARRAYS = new Set(["founders", "team", "researchers"]);
const NAMED_ARRAYS: Record<string, string> = { products: "name", technologies: "name", partnerships: "partnerName", programs: "name", venturePortfolio: "companyName" };

/** Drops anything the deck's own text doesn't back up. This is what stops invented names, contacts, numbers or statuses. */
export function ground(fields: Record<string, unknown>, evidence: EvidenceItem[], source: SourceText, requireEvidence: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const evidenceOk = (field: string, value: unknown) => evidence.some((e) => e.field === field && e.quote.length >= 3 && e.quote.length <= 600 && source.has(e.quote) && quoteSupports(field, value, e.quote));
  for (const [key, value] of Object.entries(fields)) {
    if (requireEvidence && EVIDENCE_REQUIRED.has(key) && !evidenceOk(key, value)) continue;
    if (key === "name" && typeof value === "string") { if (source.hasName(value)) out[key] = value; continue; }
    if (typeof value === "string" && CONTACT_EMAIL.has(key)) { if (source.hasEmail(value)) out[key] = value; continue; }
    if (typeof value === "string" && CONTACT_URL.has(key)) { if (source.hasUrl(value)) out[key] = value; continue; }
    if (typeof value === "string" && CONTACT_PHONE.has(key)) { if (source.hasPhone(value)) out[key] = value; continue; }
    if (PEOPLE_ARRAYS.has(key) && Array.isArray(value)) {
      const kept = value.filter((p) => p && typeof p === "object" && typeof (p as { name?: unknown }).name === "string" && source.hasName((p as { name: string }).name));
      if (kept.length) out[key] = kept;
      continue;
    }
    if (NAMED_ARRAYS[key] && Array.isArray(value)) {
      const f = NAMED_ARRAYS[key];
      const kept = value.filter((p) => p && typeof p === "object" && typeof (p as Record<string, unknown>)[f] === "string" && source.has((p as Record<string, string>)[f]));
      if (kept.length) out[key] = kept;
      continue;
    }
    if (key === "marketCompetitors" && Array.isArray(value)) {
      const kept = (value as string[]).filter((c) => typeof c === "string" && source.has(c));
      if (kept.length) out[key] = kept;
      continue;
    }
    if (key === "rounds" && Array.isArray(value)) {
      // An investor named as a round's lead must appear in the deck; otherwise the round is kept without inventing a lead.
      out[key] = (value as Record<string, unknown>[]).map((r) => (typeof r.lead === "string" && !source.hasName(r.lead) ? { ...r, lead: undefined } : r)).map(dropUndefined);
      continue;
    }
    out[key] = value;
  }
  return out;
}
function dropUndefined(o: Record<string, unknown>): Record<string, unknown> { return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)); }

/* ------------------------------------------------------------ merging ---- */
/** Free-text fields where chunks describe the same thing at different lengths: the fullest version wins. */
const NARRATIVE_KEYS = new Set(["desc", "about", "problem", "solution", "advantage", "thesis", "tagline"]);
const norm1 = (v: unknown) => (typeof v === "string" ? normText(v) : JSON.stringify(v));
const NAME_KEYS = ["name", "title", "companyName", "partnerName", "lead"];

function itemKey(v: unknown): string {
  if (typeof v === "string") return compactText(v);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of NAME_KEYS) if (typeof o[k] === "string") return `${k}:${compactText(o[k] as string)}` + (k === "title" || k === "lead" ? `|${JSON.stringify(o).length}` : "");
    return JSON.stringify(o);
  }
  return String(v);
}

function mergeObjects(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) if (out[k] === undefined) out[k] = v;
  return out;
}

/** Combines per-chunk results. Lists are de-duplicated (same team member / investor / product across chunks);
 * a narrative field takes its most complete version; any other value on which chunks disagree is left unset
 * rather than guessed. Numbers are never summed. */
export function mergeResults(results: Record<string, unknown>[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  const keys = new Set(results.flatMap((r) => Object.keys(r)));
  for (const key of keys) {
    const vals = results.map((r) => r[key]).filter((v) => v !== undefined);
    if (vals.every(Array.isArray)) {
      const seen = new Map<string, unknown>();
      for (const arr of vals as unknown[][]) for (const item of arr) {
        const k = itemKey(item);
        const prev = seen.get(k);
        seen.set(k, prev && typeof prev === "object" && typeof item === "object" ? mergeObjects(prev as Record<string, unknown>, item as Record<string, unknown>) : prev ?? item);
      }
      merged[key] = [...seen.values()];
      continue;
    }
    if (vals.length === 1) { merged[key] = vals[0]; continue; }
    const distinct = new Map(vals.map((v) => [norm1(v), v]));
    if (distinct.size === 1) { merged[key] = vals[0]; continue; }
    if (vals.every((v) => typeof v === "string") && (NARRATIVE_KEYS.has(key) || vals.every((v) => (v as string).length > 60))) { merged[key] = (vals as string[]).reduce((a, b) => (b.length > a.length ? b : a)); continue; }
    // conflicting facts (an amount, a year, a stage, a status…): unresolved → left out, never guessed
  }
  return merged;
}

/* -------------------------------------------------------------- money ---- */
/** Saudi riyal is pegged to the US dollar at 3.75. Any other currency is not converted (that would be a guess). */
const TO_SAR: Record<string, number> = { SAR: 1, SR: 1, USD: 3.75, US$: 3.75, $: 3.75 };
export function toSar(amount: number, currency: string | undefined): number | undefined {
  const rate = TO_SAR[(currency ?? "").trim().toUpperCase()];
  return rate === undefined || !(amount >= 0) ? undefined : Math.round(amount * rate);
}
