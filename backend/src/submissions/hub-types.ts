/** Server-side rules for the Hub / Enabler submission form.
 *
 * The form is "shared core fields + type-specific fields": SHARED_RULES apply
 * to every type, BY_TYPE adds what each of the nine types needs. This file is
 * the authority for submit-time validation and for what the publisher may
 * persist; the frontend (features/submissions/schemas/hub*.ts) mirrors the
 * same field names, requirements and conditions for the UI. Keep the two in
 * step — a parity check compares them (see the PR notes).
 *
 * Deliberately not a class-validator DTO: which fields are required depends
 * on the selected Type, which decorators can't express cleanly. */

export const HUB_TYPE_NAMES = [
  "Accelerator", "Incubator", "Venture Studio", "Innovation Hub", "Government Program",
  "University Program", "Research Center", "Corporate Innovation Program", "Ecosystem Enabler",
] as const;
export type HubTypeName = (typeof HUB_TYPE_NAMES)[number];

export const OWNERSHIP_TYPES = ["Private", "Government", "University", "Corporate", "Non-profit"] as const;

type Kind = "string" | "number" | "boolean" | "strings" | "objects";
export interface Rule {
  name: string;
  kind: Kind;
  required?: boolean;
  max?: number;
  min?: number;
  enum?: readonly string[];
  /** Applies (and is required, if `required`) only while another field of
   * the same object has this value — e.g. fundingType only when hasFunding. */
  when?: { field: string; equals: unknown };
  itemRules?: Rule[];
  maxItems?: number;
}

const s = (name: string, o: Partial<Rule> = {}): Rule => ({ name, kind: "string", ...o });
const n = (name: string, o: Partial<Rule> = {}): Rule => ({ name, kind: "number", ...o });
const b = (name: string, o: Partial<Rule> = {}): Rule => ({ name, kind: "boolean", ...o });
const list = (name: string, o: Partial<Rule> = {}): Rule => ({ name, kind: "strings", ...o });
const objs = (name: string, itemRules: Rule[], o: Partial<Rule> = {}): Rule => ({ name, kind: "objects", itemRules, maxItems: 20, ...o });

const OPEN_CLOSED = ["Open", "Closed"] as const;
const FORMATS = ["In-person", "Remote", "Hybrid"] as const;

const PROGRAMS = objs("programs", [
  s("name", { required: true, max: 150 }), s("type", { required: true, max: 100 }),
  s("status", { required: true, enum: OPEN_CLOSED }), s("duration", { required: true, max: 60 }),
  s("location", { required: true, max: 100 }), s("format", { required: true, enum: FORMATS }),
  s("deadline", { required: true, max: 60 }), s("cohortSize", { required: true, max: 40 }),
]);
const PARTNERSHIPS = objs("partnerships", [
  s("type", { required: true, max: 100 }), s("partnerName", { required: true, max: 150 }), s("description", { max: 500 }),
]);
const FUNDING = [
  b("hasFunding"),
  s("fundingType", { max: 100, required: true, when: { field: "hasFunding", equals: true } }),
  s("fundingAmount", { max: 100, when: { field: "hasFunding", equals: true } }),
];

export const SHARED_RULES: Rule[] = [
  s("logoImageId"),
  s("name", { required: true, max: 150 }),
  s("type", { required: true, enum: HUB_TYPE_NAMES }),
  s("city", { required: true }), s("country", { required: true }),
  n("founded", { required: true, min: 1900, max: 2100 }),
  s("website", { required: true, max: 200 }),
  s("operatingRegion", { required: true, max: 100 }),
  s("ownershipType", { required: true, enum: OWNERSHIP_TYPES }),
  s("desc", { required: true, max: 500 }), s("about", { required: true, max: 2000 }),
  list("geographicCoverage"), list("healthcareFocus"), list("support"),
  s("applicationUrl", { max: 200 }),
  s("contactName", { max: 150 }), s("contactEmail", { max: 150 }), s("contactPhone", { max: 40 }), s("contactLinkedin", { max: 200 }),
  list("documentChecklist"),
];

