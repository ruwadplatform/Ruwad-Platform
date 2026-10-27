import type { Access } from "./viewer";

/** Server-side field-level access control for the public read endpoints (the five ecosystem directories, reports and analytics).
 *
 * Every response is built from an ALLOW-LIST per record type and access level: a field that is not named here is never sent, so a column added to an entity later stays private
 * until someone decides it is public. The screens' own locks ("Unlock …") are only a presentation of these rules; this is where they are enforced.
 *
 * Levels are cumulative: public < member < owner < admin. Administrators receive the whole record except the keys in NEVER_SENT. */

export type Rec = Record<string, unknown>;

export interface FieldSpec {
  public: readonly string[];
  member?: readonly string[];
  owner?: readonly string[];
}

const LEVEL: Record<Access, number> = { public: 0, member: 1, owner: 2, admin: 3 };
export const atLeast = (access: Access, level: Access): boolean => LEVEL[access] >= LEVEL[level];

/** Internal bookkeeping that is never part of any API response, whoever asks. */
export const NEVER_SENT: readonly string[] = ["foundedBasis", "scoringBasis"];

export function project(payload: Rec | null | undefined, spec: FieldSpec, access: Access): Rec {
  if (!payload) return {};
  const out: Rec = {};
  if (access === "admin") {
    for (const [k, v] of Object.entries(payload)) if (!NEVER_SENT.includes(k)) out[k] = v;
    return out;
  }
  const names = [...spec.public, ...(atLeast(access, "member") ? spec.member ?? [] : []), ...(atLeast(access, "owner") ? spec.owner ?? [] : [])];
  for (const k of names) if (Object.prototype.hasOwnProperty.call(payload, k)) out[k] = payload[k];
  return out;
}

export const projectList = (items: readonly Rec[] | null | undefined, spec: FieldSpec, access: Access): Rec[] => (items ?? []).map((i) => project(i, spec, access));

// ---------------------------------------------------------------- shared pieces

/** One contact block per record. A named person, an email address and a phone number are for signed-in members; the public website and LinkedIn page are not private. */
export const CONTACT: FieldSpec = { public: ["website", "linkedin"], member: ["mainContact", "email", "phone", "extra"] };
export const TEAM_MEMBER: FieldSpec = { public: ["name", "title", "isFounder", "linkedin"] };
export const FUNDING_ROUND: FieldSpec = { public: [], member: ["round", "date", "amount", "lead"] };

/** The provenance strip every profile shows. */
const PROVENANCE = ["provenanceConfidence", "provenanceLastUpdated", "provenanceSources"] as const;

const projectContact = (c: Rec | null | undefined, access: Access): Rec | null => (c ? project(c, CONTACT, access) : null);

// ---------------------------------------------------------------- startups

export const STARTUP_SUMMARY: FieldSpec = {
  public: ["id", "slug", "name", "logo", "logoImageId", "category", "city", "country", "stage", "status", "founded", "employees", "tagline", "ruwadScore", "scoreStatus", "sfda", "provenanceLastUpdated"],
  member: ["fundingTotal"],
};

export const STARTUP_DETAIL: FieldSpec = {
  public: [
    "id", "slug", "name", "logo", "logoImageId", "category", "subsector", "tagline", "country", "city", "hq", "founded", "stage", "status", "businessModel", "employees",
    "desc", "problem", "solution", "advantage", "legalName", "formerName", "website", "linkedin", "verified", "ruwadScore", "scoreStatus", "sfda", ...PROVENANCE,
    "newsItems", "sectors", "team", "products", "hasPendingClaim", "investorCount", "contact",
  ],
  member: [
    "fundingTotal", "valuation", "fundraising", "targetRaise", "fda", "ce", "clinicalStatus", "patentStatus", "marketTam", "marketSam", "marketSom", "marketCompetitors",
    "email", "phone", "traction", "rounds", "investorIds", "scoreConfidence", "scoreVersion", "factors",
  ],
  // A registration number is only ever shown to the people who run the listing. Nothing marks a number as verified and meant for publication, so it is never public.
  owner: ["registrationNumber"],
};

