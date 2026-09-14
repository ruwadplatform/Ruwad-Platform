import type { Provenance } from "@/lib/scoring";

export interface SubScores {
  growth: number;
  financial: number;
  market: number;
  team: number;
  regulatory: number;
  tech: number;
}

export interface TeamMember {
  name: string;
  title: string;
  founder: boolean;
}

export interface FundingRound {
  round: string;
  date: string;
  amount: number;
  lead: string;
}

export interface Traction {
  revenue: string;
  growth: string;
  customers: number | string;
  users: string | number;
  partnerships: number;
  pilots: number;
  markets: string;
  awards: string;
}

export interface Regulatory {
  sfda: string;
  fda: string;
  ce: string;
  clinical: string;
  patent: string;
}

export interface Market {
  tam: string;
  sam: string;
  som: string;
  competitors: string[];
}

export interface DocumentRef {
  n: string;
  ok: boolean;
}

export interface NewsItem {
  date: string;
  headline: string;
  source: string;
}

export type VerificationTier = "verified" | "self-reported" | "unclaimed";

export interface Startup {
  id: string;
  name: string;
  category: string;
  subsector: string;
  tagline: string;
  country: string;
  city: string;
  hq: string;
  founded: number;
  stage: string;
  status: string;
  businessModel: string;
  employees: number;
  fundingTotal: number;
  valuation: number;
  fundraising: boolean;
  targetRaise?: string;
  sub: SubScores;
  desc: string;
  problem: string;
  solution: string;
  advantage: string;
  regulatory: Regulatory;
  market: Market;
  team: TeamMember[];
  rounds: FundingRound[];
  investorsList: string[];
  /** Real investor row ids backing investorsList (added for the backend
   * migration — the mock data only ever carried investor names, but a
   * relational join gives us stable ids, which the Investors tab now
   * resolves against the loaded Investors collection instead of a
   * fragile name match). */
  investorIds?: string[];
  traction: Traction;
  logo: string;
  logoUrl?: string | null;
  sector: string;
  legalName: string;
  formerName: string;
  website: string;
  email: string;
  phone: string;
  linkedin: string;
  registrationNumber: string;
  documents: DocumentRef[];
  newsItems: NewsItem[];
  verified: VerificationTier;
  provenance: Provenance;
  score: number;
}

export interface InvestorTeamMember {
  name: string;
  title: string;
}

export interface RecentDeal {
  startup: string;
  round: string;
  date: string;
}

export interface Investor {
  id: string;
  name: string;
  short: string;
  type: string;
  city: string;
  founded: number;
  desc: string;
  thesis: string;
  stageFocus: string[];
  hcFocus: string[];
  ticket: string;
  aum: string;
  available: string;
  investments: number;
  exits: number;
  hcDeals: number;
  portfolio: string[];
  /** Real portfolio-company rows the backend already resolved via the
   * investments join (id/slug/logo/score/etc, not just a name) — the
   * Portfolio tab reads this instead of re-deriving it with a fragile
   * name match against a separately-loaded Startups collection. */
  portfolioDetailed?: { id: string; slug: string; name: string; logo: string; logoUrl?: string | null; category: string; city: string; tagline: string; stage: string; score: number }[];
  logo: string;
  logoUrl?: string | null;
  team: InvestorTeamMember[];
  openOpps: string[];
  recentDeals: RecentDeal[];
  news: NewsItem[];
  provenance: Provenance;
}

/* ================================================================== HUBS & ENABLERS
 * Ported from HUBS_ENABLERS_RAW (js/mock-data.js) — accelerators,
 * incubators, venture studios, government/university programs. No
 * RUWĀD score: hubs aren't investable companies, so there's nothing to
 * score them against (product rule, not an oversight). */
export interface HubProgram {
  name: string;
  type: string;
  status: string;
  duration: string;
  location: string;
  format: string;
  deadline: string;
  cohortSize: string;
}
export interface HubEligibility {
  stage: string;
  location: string;
  sector: string;
  team: string;
  incorporated: string;
  revenue: string;
  techReadiness: string;
  regulatoryStage: string;
  ip: string;
  applicationReq: string;
}
export interface HubPortfolioItem {
  name: string;
  sector: string;
  stage: string;
  location: string;
  program: string;
  year: number;
  /** Populated when the backend matched this entry to a real startup row
   * (by name, at seed time) — lets the Supported Companies tab render a
   * clickable EntityCard without a fragile client-side name lookup. */
  startupId?: string;
  startupSlug?: string;
  startupLogo?: string;
  startupScore?: number;
  startupCategory?: string;
  startupTagline?: string;
}
export interface HubApplication {
  status: string;
  opens: string;
  deadline: string;
  programStarts: string;
  url: string;
  process: string[];
}
export interface HubPartnership {
  type: string;
  partner: string;
  desc: string;
}
export interface HubContacts {
  programContact: string;
  email: string;
  phone: string;
  website: string;
  linkedin: string;
  hq: string;
  applicationLink: string;
}
export interface Hub {
  id: string;
  name: string;
  type: string;
  city: string;
  country: string;
  founded: number;
  website: string;
  operatingRegion: string;
  ownershipType: string;
  status: "Open" | "Closed";
  deadline: string;
  healthcareFocus: string[];
  desc: string;
  about: string;
  focusAreas: string[];
  stagesSupported: string[];
  geographicCoverage: string[];
  programs: HubProgram[];
  eligibility: HubEligibility;
  support: string[];
  fundingAvailable: string;
  fundingType: string;
  portfolio: HubPortfolioItem[];
  partnerships: HubPartnership[];
  documents: DocumentRef[];
  application: HubApplication;
  contacts: HubContacts;
  logo: string;
  logoUrl?: string | null;
  provenance: Provenance;
}