export const BY_TYPE: Record<HubTypeName, Rule[]> = {
  "Accelerator": [
    s("status", { enum: OPEN_CLOSED }), s("deadline", { required: true, max: 60 }), s("programDuration", { required: true, max: 60 }),
    list("stagesSupported"), s("cohortSize", { max: 40 }), n("cohortsPerYear", { min: 0 }), s("programFormat", { enum: FORMATS }),
    b("mentorshipAvailable"), b("demoDay"), b("investorIntroductions"), b("clinicalAccess"), b("regulatorySupport"), b("marketAccessSupport"),
    ...FUNDING,
    b("equityRequired"), s("equityPercentage", { max: 40, when: { field: "equityRequired", equals: true } }),
    PROGRAMS, PARTNERSHIPS,
  ],
  "Incubator": [
    s("incubationDuration", { required: true, max: 60 }), s("status", { enum: OPEN_CLOSED }), s("deadline", { required: true, max: 60 }),
    list("stagesSupported"),
    b("physicalWorkspace"), b("laboratoryAccess"), b("technicalInfrastructure"), b("mentorshipAvailable"), b("investorIntroductions"),
    s("graduationCriteria", { max: 1000 }), n("companiesSupportedAnnually", { min: 0 }),
    b("hasFunding"), s("fundingType", { max: 100, required: true, when: { field: "hasFunding", equals: true } }),
    PROGRAMS, PARTNERSHIPS,
  ],
  "Venture Studio": [
    s("ventureStudioModel", { required: true, enum: ["Internal Idea Creation", "Founder Partnership", "Corporate Venture Building", "Mixed Model"] }),
    list("ventureStages"), s("ideaSourcingModel", { max: 300 }),
    b("coFounderSupport"), b("productDevelopmentSupport"), b("regulatorySupport"), b("clinicalValidationSupport"), b("goToMarketSupport"), b("fundraisingSupport"),
    b("founderApplicationsAccepted"),
    s("initialCapitalPerVenture", { max: 100 }), b("followOnInvestmentAvailable"), s("equityModel", { max: 300 }), s("typicalEquityStake", { max: 60 }),
    n("venturesCreated", { min: 0 }), n("activeVentures", { min: 0 }), n("exitedVentures", { min: 0 }),
    objs("venturePortfolio", [
      s("companyName", { required: true, max: 150 }), s("sector", { required: true }), s("stage"),
      n("yearCreated", { min: 1900, max: 2100 }), s("status", { enum: ["Active", "Exited", "Discontinued"] }), s("website", { max: 200 }),
    ]),
    PARTNERSHIPS,
  ],
  "Innovation Hub": [
    s("hubModel", { required: true, enum: ["Physical", "Virtual", "Hybrid"] }),
    b("membershipAvailable"), s("membershipType", { max: 100, when: { field: "membershipAvailable", equals: true } }),
    list("facilitiesAvailable"),
    b("innovationChallenges"), b("startupPrograms"), b("networkingEvents"), b("mentorshipAvailable"), b("corporateConnections"), b("investorConnections"), b("governmentConnections"),
    n("annualEvents", { min: 0 }), n("companiesSupported", { min: 0 }), n("communitySize", { min: 0 }),
    PARTNERSHIPS,
  ],
  "Government Program": [
    s("governmentEntity", { required: true, max: 150 }), s("governmentAuthority", { max: 150 }), s("programObjective", { required: true, max: 1000 }),
    list("targetBeneficiaries"), s("eligibilityRequirements", { max: 1000 }),
    s("status", { enum: OPEN_CLOSED }), s("deadline", { required: true, max: 60 }), s("programDuration", { max: 60 }),
    list("nationalStrategyAlignment"),
    ...FUNDING,
    b("regulatorySupport"), b("marketAccessSupport"), b("procurementSupport"), b("clinicalValidationSupport"),
  ],
  "University Program": [
    s("universityName", { required: true, max: 150 }), s("college", { max: 150 }), s("department", { max: 150 }),
    s("universityProgramType", { required: true, enum: ["Incubator", "Accelerator", "Entrepreneurship Center", "Technology Transfer", "Research Commercialization", "Innovation Lab"] }),
    list("eligibleParticipants"),
    b("researchCommercializationSupport"), b("technologyTransferOffice"), b("patentSupport"), b("startupFormationSupport"), b("laboratoryAccess"), b("clinicalResearchAccess"),
    b("hasFunding"), s("fundingAmount", { max: 100, when: { field: "hasFunding", equals: true } }),
    n("startupsSupported", { min: 0 }), n("technologiesCommercialized", { min: 0 }),
    PARTNERSHIPS,
  ],
  "Research Center": [
    s("parentInstitution", { required: true, max: 150 }), list("researchAreas", { required: true }),
    list("researchCapabilities"), list("laboratories"),
    b("clinicalTrialCapability"), b("biobankAvailable"), b("datasetAccess"), b("technologyTransferOffice"),
    objs("researchPrograms", [
      s("name", { required: true, max: 150 }), s("area", { max: 100 }), s("leadDepartment", { max: 150 }),
      s("status", { enum: ["Ongoing", "Completed", "Planned"] }), s("description", { max: 500 }), b("collaborationAvailable"),
    ]),
    b("industryCollaboration"), b("startupCollaboration"), b("researchLicensing"),
    n("publicationsCount", { min: 0 }), n("patentsCount", { min: 0 }), list("technologiesForLicensing"),
    PARTNERSHIPS,
  ],
  "Corporate Innovation Program": [
    s("parentCompany", { required: true, max: 150 }), s("industrySegment", { max: 150 }),
    list("startupEngagementModel", { required: true }), list("startupStagesAccepted"),
    s("status", { enum: OPEN_CLOSED }), s("deadline", { required: true, max: 60 }),
    list("technologyAreas"), list("innovationChallengeTopics"), list("startupBenefits"),
    b("pilotOpportunities"), b("procurementOpportunities"), b("investmentAvailable"), b("corporateVentureCapital"),
    s("typicalInvestmentSize", { max: 100, when: { field: "corporateVentureCapital", equals: true } }),
    PARTNERSHIPS,
  ],
  "Ecosystem Enabler": [
    s("enablerCategory", {
      required: true,
      enum: ["Consulting", "Legal", "Regulatory", "Technology", "Funding Support", "Market Access", "Clinical Support", "Commercialization", "Networking", "Industry Association", "Government Support", "Talent", "Other"],
    }),
    list("servicesOffered", { required: true }), list("targetAudience"),
    b("membershipRequired"), s("membershipType", { max: 100, when: { field: "membershipRequired", equals: true } }),
    b("eventsNetworking"), b("mentorshipAvailable"), b("investorIntroductions"), b("corporateIntroductions"), b("governmentIntroductions"),
    n("organizationsSupported", { min: 0 }), s("partnershipOpportunities", { max: 1000 }),
    PARTNERSHIPS,
  ],
};

