import { createHash } from "node:crypto";
import { EntityKind } from "../common/enums";

/** The directories the AI Summary supports (Research & Academia is intentionally not one of them yet). */
export const SUMMARY_ENTITY_TYPES = ["startups", "investors", "hubs", "multinationals"] as const;
export type SummaryEntityType = (typeof SUMMARY_ENTITY_TYPES)[number];

export const ENTITY_KIND_BY_TYPE: Record<SummaryEntityType, EntityKind> = {
  startups: EntityKind.STARTUP,
  investors: EntityKind.INVESTOR,
  hubs: EntityKind.HUB,
  multinationals: EntityKind.MULTINATIONAL,
};

export const isSummaryEntityType = (v: string): v is SummaryEntityType => (SUMMARY_ENTITY_TYPES as readonly string[]).includes(v);

/** Text the platform stores when a value is unknown. These must never reach the model as if they were facts. */
const PLACEHOLDERS = new Set(["", "—", "-", "–", "n/a", "na", "none", "unknown", "tbd", "not disclosed", "not publicly disclosed", "undisclosed", "not available", "not applicable", "not specified"]);

export function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.replace(/\s+/g, " ").trim();
  return PLACEHOLDERS.has(v.toLowerCase()) ? undefined : v;
}

export function cleanList(values: unknown, max = 12): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const out = [...new Set(values.map(clean).filter((x): x is string => !!x))].slice(0, max);
  return out.length ? out : undefined;
}

/** A count/amount of 0 is how an unfilled numeric field is stored, so it is "not known", never "zero". */
const positive = (n: unknown): number | undefined => {
  const v = typeof n === "string" ? Number(n) : (n as number);
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
};

/** Drops undefined/empty values so the model only ever sees facts that exist. */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

/** What each summary is about — appended to the shared rules in the prompt. */
export const FOCUS_BY_TYPE: Record<SummaryEntityType, string> = {
  startups: "the company overview, the problem it addresses, its solution, technology, target market and development stage",
  investors: "the investor type, investment thesis, preferred sectors, investment stages, geographic focus and ticket size (only those that are provided)",
  hubs: "the organization's role, the services and programs it offers, who it serves and its contribution to the innovation ecosystem",
  multinationals: "the company's healthcare specialization, main products and services, Saudi and MENA presence and known partnerships",
};

