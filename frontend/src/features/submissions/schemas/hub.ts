import { HUB_TYPES, CITIES, COUNTRIES, STAGES, HC_CATEGORIES } from "@/data/reference";
import type { EntitySchema, FieldDef, StepDef } from "../schema-types";

/** Hub / Enabler submission form: shared core fields + type-specific steps.
 *
 * `hubSchemaFor(type)` composes the schema for the selected Type from small
 * building blocks, so nine types don't mean nine copies of the form. The
 * shared steps (Overview, About & Focus, Contacts & Documents) are the same
 * for everyone; each type adds only its own steps between About and Contacts.
 * Field names, requirements and `condition`s mirror
 * backend/src/submissions/hub-types.ts, which validates on the server. */

export type HubType = (typeof HUB_TYPES)[number];

const SUPPORT_OPTIONS = ["Funding", "Mentorship", "Office Space", "Clinical Access", "Regulatory Guidance", "Market Access", "Technical Infrastructure", "Investor Introductions"] as const;
const OWNERSHIP = ["Private", "Government", "University", "Corporate", "Non-profit"] as const;
const OPEN_CLOSED = ["Open", "Closed"] as const;
const FORMATS = ["In-person", "Remote", "Hybrid"] as const;

/* ------------------------------------------------------------ field helpers */
type Opts = Partial<FieldDef>;
const text = (name: string, label: string, o: Opts = {}): FieldDef => ({ name, label, type: "text", ...o });
const area = (name: string, label: string, o: Opts = {}): FieldDef => ({ name, label, type: "textarea", full: true, ...o });
const num = (name: string, label: string, o: Opts = {}): FieldDef => ({ name, label, type: "number", min: 0, ...o });
const pick = (name: string, label: string, options: readonly string[], o: Opts = {}): FieldDef => ({ name, label, type: "select", options, ...o });
const chips = (name: string, label: string, options: readonly string[], o: Opts = {}): FieldDef => ({ name, label, type: "chips", options, full: true, ...o });
const tags = (name: string, label: string, o: Opts = {}): FieldDef => ({ name, label, type: "string-array", full: true, ...o });
/** Yes/No question (the app's toggle). */
const yn = (name: string, label: string, o: Opts = {}): FieldDef => ({ name, label, type: "boolean", ...o });
const when = (field: string, equals: unknown) => (p: Record<string, unknown>) => p[field] === equals;

const PROGRAM_FIELDS: FieldDef[] = [
  text("name", "Program Name", { required: true, maxLength: 150 }),
  text("type", "Program Type", { required: true, maxLength: 100 }),
  pick("status", "Status", OPEN_CLOSED, { required: true }),
  text("duration", "Duration", { required: true, maxLength: 60 }),
  text("location", "Location", { required: true, maxLength: 100 }),
  pick("format", "Format", FORMATS, { required: true }),
  text("deadline", "Deadline", { required: true, maxLength: 60 }),
  text("cohortSize", "Cohort Size", { required: true, maxLength: 40 }),
];
const programs: FieldDef = { name: "programs", label: "Programs", type: "repeater", itemLabel: "Program", maxItems: 20, full: true, itemFields: PROGRAM_FIELDS };
const partnerships: FieldDef = {
  name: "partnerships", label: "Partnerships", type: "repeater", itemLabel: "Partnership", maxItems: 20, full: true,
  itemFields: [
    text("type", "Type", { required: true, maxLength: 100 }),
    text("partnerName", "Partner Name", { required: true, maxLength: 150 }),
    { name: "description", label: "Description", type: "textarea", maxLength: 500 },
  ],
};

/** hasFunding → fundingType (+ amount): the Yes answer reveals the rest. */
const fundingFields = (amountLabel = "Funding Amount", o: { withType?: boolean } = {}): FieldDef[] => [
  yn("hasFunding", "Funding Available?"),
  ...(o.withType === false ? [] : [text("fundingType", "Funding Type", { required: true, maxLength: 100, placeholder: "e.g. Equity-free grant", condition: when("hasFunding", true) })]),
  text("fundingAmount", amountLabel, { maxLength: 100, placeholder: "e.g. Up to $100K", condition: when("hasFunding", true) }),
];

