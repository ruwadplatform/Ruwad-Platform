import { api, isNotFound } from "./client";
import { logoUrl } from "./uploads";
import type { Multinational } from "@/types/entities";

interface RawMultinational {
  id: string; slug: string; name: string; category: string; subsector: string; tagline: string; country: string; city: string; hq: string;
  founded: number; status: string; businessModel: string; employees: number; companySize: Multinational["companySize"];
  desc: string; problem: string; solution: string; advantage: string;
  sfda: string; fda: string; ce: string; clinicalStatus: string; patentStatus: string;
  marketTam: string; marketSam: string; marketSom: string; marketCompetitors?: string[];
  saudiOffice: boolean; regionalHeadquarters: boolean; manufacturing: boolean; distribution: boolean;
  clinicalOperations: boolean; trainingCenters: boolean; researchOperations: boolean;
  countriesActiveIn?: string[]; regionalEmployees: string;
  rdFocus: string; rdCenters: number; openInnovation: boolean; startupCollaboration: boolean; partnershipInterest: boolean; techScouting: boolean;
  startupProgramsList?: Multinational["startupProgramsList"]; investmentsList?: Multinational["investmentsList"]; newsItems?: Multinational["newsItems"];
  logo?: string; logoImageId?: string | null; legalName: string; website: string; email: string; phone: string; linkedin: string;
  provenanceConfidence?: Multinational["provenance"]["confidence"]; provenanceLastUpdated: string; provenanceSources?: string[];
  products?: Multinational["products"]; productCount?: number;
  partnerships?: { type: string; partnerName: string; description: string }[];
}

const placeholderProduct = (): Multinational["products"][number] => ({ name: "", category: "", description: "" });

function mapMultinational(r: RawMultinational): Multinational {
  return {
    id: r.slug,
    entityId: r.id,
    name: r.name,
    category: r.category,
    subsector: r.subsector,
    tagline: r.tagline,
    country: r.country,
    city: r.city,
    hq: r.hq,
    founded: r.founded,
    status: r.status,
    businessModel: r.businessModel,
    employees: r.employees,
    companySize: r.companySize,
    desc: r.desc,
    problem: r.problem,
    solution: r.solution,
    advantage: r.advantage,
    regulatory: { sfda: r.sfda, fda: r.fda, ce: r.ce, clinical: r.clinicalStatus, patent: r.patentStatus },
    market: { tam: r.marketTam, sam: r.marketSam, som: r.marketSom, competitors: r.marketCompetitors ?? [] },
    team: [],
    products: r.products ?? new Array(r.productCount ?? 0).fill(null).map(placeholderProduct),
    menaPresence: {
      saudiOffice: r.saudiOffice, regionalHeadquarters: r.regionalHeadquarters, manufacturing: r.manufacturing,
      distribution: r.distribution, clinicalOperations: r.clinicalOperations, trainingCenters: r.trainingCenters,
      researchOperations: r.researchOperations, countriesActiveIn: r.countriesActiveIn ?? [], regionalEmployees: r.regionalEmployees,
    },
    innovationAreas: [r.category],
    rdFocus: r.rdFocus,
    rdCenters: r.rdCenters,
    openInnovation: r.openInnovation,
    startupCollaboration: r.startupCollaboration,
    partnershipInterest: r.partnershipInterest,
    techScouting: r.techScouting,
    startupProgramsList: r.startupProgramsList ?? [],
    partnershipsList: (r.partnerships ?? []).map((p) => ({ type: p.type, desc: p.description })),
    investmentsList: r.investmentsList ?? [],
    logo: r.logo ?? r.name.slice(0, 2).toUpperCase(),
    logoUrl: logoUrl(r.logoImageId),
    legalName: r.legalName,
    website: r.website,
    email: r.email,
    phone: r.phone,
    linkedin: r.linkedin,
    newsItems: r.newsItems ?? [],
    provenance: { lastUpdated: r.provenanceLastUpdated, sources: r.provenanceSources ?? [], confidence: r.provenanceConfidence ?? "High" },
  };
}

export async function fetchMultinationals(): Promise<Multinational[]> {
  const res = await api.get<{ items: RawMultinational[] }>("/multinationals?limit=100");
  return res.items.map(mapMultinational);
}

export async function fetchMultinationalBySlug(slug: string): Promise<Multinational | null> {
  try {
    const raw = await api.get<RawMultinational>(`/multinationals/${slug}`);
    return mapMultinational(raw);
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}
