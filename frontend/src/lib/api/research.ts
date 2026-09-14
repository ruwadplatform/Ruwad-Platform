import { api, isNotFound } from "./client";
import { logoUrl } from "./uploads";
import type { ResearchInstitution } from "@/types/entities";

interface RawResearch {
  id: string; slug: string; name: string; type: string; city: string; country: string; founded: number; website: string;
  numResearchers: number; numCenters?: number; numLabs?: number; about: string;
  coreResearchAreas?: string[]; researchCenters?: ResearchInstitution["researchCenters"]; facilities?: ResearchInstitution["facilities"];
  clinical?: ResearchInstitution["clinical"] | null; innovation?: ResearchInstitution["innovation"] | null;
  contacts?: ResearchInstitution["contacts"] | null;
  collaborationStatus: ResearchInstitution["collaborationStatus"]; technologyReadinessLevel?: number; patentsCount?: number;
  provenanceConfidence?: ResearchInstitution["provenance"]["confidence"]; provenanceLastUpdated: string; provenanceSources?: string[];
  logo?: string; logoImageId?: string | null; sectors?: string[]; healthcareFocus?: string[];
  projects?: ResearchInstitution["activeProjects"]; projectCount?: number;
  publications?: ResearchInstitution["publications"]; publicationCount?: number;
  technologies?: ResearchInstitution["technologies"];
  researchers?: ResearchInstitution["researchers"];
  partnerships?: { type: string; partnerName: string; description: string }[];
}

const placeholderProject = (): ResearchInstitution["activeProjects"][number] => ({ title: "", area: "", status: "", startYear: 0, partners: [] });
const placeholderPublication = (): ResearchInstitution["publications"][number] => ({ title: "", area: "", authors: "", journal: "", year: 0 });

const emptyClinical = (): ResearchInstitution["clinical"] => ({ trialCapabilities: "—", hospitalAffiliations: "—", patientRecruitment: "—", irb: "—", clinicalUnits: "—", translational: "—", biobanks: "—", datasets: "—" });
const emptyInnovation = (): ResearchInstitution["innovation"] => ({ techTransferOffice: "—", spinouts: "—", startupPrograms: "—", patents: "—", licensing: "—", incubators: "—", entrepreneurship: "—", commercialization: "—" });
const emptyContacts = (r: RawResearch): ResearchInstitution["contacts"] => ({ mainContact: "—", researchOffice: "—", techTransferOffice: "—", industryPartnershipOffice: "—", website: r.website, email: "—", phone: "—", linkedin: "—", location: r.city });

function mapResearch(r: RawResearch): ResearchInstitution {
  return {
    id: r.slug,
    name: r.name,
    type: r.type,
    city: r.city,
    country: r.country,
    founded: r.founded,
    website: r.website,
    numResearchers: r.numResearchers,
    numCenters: r.numCenters ?? 0,
    numLabs: r.numLabs ?? 0,
    coreResearchAreas: r.coreResearchAreas ?? [],
    healthcareFocus: r.healthcareFocus ?? r.sectors ?? [],
    about: r.about,
    researchCenters: r.researchCenters ?? [],
    facilities: r.facilities ?? [],
    clinical: r.clinical ?? emptyClinical(),
    innovation: r.innovation ?? emptyInnovation(),
    partnerships: (r.partnerships ?? []).map((p) => ({ type: p.type, partner: p.partnerName, desc: p.description })),
    publications: r.publications ?? new Array(r.publicationCount ?? 0).fill(null).map(placeholderPublication),
    activeProjects: r.projects ?? new Array(r.projectCount ?? 0).fill(null).map(placeholderProject),
    technologies: r.technologies ?? [],
    researchers: r.researchers ?? [],
    collaborationStatus: r.collaborationStatus,
    technologyReadinessLevel: r.technologyReadinessLevel ?? 0,
    patentsCount: r.patentsCount ?? 0,
    contacts: r.contacts ?? emptyContacts(r),
    logo: r.logo ?? r.name.slice(0, 2).toUpperCase(),
    logoUrl: logoUrl(r.logoImageId),
    provenance: { lastUpdated: r.provenanceLastUpdated, sources: r.provenanceSources ?? [], confidence: r.provenanceConfidence ?? "Medium" },
  };
}

export async function fetchResearchInstitutions(): Promise<ResearchInstitution[]> {
  const res = await api.get<{ items: RawResearch[] }>("/research?limit=100");
  return res.items.map(mapResearch);
}

export async function fetchResearchBySlug(slug: string): Promise<ResearchInstitution | null> {
  try {
    const raw = await api.get<RawResearch>(`/research/${slug}`);
    return mapResearch(raw);
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}