const step = (id: string, label: string, ...sections: (FieldDef[] | { title: string; fields: FieldDef[] })[]): StepDef => ({
  id, label, sections: sections.map((s) => (Array.isArray(s) ? { fields: s } : s)),
});

/* --------------------------------------------------------- shared steps */
const overviewStep: StepDef = {
  id: "overview", label: "Overview",
  sections: [
    { title: "Logo", fields: [{ name: "logoImageId", label: "Program Logo", type: "image-upload", full: true, hint: "Optional — shown on your directory card and profile once approved." }] },
    {
      fields: [
        text("name", "Organization / Program Name", { required: true, maxLength: 150 }),
        pick("type", "Type", HUB_TYPES, { required: true, hint: "The rest of this form adapts to the type you choose." }),
        pick("city", "City", CITIES, { required: true }),
        pick("country", "Country", COUNTRIES, { required: true }),
        num("founded", "Founded Year", { required: true, min: 1900, max: 2100 }),
        text("website", "Website", { required: true, maxLength: 200 }),
        text("operatingRegion", "Operating Region", { required: true, maxLength: 100 }),
        pick("ownershipType", "Ownership Type", OWNERSHIP, { required: true }),
      ],
    },
  ],
};

const aboutStep: StepDef = step("about", "About & Focus", [
  area("desc", "Short Description", { required: true, maxLength: 500 }),
  area("about", "About", { required: true, maxLength: 2000, rows: 4 }),
  chips("geographicCoverage", "Geographic Coverage", COUNTRIES),
  chips("healthcareFocus", "Healthcare Focus", HC_CATEGORIES),
  chips("support", "Support Offered", SUPPORT_OPTIONS),
]);

const BASE_DOCS = ["Program Brochure", "Partnership Deck", "Impact Report"];
const DOCS: Partial<Record<HubType, string[]>> = {
  "Accelerator": [...BASE_DOCS, "Cohort Agreement Template"],
  "Incubator": [...BASE_DOCS, "Cohort Agreement Template"],
  "Venture Studio": [...BASE_DOCS, "Venture Studio Deck", "Portfolio Deck", "Founder Partnership Information"],
  "Research Center": ["Research Collaboration Deck", "Technology Licensing Catalogue", "Research Capability Brochure"],
};

const contactsStep = (type?: HubType): StepDef => ({
  id: "contacts", label: "Contacts & Documents",
  sections: [
    {
      fields: [
        text("applicationUrl", "Application Link", { maxLength: 200 }),
        text("contactName", "Contact Name", { maxLength: 150 }),
        text("contactEmail", "Contact Email", { maxLength: 150 }),
        text("contactPhone", "Contact Phone", { maxLength: 40 }),
        text("contactLinkedin", "Contact LinkedIn", { maxLength: 200 }),
      ],
    },
    {
      title: "Documents",
      fields: [{ name: "documentChecklist", label: "Documents you can provide on request", type: "document-checklist", full: true, options: (type && DOCS[type]) || BASE_DOCS }],
    },
  ],
});