/** Source facts + presentation metadata for one entity. `facts` is exactly what is sent to the AI provider and what the cache fingerprint covers. */
export interface SummaryContext {
  facts: Record<string, unknown>;
  /** Free-text fields that count towards "is there enough to summarize". */
  descriptive: string[];
  provenance: { sources: string[]; confidence: string | null; lastUpdated: string | null };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the loaders hand over plain entity rows; only whitelisted fields are read below. */

export function buildStartupContext(s: any, extra: { sectors?: string[] } = {}): SummaryContext {
  const regulatory = compact({ sfda: clean(s.sfda), fda: clean(s.fda), ceMarking: clean(s.ce), clinicalStatus: clean(s.clinicalStatus), patents: clean(s.patentStatus) });
  const facts = compact({
    name: clean(s.name),
    sector: clean(s.category),
    subsector: clean(s.subsector),
    tagline: clean(s.tagline),
    description: clean(s.desc),
    problem: clean(s.problem),
    solution: clean(s.solution),
    competitiveAdvantage: clean(s.advantage),
    businessModel: clean(s.businessModel),
    developmentStage: clean(s.stage),
    operatingStatus: clean(s.status),
    headquarters: clean(s.hq) ?? [clean(s.city), clean(s.country)].filter(Boolean).join(", "),
    foundedYear: s.foundedBasis && s.foundedBasis !== "KNOWN" ? undefined : positive(s.founded),
    employees: positive(s.employees),
    totalFundingSarMillions: positive(s.fundingTotal),
    currentlyFundraising: s.fundraising ? true : undefined,
    targetRaise: s.fundraising ? clean(s.targetRaise) : undefined,
    targetMarketTAM: clean(s.marketTam),
    targetMarketSAM: clean(s.marketSam),
    regulatoryAndIpStatus: Object.keys(regulatory).length ? regulatory : undefined,
    sectors: cleanList(extra.sectors),
  });
  return finish(facts, [s.desc, s.problem, s.solution, s.advantage, s.tagline], s);
}

export function buildInvestorContext(v: any, extra: { sectors?: string[] } = {}): SummaryContext {
  const facts = compact({
    name: clean(v.name),
    investorType: clean(v.type),
    headquarters: clean(v.city),
    foundedYear: positive(v.founded),
    description: clean(v.desc),
    investmentThesis: clean(v.thesis),
    investmentStages: cleanList(v.stageFocus),
    preferredSectors: cleanList(extra.sectors),
    typicalTicketSize: clean(v.ticket),
    assetsUnderManagement: clean(v.aum),
    numberOfInvestments: positive(v.investments),
    numberOfExits: positive(v.exits),
    healthcareDeals: positive(v.hcDeals),
  });
  return finish(facts, [v.desc, v.thesis], v);
}

export function buildHubContext(h: any, extra: { sectors?: string[]; programs?: any[] } = {}): SummaryContext {
  const programs = (extra.programs ?? [])
    .map((p) => compact({ name: clean(p.name), type: clean(p.type), status: clean(p.status), duration: clean(p.duration), location: clean(p.location), format: clean(p.format) }))
    .filter((p) => Object.keys(p).length)
    .slice(0, 8);
  const facts = compact({
    name: clean(h.name),
    organizationType: clean(h.type),
    city: clean(h.city),
    country: clean(h.country),
    foundedYear: positive(h.founded),
    operatingRegion: clean(h.operatingRegion),
    ownership: clean(h.ownershipType),
    applicationsStatus: clean(h.status),
    description: clean(h.desc),
    about: clean(h.about),
    stagesSupported: cleanList(h.stagesSupported),
    geographicCoverage: cleanList(h.geographicCoverage),
    supportOffered: cleanList(h.support),
    focusAreas: cleanList(h.focusAreas) ?? cleanList(extra.sectors),
    fundingAvailable: clean(h.fundingAvailable),
    fundingType: clean(h.fundingType),
    programs: programs.length ? programs : undefined,
  });
  return finish(facts, [h.desc, h.about], h);
}

export function buildMultinationalContext(m: any, extra: { sectors?: string[]; products?: any[]; partnerships?: any[] } = {}): SummaryContext {
  const products = (extra.products ?? []).map((p) => compact({ name: clean(p.name), category: clean(p.category) })).filter((p) => Object.keys(p).length).slice(0, 10);
  const partnerships = (extra.partnerships ?? []).map((p) => compact({ partner: clean(p.partnerName), type: clean(p.type) })).filter((p) => Object.keys(p).length).slice(0, 10);
  const presence = compact({
    saudiOffice: m.saudiOffice ? true : undefined,
    regionalHeadquarters: m.regionalHeadquarters ? true : undefined,
    manufacturing: m.manufacturing ? true : undefined,
    distribution: m.distribution ? true : undefined,
    clinicalOperations: m.clinicalOperations ? true : undefined,
    researchOperations: m.researchOperations ? true : undefined,
    trainingCenters: m.trainingCenters ? true : undefined,
    countriesActiveIn: cleanList(m.countriesActiveIn, 20),
  });
  const facts = compact({
    name: clean(m.name),
    healthcareSector: clean(m.category),
    subsector: clean(m.subsector),
    tagline: clean(m.tagline),
    description: clean(m.desc),
    solution: clean(m.solution),
    headquarters: clean(m.hq) ?? [clean(m.city), clean(m.country)].filter(Boolean).join(", "),
    foundedYear: positive(m.founded),
    employees: positive(m.employees),
    businessModel: clean(m.businessModel),
    rdFocus: clean(m.rdFocus),
    rdCenters: positive(m.rdCenters),
    saudiAndMenaPresence: Object.keys(presence).length ? presence : undefined,
    products: products.length ? products : undefined,
    partnerships: partnerships.length ? partnerships : undefined,
    sectors: cleanList(extra.sectors),
  });
  return finish(facts, [m.desc, m.solution, m.tagline, m.rdFocus], m);
}

function finish(facts: Record<string, unknown>, descriptiveRaw: unknown[], row: any): SummaryContext {
  return {
    facts,
    descriptive: descriptiveRaw.map(clean).filter((x): x is string => !!x),
    provenance: {
      sources: cleanList(row.provenanceSources, 6) ?? [],
      confidence: clean(row.provenanceConfidence) ?? null,
      lastUpdated: row.provenanceLastUpdated ? String(row.provenanceLastUpdated).slice(0, 10) : null,
    },
  };
}

/** Enough real prose to write a specific summary from? Otherwise we say so instead of padding with filler. */
export function hasEnoughData(ctx: SummaryContext): boolean {
  const chars = ctx.descriptive.reduce((n, t) => n + t.length, 0);
  const structured = Object.keys(ctx.facts).length;
  return chars >= 80 || (ctx.descriptive.length >= 1 && structured >= 8);
}

/** JSON with sorted keys, so the same data always serializes — and hashes — identically. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Fingerprint of the authorized source data + the prompt version: any profile edit, or a prompt change, makes cached text stale. */
export const sourceFingerprint = (facts: Record<string, unknown>, promptVersion: string): string =>
  createHash("sha256").update(`${promptVersion}\n${stableStringify(facts)}`).digest("hex");