export function startupSummary(full: Rec, access: Access): Rec {
  return project(full, STARTUP_SUMMARY, access);
}

export function startupDetail(full: Rec, access: Access): Rec {
  const out = project(full, STARTUP_DETAIL, access);
  if (access === "admin") return out;
  const investorIds = Array.isArray(full.investorIds) ? (full.investorIds as unknown[]) : [];
  out.investorCount = investorIds.length;
  out.team = projectList(full.team as Rec[], TEAM_MEMBER, access);
  out.contact = projectContact(full.contact as Rec | null, access);
  if (atLeast(access, "member")) out.rounds = projectList(full.rounds as Rec[], FUNDING_ROUND, access);
  return out;
}

// ---------------------------------------------------------------- investors

export const INVESTOR_SUMMARY: FieldSpec = { public: ["id", "slug", "name", "logo", "logoImageId", "type", "city", "ticket", "hcDeals", "desc"] };

export const INVESTOR_LIST_ITEM: FieldSpec = {
  public: ["id", "slug", "name", "logo", "logoImageId", "type", "city", "founded", "verified", "desc", "ticket", "hcDeals", "thesis", "stageFocus", "hcFocus", "portfolioSize"],
};

export const INVESTOR_DETAIL: FieldSpec = {
  public: [
    "id", "slug", "name", "logo", "logoImageId", "short", "type", "city", "founded", "desc", "thesis", "stageFocus", "ticket", "aum", "available", "investments", "exits", "hcDeals",
    "verified", "website", ...PROVENANCE, "openOpps", "news", "sectors", "team", "portfolio", "portfolioSize", "hasPendingClaim",
  ],
  member: ["recentDeals"],
};

/** A company in an investor's portfolio. The company's funding total is not part of it for anyone; the investor's round and year are for members. */
export const PORTFOLIO_STARTUP: FieldSpec = {
  public: ["id", "slug", "name", "logo", "logoImageId", "category", "city", "tagline", "stage", "ruwadScore"],
  member: ["round", "year"],
};

/** How many portfolio companies a visitor sees; the screens show the same preview and offer the rest to members. */
export const GUEST_PORTFOLIO_LIMIT = 3;

export function investorSummary(full: Rec, access: Access): Rec {
  return project(full, INVESTOR_SUMMARY, access);
}

export function investorListItem(full: Rec, access: Access): Rec {
  return project(full, INVESTOR_LIST_ITEM, access);
}

export function investorDetail(full: Rec, access: Access): Rec {
  const out = project(full, INVESTOR_DETAIL, access);
  if (access === "admin") return out;
  const portfolio = (full.portfolio as Rec[] | undefined) ?? [];
  out.portfolioSize = portfolio.length;
  out.portfolio = projectList(atLeast(access, "member") ? portfolio : portfolio.slice(0, GUEST_PORTFOLIO_LIMIT), PORTFOLIO_STARTUP, access);
  out.team = projectList(full.team as Rec[], TEAM_MEMBER, access);
  return out;
}

// ---------------------------------------------------------------- hubs

export const HUB_LIST_ITEM: FieldSpec = {
  public: ["id", "slug", "name", "logo", "logoImageId", "type", "city", "country", "status", "website", "provenanceLastUpdated", "stagesSupported", "healthcareFocus", "programs", "portfolioCount", "eligibility"],
};

export const HUB_DETAIL: FieldSpec = {
  public: [
    "id", "slug", "name", "logo", "logoImageId", "type", "city", "country", "founded", "website", "operatingRegion", "ownershipType", "status", "deadline", "desc", "about",
    "stagesSupported", "geographicCoverage", "support", "fundingAvailable", "fundingType", "hasFunding", "typeDetails", "focusAreas", "eligibility", "application", ...PROVENANCE,
    "sectors", "programs", "portfolio", "partnerships", "contact",
  ],
};

