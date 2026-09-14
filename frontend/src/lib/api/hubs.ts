import { api, isNotFound } from "./client";
import { logoUrl } from "./uploads";
import type { Hub, HubPortfolioItem } from "@/types/entities";

interface RawHub {
  id: string; slug: string; name: string; type: string; city: string; country: string; founded?: number; website: string;
  operatingRegion?: string; ownershipType?: string; status: "Open" | "Closed"; deadline?: string; desc?: string; about?: string;
  stagesSupported?: string[]; geographicCoverage?: string[]; support?: string[]; fundingAvailable?: string; fundingType?: string;
  focusAreas?: string[]; eligibility?: Hub["eligibility"] | null; application?: Hub["application"] | null;
  provenanceConfidence?: Hub["provenance"]["confidence"]; provenanceLastUpdated: string; provenanceSources?: string[];
  logo?: string; logoImageId?: string | null; sectors?: string[]; healthcareFocus?: string[];
  programs?: Hub["programs"]; programCount?: number;
  portfolio?: HubPortfolioItem[]; portfolioCount?: number;
  partnerships?: { type: string; partnerName: string; description: string }[];
  documents?: { name: string; onFile: boolean }[];
  contact?: { mainContact?: string; email?: string; phone?: string; website?: string; linkedin?: string; extra?: { hq?: string; applicationLink?: string } } | null;
}

const placeholderProgram = (): Hub["programs"][number] => ({ name: "", type: "", status: "", duration: "", location: "", format: "", deadline: "", cohortSize: "" });
const placeholderPortfolioItem = (): HubPortfolioItem => ({ name: "", sector: "", stage: "", location: "", program: "", year: 0 });

const emptyEligibility = (): Hub["eligibility"] => ({ stage: "—", location: "—", sector: "—", team: "—", incorporated: "—", revenue: "—", techReadiness: "—", regulatoryStage: "—", ip: "—", applicationReq: "—" });
const emptyApplication = (): Hub["application"] => ({ status: "—", opens: "—", deadline: "—", programStarts: "—", url: "", process: [] });

function mapHub(r: RawHub): Hub {
  return {
    id: r.slug,
    name: r.name,
    type: r.type,
    city: r.city,
    country: r.country,
    founded: r.founded ?? 0,
    website: r.website,
    operatingRegion: r.operatingRegion ?? "—",
    ownershipType: r.ownershipType ?? "—",
    status: r.status,
    deadline: r.deadline ?? "—",
    healthcareFocus: r.healthcareFocus ?? r.sectors ?? [],
    desc: r.desc ?? "",
    about: r.about ?? "",
    focusAreas: r.focusAreas ?? [],
    stagesSupported: r.stagesSupported ?? [],
    geographicCoverage: r.geographicCoverage ?? [],
    programs: r.programs ?? new Array(r.programCount ?? 0).fill(null).map(placeholderProgram),
    eligibility: r.eligibility ?? emptyEligibility(),
    support: r.support ?? [],
    fundingAvailable: r.fundingAvailable ?? "—",
    fundingType: r.fundingType ?? "—",
    portfolio: r.portfolio ?? new Array(r.portfolioCount ?? 0).fill(null).map(placeholderPortfolioItem),
    partnerships: (r.partnerships ?? []).map((p) => ({ type: p.type, partner: p.partnerName, desc: p.description })),
    documents: (r.documents ?? []).map((d) => ({ n: d.name, ok: d.onFile })),
    application: r.application ?? emptyApplication(),
    contacts: {
      programContact: r.contact?.mainContact ?? "—",
      email: r.contact?.email ?? "—",
      phone: r.contact?.phone ?? "—",
      website: r.contact?.website ?? r.website,
      linkedin: r.contact?.linkedin ?? "—",
      hq: r.contact?.extra?.hq ?? r.city,
      applicationLink: r.contact?.extra?.applicationLink ?? "",
    },
    logo: r.logo ?? r.name.slice(0, 2).toUpperCase(),
    logoUrl: logoUrl(r.logoImageId),
    provenance: { lastUpdated: r.provenanceLastUpdated, sources: r.provenanceSources ?? [], confidence: r.provenanceConfidence ?? "Medium" },
  };
}

export async function fetchHubs(): Promise<Hub[]> {
  const res = await api.get<{ items: RawHub[] }>("/hubs?limit=100");
  return res.items.map(mapHub);
}

export async function fetchHubBySlug(slug: string): Promise<Hub | null> {
  try {
    const raw = await api.get<RawHub>(`/hubs/${slug}`);
    return mapHub(raw);
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}