/* ================================================================ RESEARCH & ACADEMIA
 * Ported from RESEARCH_INSTITUTIONS_RAW (js/mock-data.js) plus new
 * fields this phase adds (activeProjects/technologies/researchers/
 * collaborationStatus/technologyReadinessLevel) for the Projects/
 * Technologies/Researchers tabs and the Collaboration/TRL filters — the
 * old app didn't structure these as separate arrays. Deliberately no
 * Data Room, no NDA machinery, no fundraising documents anywhere on this
 * type — explicit product rule: research profiles are knowledge/
 * collaboration profiles, not fundraising profiles. */
export interface ResearchCenter {
  name: string;
  focus: string[];
  principalArea: string;
}
export interface ResearchFacility {
  name: string;
  capabilities: string[];
  externalAccess: string;
}
export interface ResearchClinical {
  trialCapabilities: string;
  hospitalAffiliations: string;
  patientRecruitment: string;
  irb: string;
  clinicalUnits: string;
  translational: string;
  biobanks: string;
  datasets: string;
}
export interface ResearchInnovation {
  techTransferOffice: string;
  spinouts: string;
  startupPrograms: string;
  patents: string;
  licensing: string;
  incubators: string;
  entrepreneurship: string;
  commercialization: string;
}
export interface ResearchPartnership {
  type: string;
  partner: string;
  desc: string;
}
export interface Publication {
  title: string;
  area: string;
  authors: string;
  journal: string;
  year: number;
}
export interface ResearchProject {
  title: string;
  area: string;
  status: string;
  startYear: number;
  partners: string[];
}
export interface ResearchTechnology {
  name: string;
  area: string;
  trl: number;
  status: string;
}
export interface Researcher {
  name: string;
  title: string;
  area: string;
}
export interface ResearchContacts {
  mainContact: string;
  researchOffice: string;
  techTransferOffice: string;
  industryPartnershipOffice: string;
  website: string;
  email: string;
  phone: string;
  linkedin: string;
  location: string;
}
export interface ResearchInstitution {
  id: string;
  name: string;
  type: string;
  city: string;
  country: string;
  founded: number;
  website: string;
  numResearchers: number;
  numCenters: number;
  numLabs: number;
  coreResearchAreas: string[];
  healthcareFocus: string[];
  about: string;
  researchCenters: ResearchCenter[];
  facilities: ResearchFacility[];
  clinical: ResearchClinical;
  innovation: ResearchInnovation;
  partnerships: ResearchPartnership[];
  publications: Publication[];
  activeProjects: ResearchProject[];
  technologies: ResearchTechnology[];
  researchers: Researcher[];
  collaborationStatus: "Open" | "Selective" | "Closed";
  technologyReadinessLevel: number;
  patentsCount: number;
  contacts: ResearchContacts;
  logo: string;
  logoUrl?: string | null;
  provenance: Provenance;
}

/* ============================================================ MULTINATIONAL HEALTHCARE COMPANIES
 * Ported from MULTINATIONALS_RAW (js/mock-data.js), which shares the
 * Startup shape (desc/problem/solution/advantage/regulatory/market/team)
 * plus MNC-specific fields (menaPresence, innovation, partnerships,
 * investments). No RUWĀD score — product rule, multinationals aren't
 * scored the way early-stage startups are. `products` is new this phase
 * (old app's MNC shape didn't structure a product catalog separately). */
export interface MenaPresence {
  saudiOffice: boolean;
  regionalHeadquarters: boolean;
  manufacturing: boolean;
  distribution: boolean;
  clinicalOperations: boolean;
  trainingCenters: boolean;
  researchOperations: boolean;
  countriesActiveIn: string[];
  regionalEmployees: string;
}
export interface MncProduct {
  name: string;
  category: string;
  description: string;
}
export interface MncPartnership {
  type: string;
  desc: string;
}
export interface MncInvestment {
  company: string;
  sector: string;
  round: string;
  year: number;
}
export interface MncStartupProgram {
  name: string;
  type: string;
  geography: string;
  focus: string[];
  status: string;
}
export type CompanySize = "Large Enterprise (10,000+)" | "Enterprise (1,000-9,999)" | "Mid-size (100-999)";
export interface Multinational {
  id: string;
  name: string;
  category: string;
  subsector: string;
  tagline: string;
  country: string;
  city: string;
  hq: string;
  founded: number;
  status: string;
  businessModel: string;
  employees: number;
  companySize: CompanySize;
  desc: string;
  problem: string;
  solution: string;
  advantage: string;
  regulatory: Regulatory;
  market: Market;
  team: TeamMember[];
  products: MncProduct[];
  menaPresence: MenaPresence;
  innovationAreas: string[];
  rdFocus: string;
  rdCenters: number;
  openInnovation: boolean;
  startupCollaboration: boolean;
  partnershipInterest: boolean;
  techScouting: boolean;
  startupProgramsList: MncStartupProgram[];
  partnershipsList: MncPartnership[];
  investmentsList: MncInvestment[];
  logo: string;
  logoUrl?: string | null;
  legalName: string;
  website: string;
  email: string;
  phone: string;
  linkedin: string;
  documents: DocumentRef[];
  newsItems: NewsItem[];
  provenance: Provenance;
}

export interface HubStub {
  id: string;
  name: string;
  status: "Open" | "Closed";
}