export function isHubType(v: unknown): v is HubTypeName {
  return typeof v === "string" && (HUB_TYPE_NAMES as readonly string[]).includes(v);
}

export function rulesFor(type: unknown): Rule[] {
  return isHubType(type) ? [...SHARED_RULES, ...BY_TYPE[type]] : SHARED_RULES;
}

export function typeHasRule(type: unknown, name: string): boolean {
  return isHubType(type) && BY_TYPE[type].some((r) => r.name === name);
}

/** Older drafts stored funding as one free-text `fundingAvailable` ("Up to
 * $100K"). Map that onto the current yes/no + amount fields so those drafts
 * open, validate and publish correctly. Mirrors normalizeHubPayload on the
 * frontend. */
export function normalizeHubPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const p = { ...raw };
  if (p.hasFunding === undefined && typeof p.fundingAvailable === "string" && p.fundingAvailable.trim()) {
    const legacy = p.fundingAvailable.trim();
    p.hasFunding = !/^(none|no|n\/a|-)$/i.test(legacy);
    if (p.hasFunding && !p.fundingAmount) p.fundingAmount = legacy;
  }
  return p;
}

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

function checkRules(rules: Rule[], obj: Record<string, unknown>, where: string, errors: string[]): void {
  for (const r of rules) {
    if (r.when && obj[r.when.field] !== r.when.equals) continue;
    const v = obj[r.name];
    const label = `${where}${r.name}`;
    if (r.kind === "string") {
      if (isBlank(v)) { if (r.required) errors.push(`${label} is required`); continue; }
      if (typeof v !== "string") { errors.push(`${label} must be text`); continue; }
      if (r.max && v.length > r.max) errors.push(`${label} must be ${r.max} characters or fewer`);
      if (r.enum && !(r.enum as readonly string[]).includes(v)) errors.push(`${label} must be one of: ${r.enum.join(", ")}`);
    } else if (r.kind === "number") {
      if (isBlank(v)) { if (r.required) errors.push(`${label} is required`); continue; }
      if (typeof v !== "number" || !Number.isFinite(v)) { errors.push(`${label} must be a number`); continue; }
      if (r.min !== undefined && v < r.min) errors.push(`${label} must be at least ${r.min}`);
      if (r.max !== undefined && v > r.max) errors.push(`${label} must be at most ${r.max}`);
    } else if (r.kind === "boolean") {
      if (v !== undefined && v !== null && typeof v !== "boolean") errors.push(`${label} must be yes or no`);
    } else if (r.kind === "strings") {
      if (v === undefined || v === null) { if (r.required) errors.push(`${label} is required`); continue; }
      if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) { errors.push(`${label} must be a list of text values`); continue; }
      if (r.required && v.length === 0) errors.push(`${label} is required`);
    } else if (r.kind === "objects") {
      if (v === undefined || v === null) continue;
      if (!Array.isArray(v)) { errors.push(`${label} must be a list`); continue; }
      if (r.maxItems && v.length > r.maxItems) errors.push(`${label} can have at most ${r.maxItems} entries`);
      v.forEach((item, i) => {
        if (!item || typeof item !== "object") { errors.push(`${label}[${i + 1}] is invalid`); return; }
        checkRules(r.itemRules ?? [], item as Record<string, unknown>, `${label}[${i + 1}].`, errors);
      });
    }
  }
}

/** Validates a Hub submission payload against the shared + selected-type
 * rules. Returns human-readable problems ([] = valid). Fields belonging to
 * other types are ignored, never required. */
export function validateHubPayload(payload: Record<string, unknown>): string[] {
  const p = normalizeHubPayload(payload);
  const errors: string[] = [];
  checkRules(rulesFor(p.type), p, "", errors);
  return errors;
}

/** Type-specific answers that don't have their own column/table — stored
 * as-is (whitelisted to the selected type's rules) in hubs.typeDetails. */
const STORED_ELSEWHERE = new Set([
  "programs", "partnerships", "venturePortfolio",
  "status", "deadline", "stagesSupported", "hasFunding", "fundingType", "fundingAmount",
]);

export function hubTypeDetails(payload: Record<string, unknown>): Record<string, unknown> {
  const p = normalizeHubPayload(payload);
  if (!isHubType(p.type)) return {};
  const out: Record<string, unknown> = {};
  for (const r of BY_TYPE[p.type]) {
    if (STORED_ELSEWHERE.has(r.name)) continue;
    if (r.when && p[r.when.field] !== r.when.equals) continue; // hidden by its controlling answer
    const v = p[r.name];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[r.name] = v;
  }
  return out;
}