/* ------------------------------------------------- type-specific steps */
const TYPE_STEPS: Record<HubType, StepDef[]> = {
  "Accelerator": [
    step("accelerator", "Accelerator Details", [
      pick("status", "Application Status", OPEN_CLOSED),
      text("deadline", "Application Deadline", { required: true, maxLength: 60, placeholder: "e.g. Rolling, or a date" }),
      text("programDuration", "Program Duration", { required: true, maxLength: 60, placeholder: "e.g. 6 months" }),
      chips("stagesSupported", "Stages Supported", STAGES),
      text("cohortSize", "Cohort Size", { maxLength: 40 }),
      num("cohortsPerYear", "Number of Cohorts per Year"),
      pick("programFormat", "Program Format", FORMATS),
      yn("mentorshipAvailable", "Mentorship Available?"), yn("demoDay", "Demo Day?"), yn("investorIntroductions", "Investor Introductions?"),
      yn("clinicalAccess", "Clinical Access?"), yn("regulatorySupport", "Regulatory Support?"), yn("marketAccessSupport", "Market Access?"),
    ]),
    step("funding", "Funding", [
      ...fundingFields(),
      yn("equityRequired", "Equity Required?"),
      text("equityPercentage", "Equity Percentage", { maxLength: 40, placeholder: "e.g. 5–8%", condition: when("equityRequired", true) }),
    ]),
    step("programs", "Programs", [programs, partnerships]),
  ],
  "Incubator": [
    step("incubator", "Incubator Details", [
      text("incubationDuration", "Incubation Duration", { required: true, maxLength: 60 }),
      pick("status", "Application Status", OPEN_CLOSED),
      text("deadline", "Application Deadline", { required: true, maxLength: 60, placeholder: "e.g. Rolling, or a date" }),
      chips("stagesSupported", "Stages Supported", STAGES),
      yn("physicalWorkspace", "Physical Workspace Available?"), yn("laboratoryAccess", "Laboratory Access?"),
      yn("technicalInfrastructure", "Technical Infrastructure?"), yn("mentorshipAvailable", "Mentorship Available?"),
      yn("investorIntroductions", "Investor Introductions?"),
      area("graduationCriteria", "Graduation Criteria", { maxLength: 1000 }),
      num("companiesSupportedAnnually", "Number of Companies Supported Annually"),
    ]),
    step("funding", "Funding", fundingFields("", { withType: true }).filter((f) => f.name !== "fundingAmount")),
    step("programs", "Programs & Partnerships", [programs, partnerships]),
  ],
  "Venture Studio": [
    step("venture", "Venture Building", [
      pick("ventureStudioModel", "Venture Studio Model", ["Internal Idea Creation", "Founder Partnership", "Corporate Venture Building", "Mixed Model"], { required: true }),
      text("ideaSourcingModel", "Idea Sourcing Model", { maxLength: 300 }),
      chips("ventureStages", "Venture Stages", STAGES),
      yn("coFounderSupport", "Co-Founder Support?"), yn("productDevelopmentSupport", "Product Development Support?"),
      yn("regulatorySupport", "Regulatory Support?"), yn("clinicalValidationSupport", "Clinical Validation Support?"),
      yn("goToMarketSupport", "Go-to-Market Support?"), yn("fundraisingSupport", "Fundraising Support?"),
      yn("founderApplicationsAccepted", "Founder Applications Accepted?"),
    ]),
    step("investment", "Investment Model", [
      text("initialCapitalPerVenture", "Initial Capital per Venture", { maxLength: 100 }),
      yn("followOnInvestmentAvailable", "Follow-on Investment Available?"),
      text("equityModel", "Equity Model", { maxLength: 300 }),
      text("typicalEquityStake", "Typical Equity Stake", { maxLength: 60 }),
      num("venturesCreated", "Number of Ventures Created"), num("activeVentures", "Active Ventures"), num("exitedVentures", "Exited Ventures"),
    ]),
    step("portfolio", "Portfolio & Partnerships", [
      {
        name: "venturePortfolio", label: "Venture Portfolio", type: "repeater", itemLabel: "Venture", maxItems: 20, full: true,
        itemFields: [
          text("companyName", "Company Name", { required: true, maxLength: 150 }),
          pick("sector", "Healthcare Sector", HC_CATEGORIES, { required: true }),
          pick("stage", "Stage", STAGES),
          num("yearCreated", "Year Created", { min: 1900, max: 2100 }),
          pick("status", "Status", ["Active", "Exited", "Discontinued"]),
          text("website", "Website", { maxLength: 200 }),
        ],
      },
      partnerships,
    ]),
  ],
  "Innovation Hub": [
    step("hubmodel", "Hub Model & Facilities", [
      pick("hubModel", "Hub Model", ["Physical", "Virtual", "Hybrid"], { required: true }),
      yn("membershipAvailable", "Membership Available?"),
      text("membershipType", "Membership Type", { maxLength: 100, condition: when("membershipAvailable", true) }),
      chips("facilitiesAvailable", "Facilities Available", ["Coworking", "Private Offices", "Meeting Rooms", "Laboratories", "Prototyping Facilities", "Event Space", "Clinical Facilities"]),
    ]),
    step("community", "Programs & Community", [
      yn("innovationChallenges", "Innovation Challenges?"), yn("startupPrograms", "Startup Programs?"), yn("networkingEvents", "Networking Events?"),
      yn("mentorshipAvailable", "Mentorship?"), yn("corporateConnections", "Corporate Connections?"),
      yn("investorConnections", "Investor Connections?"), yn("governmentConnections", "Government Connections?"),
      num("annualEvents", "Annual Events"), num("companiesSupported", "Companies Supported"), num("communitySize", "Community / Member Size"),
      partnerships,
    ]),
  ],
  "Government Program": [
    step("gov", "Program Details", [
      text("governmentEntity", "Government Entity", { required: true, maxLength: 150 }),
      text("governmentAuthority", "Ministry / Authority / Agency", { maxLength: 150 }),
      area("programObjective", "Program Objective", { required: true, maxLength: 1000 }),
      chips("targetBeneficiaries", "Target Beneficiaries", ["Startups", "Researchers", "Hospitals", "Universities", "SMEs", "Corporates"]),
      area("eligibilityRequirements", "Eligibility Requirements", { maxLength: 1000 }),
      pick("status", "Application Status", OPEN_CLOSED),
      text("deadline", "Application Deadline", { required: true, maxLength: 60, placeholder: "e.g. Rolling, or a date" }),
      text("programDuration", "Program Duration", { maxLength: 60 }),
      tags("nationalStrategyAlignment", "National Strategy Alignment", { placeholder: "e.g. Saudi Vision 2030 — type and press Enter", hint: "Add every strategy the program aligns with, e.g. Saudi Vision 2030, Health Sector Transformation Program, National Biotechnology Strategy." }),
    ]),
    step("govfunding", "Funding & Support", [
      ...fundingFields("Funding Amount"),
      yn("regulatorySupport", "Regulatory Support?"), yn("marketAccessSupport", "Market Access Support?"),
      yn("procurementSupport", "Government Procurement Support?"), yn("clinicalValidationSupport", "Clinical Validation Support?"),
    ]),
  ],
  "University Program": [
    step("univ", "University Details", [
      text("universityName", "University Name", { required: true, maxLength: 150 }),
      text("college", "College / Faculty", { maxLength: 150 }),
      text("department", "Department", { maxLength: 150 }),
      pick("universityProgramType", "Program Type", ["Incubator", "Accelerator", "Entrepreneurship Center", "Technology Transfer", "Research Commercialization", "Innovation Lab"], { required: true }),
      chips("eligibleParticipants", "Eligible Participants", ["Students", "Faculty", "Researchers", "Alumni", "External Startups"]),
    ]),
    step("commercialization", "Commercialization & Support", [
      yn("researchCommercializationSupport", "Research Commercialization Support?"), yn("technologyTransferOffice", "Technology Transfer Office?"),
      yn("patentSupport", "Patent Support?"), yn("startupFormationSupport", "Startup Formation Support?"),
      yn("laboratoryAccess", "Laboratory Access?"), yn("clinicalResearchAccess", "Clinical Research Access?"),
      yn("hasFunding", "Funding Available?"),
      text("fundingAmount", "Grant Amount", { maxLength: 100, condition: when("hasFunding", true) }),
      num("startupsSupported", "Number of Startups Supported"), num("technologiesCommercialized", "Technologies / Patents Commercialized"),
      partnerships,
    ]),
  ],
  "Research Center": [
    step("research", "Research Capabilities", [
      text("parentInstitution", "Parent Institution", { required: true, maxLength: 150 }),
      tags("researchAreas", "Research Areas", { required: true }),
      chips("researchCapabilities", "Research Capabilities", ["Preclinical Research", "Clinical Research", "Genomics", "Diagnostics", "AI / Data Science", "Medical Devices", "Biotechnology", "Drug Discovery", "Other"]),
      tags("laboratories", "Laboratories / Facilities"),
      yn("clinicalTrialCapability", "Clinical Trial Capability?"), yn("biobankAvailable", "Biobank Available?"),
      yn("datasetAccess", "Dataset / Data Access?"), yn("technologyTransferOffice", "Technology Transfer Office?"),
    ], {
      title: "Research Programs",
      fields: [{
        name: "researchPrograms", label: "Research Programs", type: "repeater", itemLabel: "Research Program", maxItems: 20, full: true,
        itemFields: [
          text("name", "Research Program Name", { required: true, maxLength: 150 }),
          text("area", "Research Area", { maxLength: 100 }),
          text("leadDepartment", "Lead Department", { maxLength: 150 }),
          pick("status", "Status", ["Ongoing", "Completed", "Planned"]),
          { name: "description", label: "Description", type: "textarea", maxLength: 500 },
          yn("collaborationAvailable", "Collaboration Available?"),
        ],
      }],
    }),
    step("collab", "Collaboration & Commercialization", [
      yn("industryCollaboration", "Industry Collaboration Available?"), yn("startupCollaboration", "Startup Collaboration Available?"),
      yn("researchLicensing", "Research Licensing Available?"),
      num("publicationsCount", "Number of Publications"), num("patentsCount", "Number of Patents"),
      tags("technologiesForLicensing", "Technologies Available for Licensing"),
      partnerships,
    ]),
  ],
  "Corporate Innovation Program": [
    step("corporate", "Corporate Program", [
      text("parentCompany", "Parent Company", { required: true, maxLength: 150 }),
      text("industrySegment", "Healthcare / Industry Segment", { maxLength: 150 }),
      chips("startupEngagementModel", "Startup Engagement Model", ["Accelerator", "Open Innovation", "Venture Client", "Corporate Venture Capital", "Pilot / PoC", "Innovation Challenge"], { required: true }),
      chips("startupStagesAccepted", "Startup Stages Accepted", STAGES),
      pick("status", "Application Status", OPEN_CLOSED),
      text("deadline", "Application Deadline", { required: true, maxLength: 60, placeholder: "e.g. Rolling, or a date" }),
      tags("technologyAreas", "Technology Areas of Interest"),
      tags("innovationChallengeTopics", "Innovation Challenges"),
      chips("startupBenefits", "Startup Benefits", ["Funding", "Pilot Opportunities", "Distribution", "Clinical Access", "Market Access", "Mentorship", "Investment"]),
    ]),
    step("corpinvest", "Investment & Pilots", [
      yn("pilotOpportunities", "Pilot Opportunities?"), yn("procurementOpportunities", "Procurement Opportunities?"),
      yn("investmentAvailable", "Investment Available?"), yn("corporateVentureCapital", "Corporate Venture Capital Available?"),
      text("typicalInvestmentSize", "Typical Investment Size", { maxLength: 100, condition: when("corporateVentureCapital", true) }),
      partnerships,
    ]),
  ],
  "Ecosystem Enabler": [
    step("enabler", "Enabler Details", [
      pick("enablerCategory", "Enabler Category", ["Consulting", "Legal", "Regulatory", "Technology", "Funding Support", "Market Access", "Clinical Support", "Commercialization", "Networking", "Industry Association", "Government Support", "Talent", "Other"], { required: true }),
      tags("servicesOffered", "Services Offered", { required: true }),
      chips("targetAudience", "Target Audience", ["Startups", "Investors", "Researchers", "Corporates", "Hospitals", "Universities"]),
      yn("membershipRequired", "Membership Required?"),
      text("membershipType", "Membership Type", { maxLength: 100, condition: when("membershipRequired", true) }),
    ]),
    step("reach", "Reach & Introductions", [
      yn("eventsNetworking", "Events / Networking Available?"), yn("mentorshipAvailable", "Mentorship?"),
      yn("investorIntroductions", "Investor Introductions?"), yn("corporateIntroductions", "Corporate Introductions?"),
      yn("governmentIntroductions", "Government Introductions?"),
      num("organizationsSupported", "Number of Organizations Supported"),
      area("partnershipOpportunities", "Partnership Opportunities", { maxLength: 1000 }),
      partnerships,
    ]),
  ],
};

