import { api, isNotFound } from "./client";
import { logoUrl } from "./uploads";
import type { Startup } from "@/types/entities";

/** Maps the backend's flat, normalized /startups response onto the exact
 * `Startup` shape the (unmodified) directory/profile UI already expects —
 * nesting regulatory/market/provenance, renaming document/team keys. List
 * rows use the lighter /startups summary payload, so fields the directory
 * never reads are filled with cheap defaults rather than fetched — this
 * keeps `Startup[]` typing intact everywhere with zero component changes. */

interface RawStartup {
  id: string; slug: string; name: string; category: string; subsector?: string; tagline: string;
  country?: string; city: string; hq?: string; founded: number; stage: string; status: string;
  businessModel?: string; employees: number; fundingTotal: number; valuation?: number; fundraising?: boolean; targetRaise?: string;
  desc?: string; problem?: string; solution?: string; advantage?: string;
  sfda: string; fda?: string; ce?: string; clinicalStatus?: string; patentStatus?: string;
  marketTam?: string; marketSam?: string; marketSom?: string; marketCompetitors?: string[];
  legalName?: string; formerName?: string; website?: string; email?: string; phone?: string; linkedin?: string; registrationNumber?: string;
  verified?: Startup["verified"];
  score: number; scoreGrowth?: number; scoreFinancial?: number; scoreMarket?: number; scoreTeam?: number; scoreRegulatory?: number; scoreTech?: number;
  provenanceConfidence?: Startup["provenance"]["confidence"]; provenanceLastUpdated: string; provenanceSources?: string[];
  traction?: Startup["traction"] | null;
  newsItems?: Startup["newsItems"];
  logo?: string;
  logoImageId?: string | null;
  sectors?: string[];
  team?: { name: string; title: string; isFounder: boolean }[];
  rounds?: Startup["rounds"];
  investorIds?: string[];
}

const emptyTraction = (): Startup["traction"] => ({ revenue: "—", growth: "—", customers: "—", users: "—", partnerships: 0, pilots: 0, markets: "—", awards: "—" });

function mapStartup(r: RawStartup): Startup {
  return {
    id: r.slug,
    entityId: r.id,
    name: r.name,
    category: r.category,
    subsector: r.subsector ?? "",
    tagline: r.tagline,
    country: r.country ?? "",
    city: r.city,
    hq: r.hq ?? r.city,
    founded: r.founded,
    stage: r.stage,
    status: r.status,
    businessModel: r.businessModel ?? "",
    employees: r.employees,
    fundingTotal: Number(r.fundingTotal ?? 0),
    valuation: Number(r.valuation ?? 0),
    fundraising: !!r.fundraising,
    targetRaise: r.targetRaise,
    sub: { growth: r.scoreGrowth ?? 0, financial: r.scoreFinancial ?? 0, market: r.scoreMarket ?? 0, team: r.scoreTeam ?? 0, regulatory: r.scoreRegulatory ?? 0, tech: r.scoreTech ?? 0 },
    desc: r.desc ?? "",
    problem: r.problem ?? "",
    solution: r.solution ?? "",
    advantage: r.advantage ?? "",
    regulatory: { sfda: r.sfda, fda: r.fda ?? "—", ce: r.ce ?? "—", clinical: r.clinicalStatus ?? "—", patent: r.patentStatus ?? "—" },
    market: { tam: r.marketTam ?? "—", sam: r.marketSam ?? "—", som: r.marketSom ?? "—", competitors: r.marketCompetitors ?? [] },
    team: (r.team ?? []).map((t) => ({ name: t.name, title: t.title, founder: !!t.isFounder })),
    rounds: r.rounds ?? [],
    investorsList: [],
    investorIds: r.investorIds ?? [],
    traction: r.traction ?? emptyTraction(),
    logo: r.logo ?? r.name.slice(0, 2).toUpperCase(),
    logoUrl: logoUrl(r.logoImageId),
    sector: r.category,
    legalName: r.legalName ?? r.name,
    formerName: r.formerName ?? "—",
    website: r.website ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    linkedin: r.linkedin ?? "",
    registrationNumber: r.registrationNumber ?? "",
    newsItems: r.newsItems ?? [],
    verified: r.verified ?? "unclaimed",
    provenance: { lastUpdated: r.provenanceLastUpdated, sources: r.provenanceSources ?? [], confidence: r.provenanceConfidence ?? "Medium" },
    score: r.score,
  };
}

export async function fetchStartups(): Promise<Startup[]> {
  const res = await api.get<{ items: RawStartup[] }>("/startups?limit=100");
  return res.items.map(mapStartup);
}

export async function fetchStartupBySlug(slug: string): Promise<Startup | null> {
  try {
    const raw = await api.get<RawStartup>(`/startups/${slug}`);
    return mapStartup(raw);
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}