export const hubListItem = (full: Rec, access: Access): Rec => project(full, HUB_LIST_ITEM, access);

export function hubDetail(full: Rec, access: Access): Rec {
  const out = project(full, HUB_DETAIL, access);
  if (access !== "admin") out.contact = projectContact(full.contact as Rec | null, access);
  return out;
}

// ---------------------------------------------------------------- research institutions

export const RESEARCH_LIST_ITEM: FieldSpec = {
  public: ["id", "slug", "name", "logo", "logoImageId", "type", "city", "country", "founded", "about", "numResearchers", "collaborationStatus", "coreResearchAreas", "healthcareFocus", "projectCount", "publicationCount"],
};

export const RESEARCH_DETAIL: FieldSpec = {
  public: [
    "id", "slug", "name", "logo", "logoImageId", "type", "city", "country", "founded", "website", "numResearchers", "numCenters", "numLabs", "about", "collaborationStatus",
    "technologyReadinessLevel", "patentsCount", ...PROVENANCE, "coreResearchAreas", "researchCenters", "facilities", "clinical", "innovation", "sectors", "projects", "publications",
    "technologies", "researchers", "partnerships", "contact",
  ],
  // The named offices, emails and phone numbers of the institution.
  member: ["contacts"],
};

export const researchListItem = (full: Rec, access: Access): Rec => project(full, RESEARCH_LIST_ITEM, access);

export function researchDetail(full: Rec, access: Access): Rec {
  const out = project(full, RESEARCH_DETAIL, access);
  if (access !== "admin") out.contact = projectContact(full.contact as Rec | null, access);
  return out;
}

// ---------------------------------------------------------------- multinationals

export const MULTINATIONAL_LIST_ITEM: FieldSpec = {
  public: [
    "id", "slug", "name", "logo", "logoImageId", "category", "country", "hq", "tagline", "website", "employees", "companySize", "rdCenters", "partnershipInterest", "saudiOffice",
    "countriesActiveIn", "productCount",
  ],
};

export const MULTINATIONAL_DETAIL: FieldSpec = {
  public: [
    "id", "slug", "name", "logo", "logoImageId", "category", "subsector", "tagline", "country", "city", "hq", "founded", "status", "businessModel", "employees", "companySize",
    "desc", "problem", "solution", "advantage", "sfda", "fda", "ce", "clinicalStatus", "patentStatus", "marketTam", "marketSam", "marketSom", "marketCompetitors",
    "saudiOffice", "regionalHeadquarters", "manufacturing", "distribution", "clinicalOperations", "trainingCenters", "researchOperations", "countriesActiveIn", "regionalEmployees",
    "rdFocus", "rdCenters", "openInnovation", "startupCollaboration", "partnershipInterest", "techScouting", "legalName", "website", "linkedin", ...PROVENANCE,
    "startupProgramsList", "newsItems", "products", "partnerships", "contact",
  ],
  // Who the company invests in, and how to reach it.
  member: ["investmentsList", "email", "phone"],
};

export const multinationalListItem = (full: Rec, access: Access): Rec => project(full, MULTINATIONAL_LIST_ITEM, access);

export function multinationalDetail(full: Rec, access: Access): Rec {
  const out = project(full, MULTINATIONAL_DETAIL, access);
  if (access !== "admin") out.contact = projectContact(full.contact as Rec | null, access);
  return out;
}

// ---------------------------------------------------------------- reports

/** Parts of a generated report that exist only because of how it was produced: the search queries, the counters and the link back to a submission. They are not content. */
export const REPORT_PIPELINE_FIELDS: readonly string[] = ["researchQueries", "submissionId", "scope", "generationMode", "reportKind"];