/* --------------------------------------------------------------- public API */
const HUB_BASE = {
  kind: "HUB" as const,
  label: "Hub / Enabler",
  route: "hub",
  description: "An accelerator, incubator, venture studio, government or university program, research center, corporate program or other enabler that supports healthcare innovation.",
  icon: "hubs",
};

export function isHubType(v: unknown): v is HubType {
  return typeof v === "string" && (HUB_TYPES as readonly string[]).includes(v);
}

/** Schema for the selected Type; with no (or an unknown) Type only the shared
 * steps show, and the type-specific steps appear as soon as one is chosen. */
export function hubSchemaFor(type: unknown): EntitySchema {
  const t = isHubType(type) ? type : undefined;
  return { ...HUB_BASE, steps: [overviewStep, aboutStep, ...(t ? TYPE_STEPS[t] : []), contactsStep(t)] };
}

export const hubSchema: EntitySchema = hubSchemaFor(undefined);

/** Names of every field the given type's form contains (shared + specific). */
export function hubFieldNames(type: unknown): Set<string> {
  const names = new Set<string>();
  for (const st of hubSchemaFor(type).steps) for (const sec of st.sections) for (const f of sec.fields) names.add(f.name);
  return names;
}

/** Older drafts stored funding as one free-text `fundingAvailable` ("Up to
 * $100K"). Map it onto hasFunding + fundingAmount so those drafts open with
 * the current fields filled in. Mirrors normalizeHubPayload on the backend. */