export const REPORT_FIELDS: FieldSpec = {
  public: [
    "id", "slug", "title", "category", "reportType", "publicationDate", "description", "geography", "sector", "authors", "readingTime", "pages", "badges", "executiveSummary",
    "keyFindings", "marketStats", "sections", "sources", ...PROVENANCE, "isPublished", "publishedAt", "origin", "organizationName", "reportDate", "reportUrl", "reportFileId", "referenceLinks",
    "researchedAt", "internalStats", "externalSources", "generated", "aiOverview", "libraryContent", "relatedCompanies", "relatedInvestors", "relatedReports",
  ],
};

/** A hand-written report keeps its analysis for members: visitors read the headline findings and the first chart. */
export const GUEST_REPORT_FINDINGS = 2;

const isLegacyReport = (r: Rec): boolean => !r.generated && !r.libraryContent && r.origin !== "USER_SUBMITTED";

const EXTERNAL_SOURCE: FieldSpec = { public: ["id", "title", "url", "domain", "snippet", "publishedAt", "publishedText", "sourceType", "sourceTypeLabel", "retrievedAt"] };
/** `research` carries the search counters; only whether any research was done is content. */
const GENERATED_RESEARCH_PUBLIC = ["status", "note"] as const;

/** A report about one company repeats that company's restricted facts in its text; a visitor gets the public facts only. */
const SUBJECT_RESTRICTED_FACT = /funding|valuation|fundrais|regulatory|investor/i;
const SUBJECT_RESTRICTED_SECTION = /^(market|funding|investors|traction|clinical)/i;

function redactInternalStats(stats: Rec, access: Access): Rec {
  if (atLeast(access, "member")) return stats;
  const out: Rec = { ...stats };
  // Per-company amounts and targets are for members; the ecosystem-level totals and distributions stay.
  const byName = (a: Rec, b: Rec) => String(a.name).localeCompare(String(b.name));
  if (Array.isArray(stats.companies)) out.companies = (stats.companies as Rec[]).map(({ fundingTotal: _f, ...rest }) => rest).sort(byName);
  if (Array.isArray(stats.distributions)) out.distributions = (stats.distributions as Rec[]).filter((d) => d.key !== "fundingByCompany");
  if (Array.isArray(stats.fundingSought)) out.fundingSought = (stats.fundingSought as Rec[]).map(({ target: _t, ...rest }) => rest).sort(byName);
  const subject = stats.subject as Rec | null | undefined;
  if (subject) {
    out.subject = {
      ...subject,
      facts: ((subject.facts as Rec[]) ?? []).filter((f) => !SUBJECT_RESTRICTED_FACT.test(String(f.label))),
      peers: ((subject.peers as Rec[]) ?? []).filter((f) => !SUBJECT_RESTRICTED_FACT.test(String(f.label)) && !/more recorded/i.test(String(f.label))),
      profile: ((subject.profile as Rec[]) ?? []).filter((p) => !SUBJECT_RESTRICTED_SECTION.test(String(p.heading))),
    };
  }
  return out;
}

function redactGenerated(r: Rec, access: Access): Rec {
  const generated = r.generated as Rec | null | undefined;
  if (!generated) return r;
  const research = (generated.research as Rec | undefined) ?? {};
  const out: Rec = { ...r, generated: { ...generated, research: project(research, { public: GENERATED_RESEARCH_PUBLIC }, "public") } };
  const subject = (r.internalStats as Rec | null | undefined)?.subject;
  if (!atLeast(access, "member") && subject) {
    // The AI overview and the assembled summary lines were written from the company's restricted facts, so a visitor gets the opening line only.
    const lines = ((generated.overviewLines as string[]) ?? []).slice(0, 1);
    out.generated = { ...(out.generated as Rec), overviewLines: lines };
    out.aiOverview = null;
    out.executiveSummary = lines.join(" ");
  }
  return out;
}

function redactLegacy(r: Rec, access: Access): Rec {
  if (atLeast(access, "member") || !isLegacyReport(r)) return r;
  const findings = (r.keyFindings as string[]) ?? [];
  const sections = (r.sections as Rec[]) ?? [];
  let chartShown = false;
  const redactedSections = sections.map((s) => {
    const hasChart = Array.isArray(s.chart) && s.chart.length > 0;
    const keepChart = hasChart && !chartShown;
    if (keepChart) chartShown = true;
    return { heading: s.heading, body: "", chart: keepChart ? s.chart : hasChart ? [] : undefined, chartLocked: hasChart && !keepChart };
  });
  return { ...r, keyFindings: findings.slice(0, GUEST_REPORT_FINDINGS), lockedFindingCount: Math.max(0, findings.length - GUEST_REPORT_FINDINGS), sections: redactedSections, executiveSummary: "" };
}

/** One report as the public API returns it. `access` is the viewer's level; drafts never get here (the service filters them). */
export function reportView(full: Rec, access: Access): Rec {
  if (access === "admin") {
    // Administrators read the pipeline detail through the /reports/admin/* routes; the public routes never carry it.
    const adminView = { ...full };
    for (const k of REPORT_PIPELINE_FIELDS) delete adminView[k];
    return adminView;
  }
  let r = redactLegacy(full, access);
  r = redactGenerated(r, access);
  const stats = r.internalStats as Rec | null | undefined;
  const out = project(r, REPORT_FIELDS, access);
  if (stats) out.internalStats = redactInternalStats(stats, access);
  if (Array.isArray(r.externalSources)) out.externalSources = projectList(r.externalSources as Rec[], EXTERNAL_SOURCE, access);
  if (Array.isArray(r.relatedCompanies)) out.relatedCompanies = (r.relatedCompanies as Rec[]).map((c) => project(c, STARTUP_SUMMARY, access));
  if (Array.isArray(r.relatedInvestors)) out.relatedInvestors = (r.relatedInvestors as Rec[]).map((v) => project(v, INVESTOR_SUMMARY, access));
  if (Array.isArray(r.relatedReports)) out.relatedReports = (r.relatedReports as Rec[]).map((x) => reportListItem(x, access));
  if (r.lockedFindingCount != null) out.lockedFindingCount = r.lockedFindingCount;
  return out;
}

export const reportListItem = (full: Rec, access: Access): Rec => {
  // Classified and redacted as the full report, then trimmed: a list (or a "related report" card) never carries the heavy generated payload or the per-report relations.
  const view = reportView(full, access);
  for (const k of ["internalStats", "externalSources", "generated", "aiOverview", "libraryContent"]) delete view[k];
  delete view.relatedCompanies;
  delete view.relatedInvestors;
  delete view.relatedReports;
  return view;
};

// ---------------------------------------------------------------- analytics

/** Funding amounts per company and per round are for members; counts, scores and the ecosystem-wide totals are public. */
export function analyticsOverview(full: Rec, access: Access): Rec {
  if (atLeast(access, "member")) return full;
  const strip = (rows: unknown): Rec[] => ((rows as Rec[]) ?? []).map(({ fundingTotal: _f, ...rest }) => rest);
  return {
    ...full,
    // A "most funded" ranking reveals the order of the hidden totals, so a visitor does not get one.
    topFundedStartups: [],
    highestScoreStartups: strip(full.highestScoreStartups),
    recentlyFoundedStartups: strip(full.recentlyFoundedStartups),
    recentlyUpdatedStartups: strip(full.recentlyUpdatedStartups),
    recentFundingRounds: [],
  };
}

export function analyticsFundingByStage(full: Rec, access: Access): Rec {
  return atLeast(access, "member") ? full : { ...full, fundingByStage: [] };
}

export function analyticsSectorDistribution(full: Rec, access: Access): Rec {
  return atLeast(access, "member") ? full : { ...full, fundingBySector: [] };
}