export function normalizeHubPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const p = { ...raw };
  if (p.hasFunding === undefined && typeof p.fundingAvailable === "string" && p.fundingAvailable.trim()) {
    const legacy = p.fundingAvailable.trim();
    p.hasFunding = !/^(none|no|n\/a|-)$/i.test(legacy);
    if (p.hasFunding && !p.fundingAmount) p.fundingAmount = legacy;
  }
  return p;
}

/** Keys to drop when switching from one type to another: everything the old
 * type's form had that the new one doesn't. Shared fields (and fields both
 * types use, like `deadline`) are never in this list. */
export function hubKeysRemovedByTypeChange(from: unknown, to: unknown): string[] {
  const next = hubFieldNames(to);
  return [...hubFieldNames(from)].filter((k) => !next.has(k));
}

/** Removes answers hidden by their controlling question (e.g. the funding
 * amount once "Funding Available?" is switched to No). Returns the cleaned
 * payload and the keys it removed. */
export function pruneHiddenHubFields(payload: Record<string, unknown>): { payload: Record<string, unknown>; removed: string[] } {
  const out = { ...payload };
  const removed: string[] = [];
  for (const st of hubSchemaFor(payload.type).steps) {
    for (const sec of st.sections) {
      for (const f of sec.fields) {
        if (f.condition && !f.condition(out) && out[f.name] !== undefined) { delete out[f.name]; removed.push(f.name); }
      }
    }
  }
  return { payload: out, removed };
}

/** Fits an AI extraction to the form: canonicalises the extracted Type, never
 * re-types a form whose Type is already chosen, and keeps only fields that
 * exist for the resulting type — so an accelerator deck can't leak
 * research-center answers into the draft. Nothing is invented. */
export function adaptHubExtraction(extracted: Record<string, unknown>, current: Record<string, unknown>): Record<string, unknown> {
  const out = { ...extracted };
  const raw = typeof out.type === "string" ? out.type.trim().toLowerCase() : "";
  const match = HUB_TYPES.find((t) => t.toLowerCase() === raw) ?? HUB_TYPES.find((t) => raw && raw.includes(t.toLowerCase()));
  if (match) out.type = match; else delete out.type;
  if (isHubType(current.type)) delete out.type;
  const type = isHubType(current.type) ? current.type : out.type;
  const allowed = hubFieldNames(type);
  for (const k of Object.keys(out)) if (!allowed.has(k)) delete out[k];
  return out;
}
